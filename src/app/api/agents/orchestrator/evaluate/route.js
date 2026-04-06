import { evaluateOpportunity } from "@/lib/agents/orchestrator/ai/decision-engine";
import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { generateDecisionBrief } from "@/lib/agents/orchestrator/ai/brief-generator";
import { saveDecision, updateAgentStatus } from "@/lib/agents/orchestrator/storage";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  const body = await request.json();
  if (!body.opportunity) return Response.json({ error: "Missing opportunity data" }, { status: 400 });

  updateAgentStatus({ status: "EVALUATING" });

  const portfolio = loadPortfolioState();
  const evaluation = evaluateOpportunity(body.opportunity, portfolio);

  // Generate AI brief for HUMAN_REVIEW decisions
  let brief = null;
  if (evaluation.decision === "HUMAN_REVIEW") {
    brief = await generateDecisionBrief(evaluation, body.opportunity);
  }

  const fullDecision = { ...evaluation, brief, portfolio: { deployed: portfolio.deploymentPct, vehicles: portfolio.totalVehicles, health: portfolio.healthScore } };

  saveDecision(fullDecision);

  // Save to PostgreSQL
  try {
    await db.decisions.create({
      vehicleName: evaluation.vehicleName,
      opportunityId: body.opportunity?.id,
      decision: evaluation.decision,
      decisionReason: evaluation.decisionReason,
      steps: evaluation.steps,
      financials: evaluation.financials,
      risk: evaluation.risk,
      portfolio: evaluation.portfolio,
      brief: brief || undefined,
      flagReasons: evaluation.flagReasons || [],
    });
  } catch (e) { console.warn("DB save decision failed:", e.message); }

  updateAgentStatus({
    status: "ONLINE",
    lastAction: `${evaluation.decision}: ${evaluation.vehicleName}`,
    lastDecision: evaluation.decision,
    totalDecisions: (body.totalDecisions || 0) + 1,
  });

  return Response.json(fullDecision);
}
