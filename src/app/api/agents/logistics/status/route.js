import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/logistics/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("logistics");
  if (blocked) return blocked;

  return Response.json({
    ...(await getAgentStatus()),
    agentId: "logistics",
    name: "Logistics Agent",
    aiPowered: isAIAvailable(),
  });
}
