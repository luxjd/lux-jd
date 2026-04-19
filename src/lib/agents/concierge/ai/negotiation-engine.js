/**
 * Negotiation Engine — handles price discussions within authority limits.
 *
 * Authority levels (from PRD):
 *   Asking to -5%:  Accept immediately
 *   -5% to -8%:    Counter at -5%
 *   -8% to -10%:   Escalate to human with recommendation
 *   Below -10%:    Politely decline, offer to notify if price drops
 *   Below -15%:    Flag as wholesale, route to Orchestrator
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatEur, formatNumber } from "@/lib/format";

/**
 * Evaluate an offer against the listing price.
 *
 * Spec §6.6.2 point 4: offers are evaluated "against the minimum price floor
 * set by the Orchestrator". The floor is a hard constraint — an offer below
 * the floor cannot be auto-accepted or auto-countered, regardless of the
 * discount-from-asking %.
 */
export function evaluateOffer(offerPrice, askingPrice, floorPrice = null) {
  const discountPct = ((askingPrice - offerPrice) / askingPrice) * 100;
  const floor = floorPrice || Math.round(askingPrice * 0.85);
  const belowFloor = offerPrice < floor;

  let action, authority, counterOffer, reasoning;

  // Hard-floor override: any offer under the Orchestrator floor must escalate.
  // The concierge has no authority to accept or counter below floor — even a
  // nominal 2% discount would be blocked if the floor says so.
  if (belowFloor) {
    action = "ESCALATE";
    authority = "HUMAN_REQUIRED";
    // Counter no lower than the floor. Still try to close near asking when the
    // offer is only modestly below floor.
    counterOffer = Math.max(floor, Math.round(askingPrice * 0.92));
    reasoning = `Offer ${formatEur(offerPrice)} is below the Orchestrator-set floor of ${formatEur(floor)}. Escalating — concierge has no authority to accept below floor. Suggested counter: ${formatEur(counterOffer)}.`;
  } else if (discountPct <= 0) {
    action = "ACCEPT";
    authority = "AUTO";
    reasoning = "Offer at or above asking price — accept immediately.";
  } else if (discountPct <= 5) {
    action = "ACCEPT";
    authority = "AUTO";
    reasoning = `Offer at -${discountPct.toFixed(1)}% — within auto-accept authority and above floor.`;
  } else if (discountPct <= 8) {
    action = "COUNTER";
    authority = "AUTO";
    // Counter at -5%, clamped to floor so we never counter below it.
    counterOffer = Math.max(Math.round(askingPrice * 0.95), floor);
    reasoning = `Offer at -${discountPct.toFixed(1)}% — countering at ${formatEur(counterOffer)}${counterOffer === floor ? " (floor-clamped)" : " (-5%)"}.`;
  } else if (discountPct <= 10) {
    action = "ESCALATE";
    authority = "HUMAN_REQUIRED";
    counterOffer = Math.max(Math.round(askingPrice * 0.92), floor);
    reasoning = `Offer at -${discountPct.toFixed(1)}% — exceeds auto-authority. Escalating to human. Suggested counter: ${formatEur(counterOffer)} (-8% or floor).`;
  } else if (discountPct <= 15) {
    action = "DECLINE";
    authority = "AUTO";
    reasoning = `Offer at -${discountPct.toFixed(1)}% — below acceptable range. Politely declining.`;
  } else {
    action = "WHOLESALE_FLAG";
    authority = "ORCHESTRATOR";
    reasoning = `Offer at -${discountPct.toFixed(1)}% — potential wholesale buyer. Routing to Orchestrator.`;
  }

  return {
    offerPrice,
    askingPrice,
    discountPct: Number(discountPct.toFixed(1)),
    action,
    authority,
    counterOffer: counterOffer || null,
    reasoning,
    belowFloor,
    floorPrice: floor,
    floorSource: floorPrice ? "orchestrator" : "fallback_85pct",
  };
}

/**
 * Generate a negotiation response using Claude.
 */
export async function generateNegotiationResponse(evaluation, vehicle, language = "DE") {
  if (!isAIAvailable()) {
    return {
      response_text: language === "DE"
        ? `Vielen Dank für Ihr Angebot. ${evaluation.action === "ACCEPT" ? "Wir nehmen Ihr Angebot gerne an." : evaluation.action === "COUNTER" ? `Wir können Ihnen das Fahrzeug für ${formatEur(evaluation.counterOffer)} anbieten.` : "Leider können wir dieses Angebot nicht akzeptieren."}`
        : `Thank you for your offer. ${evaluation.action === "ACCEPT" ? "We are happy to accept." : evaluation.action === "COUNTER" ? `We can offer the vehicle at ${formatEur(evaluation.counterOffer)}.` : "Unfortunately, we are unable to accept this offer."}`,
      aiPowered: false,
    };
  }

  const result = await callClaude({
    prompt: `Generate a ${language === "DE" ? "German" : "English"} negotiation response for a ${vehicle.make} ${vehicle.model} ${vehicle.year}.

Asking price: €${formatNumber(evaluation.askingPrice)}
Customer offer: €${formatNumber(evaluation.offerPrice)} (-${evaluation.discountPct}%)
Our action: ${evaluation.action}
${evaluation.counterOffer ? `Counter offer: €${formatNumber(evaluation.counterOffer)}` : ""}

${evaluation.action === "ACCEPT" ? "Write a warm acceptance. Discuss next steps (payment, handover)." :
  evaluation.action === "COUNTER" ? "Politely counter. Justify our price with vehicle quality, specification, market positioning. Be firm but friendly." :
  evaluation.action === "DECLINE" ? "Politely decline. Express that the price reflects the vehicle's exceptional quality. Offer to notify if circumstances change." :
  evaluation.action === "ESCALATE" ? "Acknowledge the offer professionally. Say you'll consult with management and respond within 24 hours." :
  "Acknowledge the inquiry. Suggest this may be suitable for a dealer/wholesale arrangement."}

Return ONLY valid JSON:
{
  "response_text": "<100-200 word response in ${language === "DE" ? "German (Sie form)" : "English"}>",
  "tone": "FIRM" or "WARM" or "PROFESSIONAL",
  "next_steps": ["step 1", "step 2"]
}`,
    system: "You are an expert luxury car sales negotiator. Professional, firm but fair. Never desperate.",
    jsonMode: true,
  });

  return { ...(result || {}), evaluation, aiPowered: true, generatedAt: new Date().toISOString() };
}
