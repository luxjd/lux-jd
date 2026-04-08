import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/de-market/storage";

export async function GET() {
  const realStatus = await getAgentStatus();

  return Response.json({
    ...(realStatus || {}),
    agentId: "de-market",
    name: "DE Market Research Agent",
    aiPowered: isAIAvailable(),
    hasData: !!realStatus?.lastScanTimestamp,
  });
}
