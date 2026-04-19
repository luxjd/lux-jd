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
import { saveLead, addMessage, addEscalation, updateAgentStatus, getAllLeads, recordSlaMetric } from "../storage";
import { sendResponseEmail, getVehiclePhotos } from "../email-service";

const SLA_TARGET_MS = 10 * 60 * 1000; // Spec §6.6.2 point 1: "Within 10 minutes"

function resolveFloorPrice(vehicle, askingPrice) {
  // Spec §6.6.2 point 4: "minimum price floor set by the Orchestrator".
  // Read in priority order from the listing/vehicle data, fall back to 85%
  // of asking only if no authoritative floor is plumbed through.
  if (vehicle?.pricing?.floor_price_eur) return vehicle.pricing.floor_price_eur;
  if (vehicle?.floorPriceEur) return vehicle.floorPriceEur;
  if (vehicle?.landedCostEur != null && vehicle?.minMarginEur != null) {
    return vehicle.landedCostEur + vehicle.minMarginEur;
  }
  if (vehicle?.pricing?.wholesale_price_eur) return vehicle.pricing.wholesale_price_eur;
  return Math.round(askingPrice * 0.85);
}

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
  inquiryReceivedAt = null,
}) {
  const startTime = Date.now();
  // SLA clock starts when the inquiry was actually received, not when we
  // started processing. Caller should pass `inquiryReceivedAt` from the
  // platform webhook / email poll; otherwise assume "just now".
  const receivedAtMs = inquiryReceivedAt ? new Date(inquiryReceivedAt).getTime() : startTime;
  await updateAgentStatus({ status: "PROCESSING" });

  const askingPrice = vehicle.listingPrice || vehicle.currentPrice || vehicle.estimatedSaleEur;
  const vehicleName = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;

  // ─── Step 1: Check escalation (instant) ───
  const escalation = await checkEscalation(inquiry, offerPrice, askingPrice);

  if (escalation.shouldEscalate && escalation.highestPriority === "CRITICAL") {
    // Critical escalation — do NOT auto-respond, go straight to human
    const leadId = `lead-${Date.now()}`;
    const responseDelayMs = Date.now() - receivedAtMs;
    const slaBreached = responseDelayMs > SLA_TARGET_MS;

    const lead = await saveLead({
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

    await addMessage(leadId, { role: "customer", text: inquiry, source });
    await addEscalation({ leadId, customerName, vehicle: vehicleName, triggers: escalation.triggers });
    await recordSlaMetric(leadId, {
      inquiryReceivedAt: new Date(receivedAtMs).toISOString(),
      respondedAt: new Date().toISOString(),
      responseDelayMs,
      slaTargetMs: SLA_TARGET_MS,
      slaBreached,
      path: "critical_escalation",
    });
    if (slaBreached) {
      console.warn(`Concierge SLA breach on ${leadId}: ${Math.round(responseDelayMs / 60000)} min (target 10 min)`);
    }

    await updateAgentStatus({ status: "ONLINE", lastAction: `ESCALATED: ${vehicleName} — ${escalation.triggers[0]?.trigger}` });

    return {
      leadId,
      action: "ESCALATED",
      escalation,
      response: null,
      message: "Critical escalation — routed to human operator immediately. No auto-response sent.",
      sla: { responseDelayMs, slaBreached, targetMs: SLA_TARGET_MS },
      duration: Date.now() - startTime,
    };
  }

  // ─── Step 2: Classify and score lead ───
  const classification = await scoreAndClassify(inquiry, vehicleName, source);

  // ─── Step 3: Generate response OR negotiation response ───
  let response;
  let negotiation = null;

  if (offerPrice) {
    // Spec §6.6.2 point 4: floor price set by the Orchestrator, not the concierge.
    const floor = resolveFloorPrice(vehicle, askingPrice);
    const evaluation = evaluateOffer(offerPrice, askingPrice, floor);
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
  const lead = await saveLead({
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
    inquiryText: inquiry,
    responseText: response.response_text || null,
    escalated: escalation.shouldEscalate,
    escalationReason: escalation.shouldEscalate ? escalation.triggers.map((t) => t.reason).join("; ") : null,
    suggestedAction: response.suggested_next_action,
    offerPrice: offerPrice || null,
    createdAt: new Date().toISOString(),
  });

  // ─── Step 5: Log conversation ───
  await addMessage(leadId, { role: "customer", text: inquiry, source });
  if (response.response_text) {
    await addMessage(leadId, { role: "concierge", text: response.response_text, aiPowered: response.aiPowered });
  }

  if (escalation.shouldEscalate) {
    await addEscalation({ leadId, customerName, vehicle: vehicleName, triggers: escalation.triggers });
  }

  // ─── Step 5b: SLA tracking (spec §6.6.2 point 1, KPI §11.2 <10min) ───
  const responseDelayMs = Date.now() - receivedAtMs;
  const slaBreached = responseDelayMs > SLA_TARGET_MS;
  await recordSlaMetric(leadId, {
    inquiryReceivedAt: new Date(receivedAtMs).toISOString(),
    respondedAt: new Date().toISOString(),
    responseDelayMs,
    slaTargetMs: SLA_TARGET_MS,
    slaBreached,
    path: offerPrice ? "negotiation" : "standard",
  });
  if (slaBreached) {
    console.warn(`Concierge SLA breach on ${leadId}: ${Math.round(responseDelayMs / 60000)} min (target 10 min)`);
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
  const allLeads = await getAllLeads();
  const prevStatus = await (async () => {
    try {
      const { getAgentStatus } = await import("../storage");
      return (await getAgentStatus()) || {};
    } catch { return {}; }
  })();
  await updateAgentStatus({
    status: "ONLINE",
    lastAction: `Responded to ${customerName} about ${vehicleName}`,
    lastActionTimestamp: new Date().toISOString(),
    totalLeads: allLeads.leads?.length || 0,
    openLeads: allLeads.leads?.filter((l) => !["CONVERTED", "LOST"].includes(l.status)).length || 0,
    escalatedCount: allLeads.leads?.filter((l) => l.escalated).length || 0,
    slaBreachesTotal: (prevStatus.slaBreachesTotal || 0) + (slaBreached ? 1 : 0),
    lastResponseDelayMs: responseDelayMs,
  });

  // ─── Get vehicle photos for inline display ───
  let photos = [];
  if (vehicle.id) {
    photos = getVehiclePhotos(vehicle.id).map((p) => ({
      filename: p.filename,
      stage: p.stage,
      url: `/api/agents/logistics/photos/serve?vehicleId=${vehicle.id}&stage=${p.stage}&file=${p.filename}`,
    }));
  }

  return {
    leadId,
    action: escalation.shouldEscalate ? "RESPONDED_AND_ESCALATED" : "RESPONDED",
    lead,
    classification,
    response,
    negotiation,
    escalation,
    email: emailResult,
    photos,
    sla: { responseDelayMs, slaBreached, targetMs: SLA_TARGET_MS },
    duration: Date.now() - startTime,
    aiPowered: response.aiPowered !== false,
  };
}
