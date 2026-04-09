import { isAIAvailable } from "@/lib/claude";
import { getAgentStatus } from "@/lib/agents/listing/storage";
import { agentGuard } from "@/lib/settings";

export async function GET() {
  const blocked = await agentGuard("listing");
  if (blocked) return blocked;

  const status = await getAgentStatus();
  return Response.json({
    ...status,
    agentId: "listing",
    name: "Listing & Presentation Agent",
    aiPowered: isAIAvailable(),
  });
}
