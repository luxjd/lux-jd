import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/listing/storage";

export async function GET() {
  const status = getAgentStatus();
  return Response.json({
    ...status,
    agentId: "listing",
    name: "Listing & Presentation Agent",
    aiPowered: isAIAvailable(),
  });
}
