import { runAutoAdvance } from "@/lib/agents/logistics/ai/auto-advance";
import { agentGuard } from "@/lib/settings";

/**
 * POST — Trigger auto-advance check on all pipeline vehicles.
 * Can be called manually or by a scheduled cron job.
 */
export async function POST() {
  const blocked = await agentGuard("logistics");
  if (blocked) return blocked;

  try {
    const result = await runAutoAdvance();
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
