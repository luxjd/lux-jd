import { runAutoAdvance } from "@/lib/agents/logistics/ai/auto-advance";

/**
 * POST — Trigger auto-advance check on all pipeline vehicles.
 * Can be called manually or by a scheduled cron job.
 */
export async function POST() {
  try {
    const result = await runAutoAdvance();
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
