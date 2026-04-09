import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus, getDecisions } from "@/lib/agents/orchestrator/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("orchestrator");
  if (blocked) return blocked;

  const status = await getAgentStatus();
  const decisions = await getDecisions();
  return Response.json({
    ...status,
    agentId: "orchestrator",
    name: "Orchestrator",
    aiPowered: isAIAvailable(),
    totalDecisions: decisions.decisions?.length || 0,
    recentDecisions: decisions.decisions?.slice(-5).reverse() || [],
  });
}
