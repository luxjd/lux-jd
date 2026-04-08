import { checkAllAgents } from "@/lib/agents/orchestrator/ai/agent-monitor";

export async function GET() {
  return Response.json(await checkAllAgents());
}
