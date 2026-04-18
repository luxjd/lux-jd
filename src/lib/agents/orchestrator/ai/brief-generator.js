/**
 * Decision Brief Generator — Claude-powered executive summaries.
 *
 * For HUMAN_REVIEW decisions, generates a 1-page brief with all data
 * the human needs to make the final call.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatNumber } from "@/lib/format";

const SYSTEM_PROMPT = `You are the Chief Investment Officer of LuxJD, a luxury vehicle arbitrage firm. You write concise, decisive executive briefs for vehicle acquisition decisions. Your briefs are legendary for their clarity — every word earns its place.

Format: structured, scannable, decisive. Never waffle. State the recommendation clearly, then back it with data.`;

/**
 * Generate an executive decision brief.
 */
export async function generateDecisionBrief(evaluation, opportunity) {
  if (!isAIAvailable()) {
    throw new Error("AI is required for decision briefs. Configure OPENROUTER_API_KEY.");
  }

  const result = await callClaude({
    prompt: `Generate an executive decision brief for this vehicle acquisition.

DECISION ENGINE RESULT: ${evaluation.decision}
VEHICLE: ${evaluation.vehicleName}
SOURCE: ${opportunity.source?.auctionHouse} Lot ${opportunity.source?.lotNumber}

7-STEP EVALUATION:
${evaluation.steps.map((s) => `Step ${s.step} ${s.name}: ${s.result} — ${s.reasoning}`).join("\n")}

FINANCIALS:
- JP Ask: ¥${formatNumber(opportunity.pricing?.askingPriceJpy)} (€${formatNumber(opportunity.pricing?.askingPriceEur)})
- Landed Cost: €${formatNumber(evaluation.financials.landedCost)}
- DE Market Value: €${formatNumber(opportunity.pricing?.deMarketMedian)}
- Margin: €${formatNumber(evaluation.financials.margin)} (${evaluation.financials.marginPct}%)
- Confidence: ${(opportunity.confidence * 100).toFixed(0)}%
- Risk: ${evaluation.risk.compositeScore}/3.0 (${evaluation.risk.compositeLevel})

VEHICLE DETAILS:
- ${opportunity.vehicle?.year} ${opportunity.vehicle?.make} ${opportunity.vehicle?.model}
- ${formatNumber(opportunity.vehicle?.mileageKm)} km | ${opportunity.vehicle?.driveSide} | ${opportunity.vehicle?.exteriorColor}
- Grade: ${opportunity.vehicle?.auctionGrade} | Service: ${opportunity.vehicle?.serviceHistory}
- Condition: ${opportunity.vehicle?.conditionNotes || "N/A"}

PORTFOLIO IMPACT:
- Brand ${opportunity.vehicle?.make}: ${evaluation.portfolio.newBrandConcentration}% after
- Capital deployment: ${evaluation.portfolio.newDeploymentPct}% after
- Timing: ${evaluation.timing.score} (${evaluation.timing.arrivalSeason} arrival)

${evaluation.flagReasons.length > 0 ? `FLAGS: ${evaluation.flagReasons.join("; ")}` : ""}

Return ONLY valid JSON:
{
  "headline": "1-line decisive headline",
  "recommendation": "APPROVE" or "REJECT" or "CONDITIONAL_APPROVE",
  "executive_summary": "3-4 sentence summary covering thesis, risk, and recommendation",
  "bull_case": "Why this is a good buy (2 sentences)",
  "bear_case": "Why this could go wrong (2 sentences)",
  "conditions": ["condition for approval 1"] or [],
  "immediate_actions": ["action 1 if approved", "action 2"],
  "deadline_note": "When decision must be made (auction timing)",
  "confidence_in_recommendation": <float 0-1>
}`,
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  if (!result) throw new Error("Decision brief generation failed — no response from AI.");

  return {
    ...result,
    evaluation_summary: {
      decision: evaluation.decision,
      stepsPass: evaluation.summary.passCount,
      stepsFail: evaluation.summary.failCount,
      stepsFlag: evaluation.summary.flagCount,
    },
    vehicle: evaluation.vehicleName,
    generatedAt: new Date().toISOString(),
    aiPowered: true,
  };
}

