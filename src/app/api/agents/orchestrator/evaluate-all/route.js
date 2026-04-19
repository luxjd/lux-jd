/**
 * POST /api/agents/orchestrator/evaluate-all
 *
 * Batch evaluator: pulls the latest JP Sourcing BUY/STRONG_BUY opportunities
 * and runs each through the decision engine. Skips opportunities that already
 * have a terminal decision (idempotent). This is the loop that closes the
 * spec §7.2 "When JP Sourcing presents a candidate, the Orchestrator evaluates"
 * integration gap.
 */

import { evaluateOpportunity } from "@/lib/agents/orchestrator/ai/decision-engine";
import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { generateDecisionBrief } from "@/lib/agents/orchestrator/ai/brief-generator";
import {
  saveDecision,
  updateAgentStatus,
  getLastDecisionForOpportunity,
  isTerminalDecision,
} from "@/lib/agents/orchestrator/storage";
import { getLatestOpportunities } from "@/lib/agents/jp-sourcing/storage";
import { savePipelineVehicle, addPipelineEvent } from "@/lib/agents/logistics/storage";
import { recordLandedCosts } from "@/lib/agents/finance/ai/finance-orchestrator";
import { formatEur, formatJpy } from "@/lib/format";
import { agentGuard } from "@/lib/settings";
import { db } from "@/lib/db-storage";
import { after } from "next/server";

async function seedPipelineFromDecision(opp, evaluation) {
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
    message: `AUTO-APPROVED (batch): ${opp.vehicle?.make} ${opp.vehicle?.model}. Margin ${formatEur(evaluation.financials.margin)} (${evaluation.financials.marginPct}%). Max bid ${formatJpy(evaluation.financials.maxBidJpy)}.`,
  });
  if (opp.landedCost && Object.keys(opp.landedCost).length > 0) {
    after(async () => {
      try {
        await recordLandedCosts(vehicleId, opp.landedCost, opp.landedCost.fxRateUsed || 183);
      } catch (e) { console.warn("Finance txn recording failed:", e.message); }
    });
  }
  return { vehicleId, status: "SOURCED" };
}

export async function POST(request) {
  const blocked = await agentGuard("orchestrator");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const generateBriefs = body.generateBriefs !== false; // default true

  const oppData = await getLatestOpportunities();
  const candidates = (oppData?.opportunities || []).filter((o) => {
    const r = o.refinedRecommendation || o.recommendation;
    return r === "BUY" || r === "STRONG_BUY";
  });

  if (candidates.length === 0) {
    return Response.json({
      message: "No BUY/STRONG_BUY opportunities to evaluate",
      evaluated: 0,
      candidates: 0,
      autoApproved: [],
      humanReview: [],
      rejected: [],
      skipped: [],
      errors: [],
      summary: { autoApproved: 0, humanReview: 0, rejected: 0, skipped: 0, errors: 0 },
    });
  }

  await updateAgentStatus({ status: "EVALUATING", lastAction: `Batch evaluation of ${candidates.length} opportunities` });

  const portfolio = await loadPortfolioState();
  const results = { autoApproved: [], humanReview: [], rejected: [], skipped: [], errors: [] };

  for (const opp of candidates) {
    try {
      // Skip if already has a terminal decision.
      if (opp.id) {
        const existing = await getLastDecisionForOpportunity(opp.id);
        if (existing && isTerminalDecision(existing.decision)) {
          results.skipped.push({ opportunityId: opp.id, previousDecision: existing.decision });
          continue;
        }
      }

      const evaluation = evaluateOpportunity(opp, portfolio);

      let brief = null;
      if (generateBriefs && evaluation.decision === "HUMAN_REVIEW") {
        try { brief = await generateDecisionBrief(evaluation, opp); }
        catch (e) { console.warn("Brief generation failed:", e.message); }
      }

      const fullDecision = {
        ...evaluation,
        brief,
        portfolio: { deployed: portfolio.deploymentPct, vehicles: portfolio.totalVehicles, health: portfolio.healthScore },
      };
      await saveDecision(fullDecision);

      let pipelineResult = null;
      if (evaluation.decision === "AUTO_APPROVE") {
        pipelineResult = await seedPipelineFromDecision(opp, evaluation);
        results.autoApproved.push({ opportunityId: opp.id, vehicle: evaluation.vehicleName, vehicleId: pipelineResult.vehicleId });
      } else if (evaluation.decision === "HUMAN_REVIEW") {
        results.humanReview.push({ opportunityId: opp.id, vehicle: evaluation.vehicleName, flags: evaluation.flagReasons });
      } else {
        results.rejected.push({ opportunityId: opp.id, vehicle: evaluation.vehicleName, reason: evaluation.decisionReason });
      }

      try {
        await db.auditLog.create({
          agent: "orchestrator",
          action: `BATCH_DECISION_${evaluation.decision}`,
          entityType: "opportunity",
          entityId: opp.id || null,
          reasoning: evaluation.decisionReason,
          result: {
            decision: evaluation.decision,
            vehicleName: evaluation.vehicleName,
            pipelineResult: pipelineResult || null,
          },
        });
      } catch (e) { console.warn("Audit log failed:", e.message); }
    } catch (e) {
      console.error(`Batch evaluate failed for ${opp.id}:`, e.message);
      results.errors.push({ opportunityId: opp.id, error: e.message });
    }
  }

  await updateAgentStatus({
    status: "ONLINE",
    lastAction: `Batch: ${results.autoApproved.length} approved, ${results.humanReview.length} for review, ${results.rejected.length} rejected, ${results.skipped.length} skipped`,
  });

  return Response.json({
    candidates: candidates.length,
    evaluated: results.autoApproved.length + results.humanReview.length + results.rejected.length,
    autoApproved: results.autoApproved,
    humanReview: results.humanReview,
    rejected: results.rejected,
    skipped: results.skipped,
    errors: results.errors,
    summary: {
      autoApproved: results.autoApproved.length,
      humanReview: results.humanReview.length,
      rejected: results.rejected.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
    },
  });
}
