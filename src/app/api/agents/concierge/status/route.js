import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/concierge/storage";

export async function GET() {
  return Response.json({ ...getAgentStatus(), agentId: "concierge", name: "Concierge Agent", aiPowered: isAIAvailable() });
}
