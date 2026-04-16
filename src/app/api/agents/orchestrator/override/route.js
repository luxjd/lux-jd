/**
 * POST /api/agents/orchestrator/override
 *
 * Human override for HUMAN_REVIEW decisions.
 * Allows the operator to APPROVE or REJECT after reviewing the AI brief.
 *
 * Body: { opportunityId, opportunity, action: "APPROVE" | "REJECT", reason?: string }
 */

import { saveDecision, updateAgentStatus } from "@/lib/agents/orchestrator/storage";
import { savePipelineVehicle, addPipelineEvent } from "@/lib/agents/logistics/storage";
import { recordLandedCosts } from "@/lib/agents/finance/ai/finance-orchestrator";
import { agentGuard } from "@/lib/settings";
import { db } from "@/lib/db-storage";
import { after } from "next/server";

export async function POST(request) {
  const blocked = await agentGuard("orchestrator");
  if (blocked) return blocked;

  const body = await request.json();
  const { opportunityId, opportunity, action, reason } = body;

  if (!action || !["APPROVE", "REJECT"].includes(action)) {
    return Response.json({ error: "action must be APPROVE or REJECT" }, { status: 400 });
  }

  try {
    await updateAgentStatus({ status: "EVALUATING" });
  } catch (e) { console.warn("Status update failed:", e.message); }

  const opp = opportunity || {};
  const vehicleName = body.vehicleName || `${opp.vehicle?.make || ""} ${opp.vehicle?.model || ""} ${opp.vehicle?.year || ""}`.trim() || "Unknown";
  const decision = action === "APPROVE" ? "HUMAN_APPROVED" : "HUMAN_REJECTED";
  const decisionReason = action === "APPROVE"
    ? `HUMAN APPROVED: Operator reviewed and approved. ${reason || "No additional notes."}`
    : `HUMAN REJECTED: Operator reviewed and rejected. ${reason || "No additional notes."}`;

  // Save the override decision
  try {
    await saveDecision({
      vehicleName,
      opportunityId: opportunityId || opp.id,
      decision,
      decisionReason,
      steps: [],
      financials: opp.landedCost ? {
        margin: opp.margin?.grossMarginEur,
        marginPct: opp.margin?.grossMarginPct,
        landedCost: opp.landedCost?.totalLandedCostEur,
        cashOutlay: opp.landedCost?.totalCashOutlayEur,
        maxBidJpy: opp.maxBidJpy,
      } : {},
      risk: opp.risk || {},
      portfolio: {},
      flagReasons: [],
    });
  } catch (e) { console.warn("Save decision failed:", e.message); }

  // If APPROVED → send to pipeline
  let pipelineResult = null;
  if (action === "APPROVE") {
    const vehicleId = `veh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const parts = vehicleName.split(" ");
    const make = opp.vehicle?.make || parts[0] || "Unknown";
    const model = opp.vehicle?.model || (parts.length > 2 ? parts.slice(1, -1).join(" ") : parts[1]) || "Unknown";
    const year = opp.vehicle?.year || parseInt(parts[parts.length - 1]) || 2024;

    const vehicle = {
      id: vehicleId,
      make,
      model,
      year,
      mileageKm: opp.vehicle?.mileageKm || 0,
      driveSide: opp.vehicle?.driveSide || "RHD",
      exteriorColor: opp.vehicle?.exteriorColor || null,
      interiorColor: opp.vehicle?.interiorColor || null,
      auctionGrade: opp.vehicle?.auctionGrade || null,
      specification: { engineSpec: opp.vehicle?.engineSpec || null },
      currentStage: "SOURCED",
      stageEnteredAt: now,
      stageHistory: [{ stage: "SOURCED", enteredAt: now, agent: "operator" }],
      askingPriceJpy: opp.pricing?.askingPriceJpy || null,
      fxRateAtValuation: opp.landedCost?.fxRateUsed || null,
      landedCost: opp.landedCost || {},
      estimatedSalePrice: opp.pricing?.deMarketMedian || null,
      margin: opp.margin || {},
      marginConfidence: opp.confidence || 0,
      verdict: "BUY",
      maxBidJpy: opp.maxBidJpy || null,
      orchestratorDecision: "HUMAN_APPROVED",
      opportunityId: opportunityId || opp.id || null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await savePipelineVehicle(vehicle);
      pipelineResult = { vehicleId, status: "SOURCED" };
    } catch (e) {
      console.error("Pipeline vehicle save failed:", e.message);
      pipelineResult = { error: e.message };
    }

    try {
      await addPipelineEvent({
        vehicleId,
        fromStatus: null,
        toStatus: "SOURCED",
        agent: "operator",
        message: `HUMAN APPROVED: ${vehicleName}. ${reason || "Operator override after review."}`,
      });
    } catch (e) { console.warn("Pipeline event failed:", e.message); }

    if (opp.landedCost && Object.keys(opp.landedCost).length > 0) {
      after(async () => {
        try {
          await recordLandedCosts(vehicleId, opp.landedCost, opp.landedCost.fxRateUsed || 183);
        } catch (e) { console.warn("Finance txn recording failed:", e.message); }
      });
    }
  }

  // Save to PostgreSQL
  try {
    await db.decisions.create({
      vehicleName,
      opportunityId: opportunityId || opp.id || null,
      decision,
      decisionReason,
      steps: [],
      financials: {},
      risk: opp.risk || {},
      portfolio: {},
      flagReasons: [],
    });
  } catch (e) { console.warn("DB save override failed:", e.message); }

  // Audit log
  try {
    await db.auditLog.create({
      agent: "orchestrator",
      action: `OVERRIDE_${decision}`,
      entityType: "opportunity",
      entityId: opportunityId || opp.id || null,
      reasoning: decisionReason,
      result: { decision, vehicleName, reason, pipelineResult },
    });
  } catch (e) { console.warn("Audit log failed:", e.message); }

  try {
    await updateAgentStatus({
      status: "ONLINE",
      lastAction: `${decision}: ${vehicleName}`,
      lastDecision: decision,
    });
  } catch (e) { console.warn("Status update failed:", e.message); }

  return Response.json({ decision, decisionReason, vehicleName, pipelineResult });
}
