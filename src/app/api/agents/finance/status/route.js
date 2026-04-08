import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/finance/storage";

export async function GET() {
  return Response.json({ ...(await getAgentStatus()), agentId: "finance", name: "Finance & Compliance Agent", aiPowered: isAIAvailable() });
}
