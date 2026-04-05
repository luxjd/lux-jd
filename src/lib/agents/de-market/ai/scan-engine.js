/**
 * DE Market Agent — Full Scan Engine.
 *
 * Orchestrates:
 * 1. Scan all tracked models via Claude
 * 2. Generate Target Vehicle Reports
 * 3. Analyze competitors
 * 4. Persist all results
 * 5. Update price histories
 * 6. Update agent status
 */

import { isAIAvailable } from "@/lib/claude";
import { TRACKED_MODELS } from "../constants";
import { scanModel, scanAllModels } from "./market-scanner";
import { generateAllTVRs } from "./tvr-generator";
import { analyzeCompetitors } from "./competitor-tracker";
import {
  saveScanResults,
  saveTVRs,
  saveCompetitors,
  appendPriceHistory,
  updateAgentStatus,
  getAgentStatus,
} from "../storage";

/**
 * Run a FULL scan of all tracked models + competitors.
 * This is what "Scan Now" triggers.
 *
 * @param {object} options
 * @param {string[]} options.modelIds — specific models to scan (null = all)
 * @param {boolean} options.includeCompetitors — also scan competitors
 * @param {function} options.onProgress — callback(step, detail)
 * @returns {object} Full scan result
 */
export async function runFullScan({
  modelIds = null,
  includeCompetitors = true,
  onProgress = null,
} = {}) {
  if (!isAIAvailable()) {
    return { error: "AI not available — add OPENROUTER_API_KEY to .env.local", aiPowered: false };
  }

  const startTime = Date.now();
  const models = modelIds
    ? TRACKED_MODELS.filter((m) => modelIds.includes(m.id))
    : TRACKED_MODELS;

  updateAgentStatus({ status: "SCANNING" });

  // ─── Step 1: Scan all models ───
  onProgress?.("scanning", `Scanning ${models.length} models...`);

  const scanResults = await scanAllModels(models, (modelId, index, total) => {
    onProgress?.("scanning", `Scanning ${index + 1}/${total}: ${modelId}`);
  });

  const successCount = scanResults.filter((r) => !r.error).length;
  const failCount = scanResults.filter((r) => r.error).length;

  // Persist scan results
  saveScanResults(scanResults);

  // Update price histories
  for (const result of scanResults) {
    if (!result.error) {
      appendPriceHistory(result.modelId, result);
    }
  }

  // ─── Step 2: Generate TVRs ───
  onProgress?.("tvr", "Generating Target Vehicle Reports...");

  const tvrs = await generateAllTVRs(scanResults.filter((r) => !r.error));
  saveTVRs(tvrs);

  // ─── Step 3: Competitor analysis (optional) ───
  let competitorResult = null;
  if (includeCompetitors) {
    onProgress?.("competitors", "Analyzing competitor landscape...");
    competitorResult = await analyzeCompetitors();
    if (competitorResult) {
      saveCompetitors(competitorResult);
    }
  }

  // ─── Step 4: Update agent status ───
  const elapsed = Date.now() - startTime;
  const totalListings = scanResults.reduce((sum, r) => sum + (r.pricing?.sample_size || 0), 0);

  const prevStatus = getAgentStatus();
  updateAgentStatus({
    status: "ONLINE",
    lastScanTimestamp: new Date().toISOString(),
    lastScanDuration: elapsed,
    scansConductedToday: (prevStatus.scansConductedToday || 0) + 1,
    totalListingsTracked: totalListings,
    errorCount24h: (prevStatus.errorCount24h || 0) + failCount,
    dataFreshness: "FRESH",
    modelsScanned: models.length,
    modelsSucceeded: successCount,
    modelsFailed: failCount,
    tvrCount: tvrs.length,
  });

  onProgress?.("complete", "Scan complete!");

  return {
    aiPowered: true,
    status: "COMPLETED",
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    duration: elapsed,
    models: {
      total: models.length,
      succeeded: successCount,
      failed: failCount,
    },
    results: scanResults.map((r) => ({
      modelId: r.modelId,
      make: r.make,
      model: r.model,
      median: r.pricing?.median_eur || null,
      velocity: r.demand?.velocity_score || null,
      trend: r.trend?.direction || null,
      confidence: r.confidence || null,
      error: r.error || null,
    })),
    tvrsGenerated: tvrs.length,
    competitorAnalysis: !!competitorResult,
    totalListingsTracked: totalListings,
  };
}

/**
 * Run a QUICK scan — single model only, no competitors.
 */
export async function runQuickScan(modelId) {
  const model = TRACKED_MODELS.find((m) => m.id === modelId);
  if (!model) return { error: `Model ${modelId} not found` };

  return runFullScan({
    modelIds: [modelId],
    includeCompetitors: false,
  });
}
