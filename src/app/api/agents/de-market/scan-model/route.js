import { isAIAvailable } from "@/lib/claude";
import { agentGuard } from "@/lib/settings";
import { TRACKED_MODELS } from "@/lib/agents/de-market/constants";
import { scanModel } from "@/lib/agents/de-market/ai/market-scanner";
import { generateTVR } from "@/lib/agents/de-market/ai/tvr-generator";
import {
  getLatestScanResults,
  getLatestTVRs,
  saveScanResults,
  saveTVRs,
  appendPriceHistory,
  updateAgentStatus,
  getAgentStatus,
  getScanProgress,
  saveScanProgress,
} from "@/lib/agents/de-market/storage";
import { after } from "next/server";

/**
 * POST — Start a background scan of all (or specific) models.
 * Returns immediately. Progress is tracked via GET /api/agents/de-market/scan-model.
 */
export async function POST(request) {
  const blocked = await agentGuard("de-market");
  if (blocked) return blocked;

  if (!isAIAvailable()) {
    return Response.json({ error: "AI not available" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const modelIds = body.modelIds || TRACKED_MODELS.map((m) => m.id);
  const models = TRACKED_MODELS.filter((m) => modelIds.includes(m.id));

  if (models.length === 0) {
    return Response.json({ error: "No valid models" }, { status: 400 });
  }

  // Check if scan already running
  const existing = await getScanProgress();
  if (existing?.state === "scanning") {
    return Response.json({ error: "Scan already running", progress: existing }, { status: 409 });
  }

  // Initialize progress
  const progress = {
    state: "scanning",
    queue: models.map((m) => m.id),
    completed: [],
    results: {},
    currentModelId: null,
    startedAt: new Date().toISOString(),
    total: models.length,
  };
  await saveScanProgress(progress);
  await updateAgentStatus({ status: "SCANNING" });

  // Run scan in background after response is sent
  after(async () => {
    for (const model of models) {
      // Check for pause/stop
      const current = await getScanProgress();
      if (!current || current.state === "stopped") break;

      // Wait while paused
      while (current && (await getScanProgress())?.state === "paused") {
        await new Promise((r) => setTimeout(r, 500));
        const check = await getScanProgress();
        if (!check || check.state === "stopped") break;
      }
      const recheckState = (await getScanProgress())?.state;
      if (recheckState === "stopped" || !recheckState) break;

      // Update current model
      await saveScanProgress({ ...(await getScanProgress()), currentModelId: model.id, state: "scanning" });

      try {
        const result = await scanModel(model);

        let tvr = null;
        if (result && !result.error) {
          tvr = await generateTVR(result);
          await appendPriceHistory(result.modelId, result);
        }

        // Merge into stored scan results
        const existingScans = await getLatestScanResults();
        const existingResults = existingScans?.results || [];
        const updatedResults = existingResults.filter((r) => r.modelId !== model.id);
        if (result) updatedResults.push(result);
        await saveScanResults(updatedResults);

        if (tvr) {
          const existingTVRs = await getLatestTVRs();
          const existingReports = existingTVRs?.reports || [];
          const updatedReports = existingReports.filter((r) => r.modelId !== model.id);
          updatedReports.push(tvr);
          await saveTVRs(updatedReports);
        }

        // Update progress
        const p = await getScanProgress();
        if (p) {
          p.completed.push(model.id);
          p.queue = p.queue.filter((id) => id !== model.id);
          p.results[model.id] = {
            modelId: model.id,
            make: model.make,
            model: model.model,
            median: result?.pricing?.median_eur || null,
            velocity: result?.demand?.velocity_score || null,
            confidence: result?.confidence || null,
            sampleSize: result?.pricing?.sample_size || 0,
            error: result?.error || null,
          };
          p.currentModelId = null;
          await saveScanProgress(p);
        }
      } catch (err) {
        const p = await getScanProgress();
        if (p) {
          p.completed.push(model.id);
          p.queue = p.queue.filter((id) => id !== model.id);
          p.results[model.id] = { modelId: model.id, error: err.message };
          p.currentModelId = null;
          await saveScanProgress(p);
        }
      }
    }

    // Mark done
    const final = await getScanProgress();
    if (final && final.state !== "stopped") {
      final.state = "done";
      final.currentModelId = null;
      final.completedAt = new Date().toISOString();
      await saveScanProgress(final);
    }

    const prev = await getAgentStatus();
    await updateAgentStatus({
      status: "ONLINE",
      lastScanTimestamp: new Date().toISOString(),
      scansConductedToday: (prev.scansConductedToday || 0) + 1,
    });
  });

  return Response.json({ status: "started", total: models.length });
}

/**
 * GET — Poll scan progress.
 */
export async function GET() {
  const progress = await getScanProgress();
  if (!progress) {
    return Response.json({ state: "idle" });
  }
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
    progress.currentModelId = null;
    await saveScanProgress(progress);
    await updateAgentStatus({ status: "ONLINE" });
    return Response.json({ state: "stopped" });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
