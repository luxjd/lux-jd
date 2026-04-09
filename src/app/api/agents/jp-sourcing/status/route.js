import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/jp-sourcing/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("jp-sourcing");
  if (blocked) return blocked;

  const status = await getAgentStatus();
  return Response.json({
    ...status,
    agentId: "jp-sourcing",
    name: "JP Sourcing Agent",
    aiPowered: isAIAvailable(),
  });
}
