/**
 * Escalation Handler — detects triggers that require immediate human intervention.
 *
 * Per PRD Section 6.6.3, these triggers are NON-NEGOTIABLE:
 * 1. Offer below 90% of asking
 * 2. Part-exchange / trade-in proposed
 * 3. Independent mechanical inspection requested
 * 4. Any complaint or dissatisfaction
 * 5. Legal / warranty questions
 * 6. Vehicle history requiring manufacturer DB
 * 7. Threatening or fraudulent communication
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatEur, formatNumber } from "@/lib/format";

// Rule-based keyword detection (fast, always works)
const ESCALATION_RULES = [
  {
    trigger: "PART_EXCHANGE",
    keywords: ["part exchange", "trade-in", "trade in", "tausch", "eintausch", "in zahlung", "inzahlungnahme"],
    priority: "HIGH",
    reason: "Customer proposed part-exchange — complex valuation required",
  },
  {
    trigger: "INSPECTION_REQUEST",
    keywords: ["independent inspection", "unabhängige prüfung", "eigenen gutachter", "own mechanic", "third party inspection", "sachverständig"],
    priority: "MEDIUM",
    reason: "Customer requested independent mechanical inspection — coordinate access",
  },
  {
    trigger: "COMPLAINT",
    keywords: ["disappointed", "enttäuscht", "unhappy", "unzufrieden", "problem", "issue", "beschwerde", "complaint", "not as described", "misleading"],
    priority: "CRITICAL",
    reason: "Customer expressed dissatisfaction — immediate human attention required",
  },
  {
    trigger: "LEGAL_WARRANTY",
    keywords: ["warranty", "garantie", "gewährleistung", "widerrufsrecht", "return", "rückgabe", "lawyer", "anwalt", "legal", "rechtlich", "consumer rights"],
    priority: "CRITICAL",
    reason: "Legal/warranty question — requires qualified response, potential liability",
  },
  {
    trigger: "THREATENING",
    keywords: ["threat", "sue", "klagen", "anzeige", "report you", "authorities", "behörden", "fraud", "betrug", "scam"],
    priority: "CRITICAL",
    reason: "Threatening or fraud-related communication — immediate human review",
  },
  {
    trigger: "HISTORY_REQUEST",
    keywords: ["manufacturer history", "herstellerhistorie", "factory records", "werkstatthistorie", "carfax", "build sheet"],
    priority: "MEDIUM",
    reason: "Vehicle history requiring manufacturer database access",
  },
];

/**
 * Check an inquiry for escalation triggers.
 * Uses both keyword matching (fast) and Claude analysis (thorough).
 */
export async function checkEscalation(inquiry, offerPrice = null, askingPrice = null) {
  const lower = inquiry.toLowerCase();
  const triggers = [];

  // ─── Rule-based detection (instant) ───
  for (const rule of ESCALATION_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      triggers.push({
        trigger: rule.trigger,
        priority: rule.priority,
        reason: rule.reason,
        detectedBy: "KEYWORD",
      });
    }
  }

  // ─── Price-based escalation ───
  if (offerPrice && askingPrice && offerPrice < askingPrice * 0.9) {
    triggers.push({
      trigger: "LOW_OFFER",
      priority: "HIGH",
      reason: `Offer ${formatEur(offerPrice)} is below 90% of asking ${formatEur(askingPrice)} (-${(((askingPrice - offerPrice) / askingPrice) * 100).toFixed(1)}%)`,
      detectedBy: "PRICE_RULE",
    });
  }

  // ─── AI-powered sentiment analysis (catches subtle triggers) ───
  if (isAIAvailable() && triggers.length === 0) {
    const aiCheck = await callClaude({
      prompt: `Analyze this customer message for any escalation triggers. The customer is inquiring about a luxury vehicle listed at €${askingPrice != null ? formatNumber(askingPrice) : "N/A"}.

Message: "${inquiry}"

Check for: complaints, legal language, threats, part-exchange proposals, inspection requests, or anything a sales manager should personally handle.

Return ONLY valid JSON:
{
  "needs_escalation": <boolean>,
  "trigger": "<trigger type or null>",
  "priority": "CRITICAL" or "HIGH" or "MEDIUM" or "LOW",
  "reason": "<why escalation is needed>",
  "sentiment": "POSITIVE" or "NEUTRAL" or "NEGATIVE" or "HOSTILE"
}`,
      system: "You are a customer service escalation detection system for a luxury car dealership.",
      model: process.env.OPENROUTER_MODEL_FAST,
      jsonMode: true,
    });

    if (aiCheck?.needs_escalation) {
      triggers.push({
        trigger: aiCheck.trigger || "AI_DETECTED",
        priority: aiCheck.priority || "MEDIUM",
        reason: aiCheck.reason || "AI detected escalation need",
        sentiment: aiCheck.sentiment,
        detectedBy: "AI_ANALYSIS",
      });
    }
  }

  const shouldEscalate = triggers.length > 0;
  const highestPriority = triggers.reduce((max, t) =>
    t.priority === "CRITICAL" ? "CRITICAL" : t.priority === "HIGH" && max !== "CRITICAL" ? "HIGH" : max,
    triggers.length > 0 ? triggers[0].priority : "NONE"
  );

  return {
    shouldEscalate,
    triggers,
    highestPriority: shouldEscalate ? highestPriority : "NONE",
    triggerCount: triggers.length,
    checkedAt: new Date().toISOString(),
  };
}
