/**
 * LLM client using OpenRouter (OpenAI-compatible surface over Anthropic).
 *
 * OpenRouter forwards Claude requests to Anthropic while accepting the
 * OpenAI chat-completions shape. Claude-specific features (extended
 * thinking, tool-use, prompt caching, provider pinning) pass through
 * via OpenRouter's unified-reasoning / cache_control / provider params.
 *
 * Defaults target claude.ai-parity for the valuation auction-sheet flow:
 *   - Opus 4.7 for vision + reasoning
 *   - Extended thinking (budget_tokens 8000) available per-call
 *   - Tool-use for schema-enforced structured output (no regex scraping)
 *   - Prompt caching on the system prompt
 *   - Provider pinned to Anthropic (no fallback reseller variance)
 *
 * Get your key at: https://openrouter.ai/keys
 */

import { retryWithBackoff } from "@/lib/agents/valuation/retry-with-backoff";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Model mapping — Opus 4.7 for vision/reasoning (auction sheet OCR needs it),
// Haiku 4.5 for low-stakes fast calls.
const MODELS = {
  vision:    process.env.OPENROUTER_MODEL_VISION    || "anthropic/claude-opus-4-7",
  reasoning: process.env.OPENROUTER_MODEL_REASONING || "anthropic/claude-opus-4-7",
  fast:      process.env.OPENROUTER_MODEL_FAST      || "anthropic/claude-haiku-4.5",
};

// Provider pin — keeps responses consistent by routing only to Anthropic
// direct (not a third-party reseller behind OpenRouter). Set
// OPENROUTER_ALLOW_FALLBACKS=1 to relax.
const PROVIDER_PIN = {
  order: ["Anthropic"],
  allow_fallbacks: process.env.OPENROUTER_ALLOW_FALLBACKS === "1",
};

// ── LLM cost tracking ──────────────────────────────────────────────
const _usageLog = [];

export function getUsageLog() { return _usageLog; }
export function resetUsageLog() { _usageLog.length = 0; }
export function getTotalCost() {
  return _usageLog.reduce((sum, entry) => sum + entry.estimatedCost, 0);
}

function _trackUsage(data, modelId) {
  try {
    const usage = data.usage || {};
    const costPerInputToken = modelId.includes("opus") ? 15/1e6 : modelId.includes("haiku") ? 0.8/1e6 : 3/1e6;
    const costPerOutputToken = modelId.includes("opus") ? 75/1e6 : modelId.includes("haiku") ? 4/1e6 : 15/1e6;
    const estimatedCost = (usage.prompt_tokens || 0) * costPerInputToken + (usage.completion_tokens || 0) * costPerOutputToken;

    _usageLog.push({
      timestamp: Date.now(),
      model: modelId,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      estimatedCost: Math.round(estimatedCost * 1e6) / 1e6,
      caller: new Error().stack?.split('\n')[2]?.trim() || 'unknown',
    });

    console.log(`[llm] ${modelId.split('/').pop()} ${usage.prompt_tokens || '?'}+${usage.completion_tokens || '?'} tokens = $${estimatedCost.toFixed(4)}`);
  } catch { /* usage tracking is non-blocking */ }
}
// ───────────────────────────────────────────────────────────────────

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

export function isAIAvailable() {
  return !!getApiKey();
}

/**
 * Parse the response body. Prefer tool_calls (when a tool was requested),
 * fall back to regex-extracting JSON from free text. Returns:
 *   - parsed object if tool_calls or JSON block found
 *   - raw text if no JSON structure present
 *   - null on hard parse failure
 */
function parseResponse(data, toolsRequested) {
  const msg = data.choices?.[0]?.message;
  if (!msg) return null;

  if (toolsRequested && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    const args = msg.tool_calls[0]?.function?.arguments;
    if (!args) return null;
    try {
      return typeof args === "string" ? JSON.parse(args) : args;
    } catch {
      return null;
    }
  }

  const text = msg.content || "";
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return text;
}

function buildSystemMessage(system, cacheSystem) {
  if (!system) return null;
  if (!cacheSystem) return { role: "system", content: system };
  // cache_control passes through to Anthropic prompt caching via OpenRouter.
  return {
    role: "system",
    content: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
  };
}

/**
 * Call LLM with text prompt. Returns parsed JSON, raw text, or null.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.system]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens=4096]
 * @param {boolean} [opts.jsonMode=true]         Parse JSON from text response.
 * @param {Array}   [opts.tools]                 Tool definitions (OpenAI shape).
 * @param {string|object} [opts.toolChoice]      "auto" or {type:"function", function:{name}}.
 * @param {object}  [opts.reasoning]             {max_tokens: N} enables extended thinking.
 * @param {boolean} [opts.cacheSystem=false]     Prompt-cache the system message.
 */
export async function callClaude({
  prompt,
  system = "",
  model = null,
  maxTokens = 4096,
  jsonMode = true,
  tools = null,
  toolChoice = "auto",
  reasoning = null,
  cacheSystem = false,
}) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const modelId = model || MODELS.reasoning;

  const messages = [];
  const sysMsg = buildSystemMessage(system, cacheSystem);
  if (sysMsg) messages.push(sysMsg);
  messages.push({ role: "user", content: prompt });

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    messages,
    provider: PROVIDER_PIN,
  };
  if (reasoning) {
    body.reasoning = reasoning;
    // Anthropic requires temperature=1 when thinking is enabled.
    body.temperature = 1;
  }
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const data = await retryWithBackoff(async () => {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://luxjd.com",
        "X-Title": "LuxJD Valuation Agent",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      const e = new Error(`OpenRouter API error ${res.status}: ${err.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }, { label: `callClaude(${modelId.split("/").pop()})` });

  _trackUsage(data, modelId);
  const parsed = parseResponse(data, !!tools);

  if (jsonMode && typeof parsed === "string") return null;
  return parsed;
}

/**
 * Call LLM Vision with images.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {Array<{data:string, mediaType:string}>} opts.images
 * @param {string} [opts.system]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens=4096]         Bump to ≥8192 when reasoning is on.
 * @param {Array}  [opts.tools]                  Tool definitions for structured output.
 * @param {string|object} [opts.toolChoice="auto"]
 * @param {object} [opts.reasoning]              {max_tokens: N} enables extended thinking.
 * @param {boolean}[opts.cacheSystem=false]      Prompt-cache the system message.
 */
export async function callClaudeVision({
  prompt,
  images = [],
  system = "",
  model = null,
  maxTokens = 4096,
  tools = null,
  toolChoice = "auto",
  reasoning = null,
  cacheSystem = false,
}) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const modelId = model || MODELS.vision;

  const content = [];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType || "image/jpeg"};base64,${img.data}` },
    });
  }
  content.push({ type: "text", text: prompt });

  const messages = [];
  const sysMsg = buildSystemMessage(system, cacheSystem);
  if (sysMsg) messages.push(sysMsg);
  messages.push({ role: "user", content });

  const body = {
    model: modelId,
    max_tokens: maxTokens,
    messages,
    provider: PROVIDER_PIN,
  };
  if (reasoning) {
    body.reasoning = reasoning;
    body.temperature = 1;
  }
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const data = await retryWithBackoff(async () => {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://luxjd.com",
        "X-Title": "LuxJD Valuation Agent",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      const e = new Error(`OpenRouter Vision API error ${res.status}: ${err.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }, { label: `callClaudeVision(${modelId.split("/").pop()})` });

  _trackUsage(data, modelId);
  return parseResponse(data, !!tools);
}
