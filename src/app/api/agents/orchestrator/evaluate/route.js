import { evaluateOpportunity } from "@/lib/agents/orchestrator/ai/decision-engine";
import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { generateDecisionBrief } from "@/lib/agents/orchestrator/ai/brief-generator";
import { saveDecision, updateAgentStatus } from "@/lib/agents/orchestrator/storage";

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
  updateAgentStatus({
    status: "ONLINE",
    lastAction: `${evaluation.decision}: ${evaluation.vehicleName}`,
    lastDecision: evaluation.decision,
    totalDecisions: (body.totalDecisions || 0) + 1,
  });

  return Response.json(fullDecision);
}
