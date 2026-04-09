import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/concierge/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("concierge");
  if (blocked) return blocked;

  return Response.json({ ...(await getAgentStatus()), agentId: "concierge", name: "Concierge Agent", aiPowered: isAIAvailable() });
}
