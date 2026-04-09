import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/de-market/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("de-market");
  if (blocked) return blocked;

  const realStatus = await getAgentStatus();

  return Response.json({
    ...(realStatus || {}),
    agentId: "de-market",
    name: "DE Market Research Agent",
    aiPowered: isAIAvailable(),
    hasData: !!realStatus?.lastScanTimestamp,
  });
}
