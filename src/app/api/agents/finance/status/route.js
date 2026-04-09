import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/finance/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("finance");
  if (blocked) return blocked;

  return Response.json({ ...(await getAgentStatus()), agentId: "finance", name: "Finance & Compliance Agent", aiPowered: isAIAvailable() });
}
