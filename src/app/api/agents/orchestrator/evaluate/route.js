import { evaluateOpportunity } from "@/lib/agents/orchestrator/ai/decision-engine";
import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { generateDecisionBrief } from "@/lib/agents/orchestrator/ai/brief-generator";
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
  if (!body.opportunity) return Response.json({ error: "Missing opportunity data" }, { status: 400 });

  await updateAgentStatus({ status: "EVALUATING" });

  const portfolio = await loadPortfolioState();
  const evaluation = evaluateOpportunity(body.opportunity, portfolio);

  // Generate AI brief for HUMAN_REVIEW decisions
  let brief = null;
  if (evaluation.decision === "HUMAN_REVIEW") {
    brief = await generateDecisionBrief(evaluation, body.opportunity);
  }

  const fullDecision = { ...evaluation, brief, portfolio: { deployed: portfolio.deploymentPct, vehicles: portfolio.totalVehicles, health: portfolio.healthScore } };

  await saveDecision(fullDecision);

  // AUTO-APPROVE → Send to pipeline automatically
  let pipelineResult = null;
  if (evaluation.decision === "AUTO_APPROVE") {
    const opp = body.opportunity;
    const vehicleId = `veh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const vehicle = {
      id: vehicleId,
      make: opp.vehicle?.make,
      model: opp.vehicle?.model,
      year: opp.vehicle?.year,
      mileageKm: opp.vehicle?.mileageKm,
      driveSide: opp.vehicle?.driveSide || "RHD",
      exteriorColor: opp.vehicle?.exteriorColor,
      interiorColor: opp.vehicle?.interiorColor,
      auctionGrade: opp.vehicle?.auctionGrade,
      specification: { engineSpec: opp.vehicle?.engineSpec, specNotes: opp.vehicle?.specificationNotes },
      currentStage: "SOURCED",
      stageEnteredAt: now,
      stageHistory: [{ stage: "SOURCED", enteredAt: now, agent: "orchestrator" }],
      askingPriceJpy: opp.pricing?.askingPriceJpy,
      fxRateAtValuation: opp.landedCost?.fxRateUsed,
      landedCost: opp.landedCost || {},
      estimatedSalePrice: opp.pricing?.deMarketMedian,
      margin: opp.margin || {},
      marginConfidence: opp.confidence,
      verdict: "BUY",
      maxBidJpy: evaluation.financials?.maxBidJpy,
      orchestratorDecision: evaluation.decision,
      opportunityId: opp.id,
      createdAt: now,
      updatedAt: now,
    };

    await savePipelineVehicle(vehicle);
    await addPipelineEvent({
      vehicleId,
      fromStatus: null,
      toStatus: "SOURCED",
      agent: "orchestrator",
      message: `AUTO-APPROVED: ${opp.vehicle?.make} ${opp.vehicle?.model} (${opp.vehicle?.year}). Margin €${evaluation.financials.margin.toLocaleString()} (${evaluation.financials.marginPct}%). Max bid ¥${evaluation.financials.maxBidJpy?.toLocaleString()}.`,
    });

    // Record financial transactions in background
    if (opp.landedCost && Object.keys(opp.landedCost).length > 0) {
      after(async () => {
        try {
          await recordLandedCosts(vehicleId, opp.landedCost, opp.landedCost.fxRateUsed || 183);
        } catch (e) { console.warn("Finance txn recording failed:", e.message); }
      });
    }

    pipelineResult = { vehicleId, status: "SOURCED" };
  }

  // Audit log — compliance requirement
  try {
    await db.auditLog.create({
      agent: "orchestrator",
      action: `DECISION_${evaluation.decision}`,
      entityType: "opportunity",
      entityId: body.opportunity?.id || null,
      reasoning: evaluation.decisionReason,
      result: {
        decision: evaluation.decision,
        vehicleName: evaluation.vehicleName,
        steps: evaluation.summary,
        financials: evaluation.financials,
        flagReasons: evaluation.flagReasons,
        pipelineResult: pipelineResult || null,
      },
    });
  } catch (e) { console.warn("Audit log failed:", e.message); }

  await updateAgentStatus({
    status: "ONLINE",
    lastAction: `${evaluation.decision}: ${evaluation.vehicleName}`,
    lastDecision: evaluation.decision,
    totalDecisions: (body.totalDecisions || 0) + 1,
  });

  return Response.json({ ...fullDecision, pipelineResult });
}
