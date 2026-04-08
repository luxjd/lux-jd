/**
 * Concierge Orchestrator — handles the full inquiry-to-response pipeline.
 *
 * Pipeline:
 * 1. Receive inquiry
 * 2. Check for escalation triggers (instant)
 * 3. Classify buyer + score lead
 * 4. Generate personalized response
 * 5. If price offer: evaluate + generate negotiation response
 * 6. Create/update lead record
 * 7. Log conversation
 */

import { scoreAndClassify } from "./lead-scorer";
import { generateResponse } from "./auto-responder";
import { evaluateOffer, generateNegotiationResponse } from "./negotiation-engine";
import { checkEscalation } from "./escalation-handler";
import { saveLead, addMessage, addEscalation, updateAgentStatus, getAllLeads } from "../storage";
import { sendResponseEmail, isEmailConfigured } from "../email-service";

/**
 * Handle an incoming customer inquiry — the main entry point.
 *
 * @param {object} params
 * @param {string} params.inquiry — customer message text
 * @param {string} params.customerName — buyer name
 * @param {string} params.customerEmail — buyer email
 * @param {string} params.customerPhone — buyer phone (optional)
 * @param {object} params.vehicle — vehicle they're inquiring about
 * @param {string} params.source — "mobile.de", "email", "phone", etc.
 * @param {number} params.offerPrice — if they made a price offer (optional)
 * @returns {object} Complete response package
 */
export async function handleInquiry({
  inquiry,
  customerName,
  customerEmail,
  customerPhone = null,
  vehicle,
  source = "platform",
  offerPrice = null,
}) {
  const startTime = Date.now();
  updateAgentStatus({ status: "PROCESSING" });

  const askingPrice = vehicle.listingPrice || vehicle.currentPrice || vehicle.estimatedSaleEur;
  const vehicleName = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;

  // ─── Step 1: Check escalation (instant) ───
  const escalation = await checkEscalation(inquiry, offerPrice, askingPrice);

  if (escalation.shouldEscalate && escalation.highestPriority === "CRITICAL") {
    // Critical escalation — do NOT auto-respond, go straight to human
    const leadId = `lead-${Date.now()}`;
    const lead = saveLead({
      id: leadId,
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      vehicle: vehicleName,
      vehicleId: vehicle.id,
      source,
      status: "ESCALATED",
      score: 0,
      buyerType: "UNKNOWN",
      escalated: true,
      escalationReason: escalation.triggers.map((t) => t.reason).join("; "),
      createdAt: new Date().toISOString(),
    });

    addMessage(leadId, { role: "customer", text: inquiry, source });
    addEscalation({ leadId, customerName, vehicle: vehicleName, triggers: escalation.triggers });

    updateAgentStatus({ status: "ONLINE", lastAction: `ESCALATED: ${vehicleName} — ${escalation.triggers[0]?.trigger}` });

    return {
      leadId,
      action: "ESCALATED",
      escalation,
      response: null,
      message: "Critical escalation — routed to human operator immediately. No auto-response sent.",
      duration: Date.now() - startTime,
    };
  }

  // ─── Step 2: Classify and score lead ───
  const classification = await scoreAndClassify(inquiry, vehicleName, source);

  // ─── Step 3: Generate response OR negotiation response ───
  let response;
  let negotiation = null;

  if (offerPrice) {
    // Handle as negotiation
    const evaluation = evaluateOffer(offerPrice, askingPrice);
    negotiation = evaluation;

    if (evaluation.action === "ESCALATE") {
      // Non-critical escalation — generate acknowledgment
      response = await generateNegotiationResponse(evaluation, vehicle, classification.language);
      escalation.shouldEscalate = true;
      escalation.triggers.push({
        trigger: "PRICE_NEGOTIATION",
        priority: "HIGH",
        reason: evaluation.reasoning,
        detectedBy: "NEGOTIATION_ENGINE",
      });
    } else {
      response = await generateNegotiationResponse(evaluation, vehicle, classification.language);
    }
  } else {
    // Standard inquiry response
    response = await generateResponse(inquiry, vehicle, classification.buyerType, classification.language);
  }

  // ─── Step 4: Create/update lead ───
  const leadId = `lead-${Date.now()}`;
  const lead = saveLead({
    id: leadId,
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
    vehicle: vehicleName,
    vehicleId: vehicle.id,
    source,
    status: escalation.shouldEscalate ? "ESCALATED" : classification.routing === "PRIORITY" ? "QUALIFIED" : "NEW",
    score: classification.score,
    buyerType: classification.buyerType,
    language: classification.language,
    escalated: escalation.shouldEscalate,
    escalationReason: escalation.shouldEscalate ? escalation.triggers.map((t) => t.reason).join("; ") : null,
    suggestedAction: response.suggested_next_action,
    offerPrice: offerPrice || null,
    negotiation: negotiation || null,
    createdAt: new Date().toISOString(),
  });

  // ─── Step 5: Log conversation ───
  addMessage(leadId, { role: "customer", text: inquiry, source });
  if (response.response_text) {
    addMessage(leadId, { role: "concierge", text: response.response_text, aiPowered: response.aiPowered });
  }

  if (escalation.shouldEscalate) {
    addEscalation({ leadId, customerName, vehicle: vehicleName, triggers: escalation.triggers });
  }

  // ─── Step 6: Send email with response + photos ───
  let emailResult = null;
  if (customerEmail && response.response_text) {
    const includePhotos = response.suggested_next_action === "SEND_PHOTOS" ||
      inquiry.toLowerCase().match(/photo|foto|bild|image|picture/);
    try {
      emailResult = await sendResponseEmail({
        customerEmail,
        customerName,
        responseText: response.response_text,
        vehicle,
        language: classification.language || "EN",
        includePhotos: !!includePhotos,
      });
    } catch (err) {
      emailResult = { sent: false, reason: err.message };
    }
  }

  // ─── Update agent status ───
  const allLeads = getAllLeads();
  updateAgentStatus({
    status: "ONLINE",
    lastAction: `Responded to ${customerName} about ${vehicleName}`,
    lastActionTimestamp: new Date().toISOString(),
    totalLeads: allLeads.leads?.length || 0,
    openLeads: allLeads.leads?.filter((l) => !["CONVERTED", "LOST"].includes(l.status)).length || 0,
    escalatedCount: allLeads.leads?.filter((l) => l.escalated).length || 0,
    avgResponseTime: Date.now() - startTime,
  });

  return {
    leadId,
    action: escalation.shouldEscalate ? "RESPONDED_AND_ESCALATED" : "RESPONDED",
    lead,
    classification,
    response,
    negotiation,
    escalation,
    email: emailResult,
    duration: Date.now() - startTime,
    aiPowered: response.aiPowered !== false,
  };
}
