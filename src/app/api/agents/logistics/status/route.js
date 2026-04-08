import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/logistics/storage";

export async function GET() {
  return Response.json({
    ...(await getAgentStatus()),
    agentId: "logistics",
    name: "Logistics Agent",
    aiPowered: isAIAvailable(),
  });
}
