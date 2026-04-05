import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/jp-sourcing/storage";

export async function GET() {
  const status = getAgentStatus();
  return Response.json({
    ...status,
    agentId: "jp-sourcing",
    name: "JP Sourcing Agent",
    aiPowered: isAIAvailable(),
  });
}
