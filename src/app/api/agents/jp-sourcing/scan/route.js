import { isAIAvailable } from "@/lib/claude";
import { runFullScan } from "@/lib/agents/jp-sourcing/ai/scan-engine";
import { getScanProgress, saveScanProgress, updateAgentStatus, saveOpportunities } from "@/lib/agents/jp-sourcing/storage";
import { after } from "next/server";

/**
 * POST — Start a background JP Sourcing scan. Returns immediately.
 */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  if (!isAIAvailable()) {
    return Response.json({ error: "AI not available. Add OPENROUTER_API_KEY.", aiPowered: false }, { status: 503 });
  }

  const existing = await getScanProgress();
  if (existing?.state === "scanning" || existing?.state === "paused") {
    return Response.json({ error: "Scan already running", progress: existing }, { status: 409 });
  }

  // Clear old data so stale results don't show during scan
  await saveOpportunities({ opportunities: [], deepAnalyses: [], scanSummary: {}, scannedAt: new Date().toISOString() });
  await saveScanProgress({ state: "scanning", step: "starting", detail: "Initializing scan...", startedAt: new Date().toISOString() });

  after(async () => {
    try {
      await runFullScan({ deepAnalysis: body.deepAnalysis !== false });
    } catch (err) {
      console.error("JP Sourcing scan error:", err);
      await saveScanProgress({ state: "error", error: err.message });
      await updateAgentStatus({ status: "ONLINE" });
    }
  });

  return Response.json({ status: "started" });
}

/**
 * GET — Poll scan progress.
 */
export async function GET() {
  const progress = await getScanProgress();
  if (!progress) return Response.json({ state: "idle" });
  return Response.json(progress);
}

/**
 * PATCH — Control the scan: pause, resume, stop.
 */
export async function PATCH(request) {
  const { action } = await request.json();
  const progress = await getScanProgress();

  if (!progress) {
    return Response.json({ error: "No scan running" }, { status: 404 });
  }

  if (action === "pause" && progress.state === "scanning") {
    progress.state = "paused";
    await saveScanProgress(progress);
    return Response.json({ state: "paused" });
  }

  if (action === "resume" && progress.state === "paused") {
    progress.state = "scanning";
    await saveScanProgress(progress);
    return Response.json({ state: "scanning" });
  }

  if (action === "stop") {
    progress.state = "stopped";
    await saveScanProgress(progress);
    await updateAgentStatus({ status: "ONLINE" });
    return Response.json({ state: "stopped" });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
