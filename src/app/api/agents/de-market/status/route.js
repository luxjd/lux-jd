import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/de-market/storage";
import { agentStatus as mockStatus } from "@/lib/agents/de-market/mock-data";

export async function GET() {
  const realStatus = getAgentStatus();

  // If we have real scan data, use it; otherwise fall back to mock
  if (realStatus?.lastScanTimestamp) {
    return Response.json({
      ...realStatus,
      agentId: "de-market",
      name: "DE Market Research Agent",
      aiPowered: isAIAvailable(),
    });
  }

  return Response.json({ ...mockStatus, aiPowered: false });
}
