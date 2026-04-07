import { isAIAvailable } from "@/lib/claude";
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
  const existing = getScanProgress();
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
  saveScanProgress(progress);
  updateAgentStatus({ status: "SCANNING" });

  // Run scan in background after response is sent
  after(async () => {
    for (const model of models) {
      // Check for pause/stop
      const current = getScanProgress();
      if (!current || current.state === "stopped") break;

      // Wait while paused
      while (current && getScanProgress()?.state === "paused") {
        await new Promise((r) => setTimeout(r, 500));
        const check = getScanProgress();
        if (!check || check.state === "stopped") break;
      }
      const recheckState = getScanProgress()?.state;
      if (recheckState === "stopped" || !recheckState) break;

      // Update current model
      saveScanProgress({ ...getScanProgress(), currentModelId: model.id, state: "scanning" });

      try {
        const result = await scanModel(model);

        let tvr = null;
        if (result && !result.error) {
          tvr = await generateTVR(result);
          appendPriceHistory(result.modelId, result);
        }

        // Merge into stored scan results
        const existingScans = getLatestScanResults();
        const existingResults = existingScans?.results || [];
        const updatedResults = existingResults.filter((r) => r.modelId !== model.id);
        if (result) updatedResults.push(result);
        saveScanResults(updatedResults);

        if (tvr) {
          const existingTVRs = getLatestTVRs();
          const existingReports = existingTVRs?.reports || [];
          const updatedReports = existingReports.filter((r) => r.modelId !== model.id);
          updatedReports.push(tvr);
          saveTVRs(updatedReports);
        }

        // Update progress
        const p = getScanProgress();
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
          saveScanProgress(p);
        }
      } catch (err) {
        const p = getScanProgress();
        if (p) {
          p.completed.push(model.id);
          p.queue = p.queue.filter((id) => id !== model.id);
          p.results[model.id] = { modelId: model.id, error: err.message };
          p.currentModelId = null;
          saveScanProgress(p);
        }
      }
    }

    // Mark done
    const final = getScanProgress();
    if (final && final.state !== "stopped") {
      final.state = "done";
      final.currentModelId = null;
      final.completedAt = new Date().toISOString();
      saveScanProgress(final);
    }

    const prev = getAgentStatus();
    updateAgentStatus({
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
  const progress = getScanProgress();
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
  const progress = getScanProgress();

  if (!progress) {
    return Response.json({ error: "No scan running" }, { status: 404 });
  }

  if (action === "pause" && progress.state === "scanning") {
    progress.state = "paused";
    saveScanProgress(progress);
    return Response.json({ state: "paused" });
  }

  if (action === "resume" && progress.state === "paused") {
    progress.state = "scanning";
    saveScanProgress(progress);
    return Response.json({ state: "scanning" });
  }

  if (action === "stop") {
    progress.state = "stopped";
    progress.currentModelId = null;
    saveScanProgress(progress);
    updateAgentStatus({ status: "ONLINE" });
    return Response.json({ state: "stopped" });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
