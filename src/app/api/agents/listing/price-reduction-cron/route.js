/**
 * GET /api/agents/listing/price-reduction-cron
 *
 * Enforces the spec §6.3.2 graduated pricing schedule:
 *   Day 0-14:  Hold initial price
 *   Day 15:    Auto-reduce 3-5%
 *   Day 28:    Auto-reduce further 3-5%
 *   Day 42:    Flag for Orchestrator strategic review
 *   Day 56:    Wholesale trigger (-15%)
 *
 * Schedule: designed to run daily (Windows Task Scheduler via curl/HTTP).
 * Protect with CRON_SECRET — same pattern as the DE Market cron endpoint.
 */

import { isAIAvailable } from "@/lib/claude";
import { isAgentEnabled } from "@/lib/settings";
import { runPriceReductionCheck } from "@/lib/agents/listing/ai/listing-orchestrator";
import { updateAgentStatus } from "@/lib/agents/listing/storage";

export async function GET(request) {
  return handleCron(request);
}

export async function POST(request) {
  return handleCron(request);
}

async function handleCron(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || request.headers.get("x-cron-key");
    if (key !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const enabled = await isAgentEnabled("listing");
  if (!enabled) {
    return Response.json({ skipped: true, reason: "Listing agent is disabled in settings" });
  }

  if (!isAIAvailable()) {
    return Response.json({ skipped: true, reason: "AI not configured — price-reduction still runs on schedule, but platform updates require AI unavailable" });
  }

  try {
    await updateAgentStatus({ status: "CHECKING_PRICING", lastAction: "Price-reduction cron started", lastActionAt: new Date().toISOString() });

    const result = await runPriceReductionCheck();
    const reductionCount = result.actions.filter((a) => a.action === "REDUCE" || a.action === "WHOLESALE").length;
    const reviewCount = result.actions.filter((a) => a.action === "REVIEW").length;

    await updateAgentStatus({
      status: "ONLINE",
      lastAction: `Price cron: ${result.checked} listings checked, ${reductionCount} reduced, ${reviewCount} flagged for review`,
      lastActionAt: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      checked: result.checked,
      reductions: reductionCount,
      reviewsFlagged: reviewCount,
      actions: result.actions,
    });
  } catch (err) {
    console.error("Listing price cron error:", err.message);
    await updateAgentStatus({ status: "ERROR", lastAction: `Price cron failed: ${err.message}` });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
