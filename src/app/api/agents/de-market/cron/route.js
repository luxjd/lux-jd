/**
 * DE Market Agent — Scheduled Scan Endpoint.
 * Per spec Section 6.1.1: "Continuously monitors the German and European luxury car market"
 *
 * This endpoint is designed to be called by a cron job (e.g., Vercel Cron, external cron).
 * Schedule: Every 6 hours (4 times daily)
 *
 * Vercel cron config: see vercel.json (every 6 hours)
 * Or call externally via curl.
 */

import { isAIAvailable } from "@/lib/claude";
import { isAgentEnabled } from "@/lib/settings";
import { runFullScan } from "@/lib/agents/de-market/ai/scan-engine";
import { updateAgentStatus } from "@/lib/agents/de-market/storage";

export async function GET(request) {
  return handleCron(request);
}

export async function POST(request) {
  return handleCron(request);
}

async function handleCron(request) {
  // Optional: verify cron secret for security
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") || request.headers.get("x-cron-key");
    if (key !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Check if agent is enabled
  const enabled = await isAgentEnabled("de-market");
  if (!enabled) {
    return Response.json({ skipped: true, reason: "DE Market agent is disabled in settings" });
  }

  if (!isAIAvailable()) {
    return Response.json({ skipped: true, reason: "AI not configured" });
  }

  console.log("DE Market cron: starting scheduled scan...");

  try {
    await updateAgentStatus({ lastAction: "Scheduled scan started", lastActionAt: new Date().toISOString() });

    const result = await runFullScan({
      includeCompetitors: false, // Competitors only on manual scan to save API costs
    });

    console.log(`DE Market cron: completed — ${result.models?.succeeded || 0} models, ${result.totalListingsTracked || 0} listings`);

    return Response.json({
      success: true,
      modelsScanned: result.models?.total || 0,
      modelsSucceeded: result.models?.succeeded || 0,
      totalListings: result.totalListingsTracked || 0,
      tvrsGenerated: result.tvrsGenerated || 0,
      duration: result.duration,
    });
  } catch (err) {
    console.error("DE Market cron error:", err.message);
    await updateAgentStatus({ status: "ERROR", lastAction: `Cron failed: ${err.message}` });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
