/**
 * Lead Scorer — classifies buyer type and scores lead quality (0-100).
 *
 * Uses Claude Haiku (fast tier) for classification,
 * then applies deterministic scoring based on buyer type + signals.
 *
 * Scoring formula (per dev_sprint_tasks Section 4.2.2):
 * - Buyer type weight: COLLECTOR=40, SERIOUS=45, TRADE=30, BROWSER=10, COMPETITOR=5
 * - Specificity: +20 for spec-level questions
 * - Urgency: +15 for viewing request, +10 for price negotiation
 * - Channel quality: +10 for phone, +5 for email, 0 for platform message
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a luxury automotive lead qualification expert. You classify buyer inquiries with precision based on language, intent, and behavior signals.

Classify each inquiry into EXACTLY ONE buyer type:
- COLLECTOR: Mentions collection, specific specs, provenance, option codes, limited editions, investment value
- SERIOUS: Requests viewing, asks about payment, delivery logistics, financing, returns quickly
- TRADE: Uses dealer language ("best price", "netto", "trade"), asks about bulk, mentions resale
- BROWSER: Vague questions, no urgency, "just looking", generic compliments
- COMPETITOR: Asks about sourcing, import process, margins, business model, supplier names`;

const CLASSIFY_PROMPT = (inquiry, vehicleName, source) => `Classify this customer inquiry for a ${vehicleName}.

Source channel: ${source}
Inquiry text: "${inquiry}"

Return ONLY valid JSON:
{
  "buyer_type": "COLLECTOR" or "SERIOUS" or "TRADE" or "BROWSER" or "COMPETITOR",
  "confidence": <float 0-1>,
  "language_detected": "DE" or "EN" or "FR" or "IT" or "NL",
  "urgency_signals": ["signal 1"] or [],
  "specificity_signals": ["signal 1"] or [],
  "red_flags": ["flag 1"] or [],
  "reasoning": "1 sentence classification reasoning"
}`;

const TYPE_WEIGHTS = { COLLECTOR: 40, SERIOUS: 45, TRADE: 30, BROWSER: 10, COMPETITOR: 5 };

/**
 * Score and classify a lead.
 */
export async function scoreAndClassify(inquiry, vehicleName, source = "platform") {
  let classification = null;

  if (isAIAvailable()) {
    classification = await callClaude({
      prompt: CLASSIFY_PROMPT(inquiry, vehicleName, source),
      system: SYSTEM_PROMPT,
      model: process.env.OPENROUTER_MODEL_FAST, // Haiku for speed
      jsonMode: true,
    });
  }

  // Fallback classification if AI unavailable
  if (!classification) {
    classification = classifyFallback(inquiry);
  }

  // Calculate score
  const typeWeight = TYPE_WEIGHTS[classification.buyer_type] || 10;

  const specificityBonus = (classification.specificity_signals?.length || 0) > 0 ? 20 : 0;

  let urgencyBonus = 0;
  const urgencySignals = classification.urgency_signals || [];
  if (urgencySignals.some((s) => s.toLowerCase().includes("viewing") || s.toLowerCase().includes("besichtigung"))) urgencyBonus += 15;
  if (urgencySignals.some((s) => s.toLowerCase().includes("price") || s.toLowerCase().includes("preis") || s.toLowerCase().includes("offer"))) urgencyBonus += 10;

  const channelBonus = source === "phone" ? 10 : source === "email" ? 5 : 0;

  const totalScore = Math.min(100, typeWeight + specificityBonus + urgencyBonus + channelBonus);

  // Determine priority routing
  let routing = "STANDARD";
  if (totalScore > 70) routing = "PRIORITY";
  else if (totalScore < 40) routing = "LOW";

  return {
    buyerType: classification.buyer_type,
    score: totalScore,
    routing,
    language: classification.language_detected || "DE",
    confidence: classification.confidence || 0.6,
    breakdown: {
      typeWeight,
      specificityBonus,
      urgencyBonus,
      channelBonus,
    },
    signals: {
      urgency: classification.urgency_signals || [],
      specificity: classification.specificity_signals || [],
      redFlags: classification.red_flags || [],
    },
    reasoning: classification.reasoning || "Classified based on text analysis",
  };
}

function classifyFallback(inquiry) {
  const lower = inquiry.toLowerCase();
  let type = "BROWSER";
  if (lower.includes("collection") || lower.includes("provenance") || lower.includes("matching numbers")) type = "COLLECTOR";
  else if (lower.includes("viewing") || lower.includes("besichtigung") || lower.includes("payment") || lower.includes("delivery")) type = "SERIOUS";
  else if (lower.includes("best price") || lower.includes("netto") || lower.includes("trade")) type = "TRADE";
  else if (lower.includes("sourcing") || lower.includes("import") || lower.includes("margin")) type = "COMPETITOR";

  return {
    buyer_type: type,
    confidence: 0.5,
    language_detected: /[äöüß]/.test(inquiry) ? "DE" : "EN",
    urgency_signals: [],
    specificity_signals: [],
    red_flags: [],
    reasoning: "Keyword-based fallback classification",
  };
}
