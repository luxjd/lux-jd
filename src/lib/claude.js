/**
 * LLM client using OpenRouter API.
 *
 * OpenRouter provides access to Claude, GPT-4, Gemini, Llama, and many more
 * through a single API key with OpenAI-compatible format.
 *
 * IMPORTANT: Vision MUST use Sonnet 4.6 — older models (Sonnet 4, Opus 4)
 * misread auction sheet digits and colors.
 *
 * Get your key at: https://openrouter.ai/keys
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Model mapping — Sonnet 4.6 is required for accurate auction sheet OCR
const MODELS = {
  vision: process.env.OPENROUTER_MODEL_VISION || "anthropic/claude-sonnet-4-6",
  reasoning: process.env.OPENROUTER_MODEL_REASONING || "anthropic/claude-sonnet-4-6",
  fast: process.env.OPENROUTER_MODEL_FAST || "anthropic/claude-haiku-4.5",
};

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || "";
}

export function isAIAvailable() {
  return !!getApiKey();
}

/**
 * Call LLM with text prompt via OpenRouter. Returns parsed JSON or raw text.
 */
export async function callClaude({
  prompt,
  system = "",
  model = null,
  maxTokens = 4096,
  jsonMode = true,
}) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const modelId = model || MODELS.reasoning;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://luxjd.com",
      "X-Title": "LuxJD Valuation Agent",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

  if (jsonMode) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }

  return text;
}

/**
 * Call LLM Vision with images via OpenRouter.
 * images: [{ data: base64String, mediaType: "image/jpeg" }]
 */
export async function callClaudeVision({
  prompt,
  images = [],
  system = "",
  model = null,
  maxTokens = 4096,
}) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const modelId = model || MODELS.vision;

  // Build multimodal content array
  const content = [];

  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mediaType || "image/jpeg"};base64,${img.data}`,
      },
    });
  }

  content.push({ type: "text", text: prompt });

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content });

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://luxjd.com",
      "X-Title": "LuxJD Valuation Agent",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter Vision API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";

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
