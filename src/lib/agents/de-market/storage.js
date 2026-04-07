/**
 * DE Market Agent Storage — persists scan results, TVRs, and history.
 *
 * Uses JSON files on disk for v1. In production, this would be PostgreSQL.
 * Files stored in /data/de-market/
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "de-market");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(filename, data) {
  ensureDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Scan Results ───

export function getLatestScanResults() {
  return readJson("latest-scan.json");
}

export function saveScanResults(results) {
  writeJson("latest-scan.json", {
    results,
    scannedAt: new Date().toISOString(),
    count: results.length,
  });

  // Also append to scan history
  appendScanHistory(results);
}

// ─── TVRs ───

export function getLatestTVRs() {
  return readJson("latest-tvrs.json");
}

export function saveTVRs(tvrs) {
  writeJson("latest-tvrs.json", {
    reports: tvrs,
    generatedAt: new Date().toISOString(),
    count: tvrs.length,
  });
}

export function getTVRByModel(modelId) {
  const data = getLatestTVRs();
  if (!data?.reports) return null;
  return data.reports.find((t) => t.vehicleSpec?.make?.toLowerCase().replace(/\s+/g, "-") + "-" + t.vehicleSpec?.model?.toLowerCase().replace(/[\s()]+/g, "-") === modelId || t.modelId === modelId);
}

// ─── Competitors ───

export function getLatestCompetitors() {
  return readJson("competitors.json");
}

export function saveCompetitors(data) {
  writeJson("competitors.json", data);
}

// ─── Scan History (for trend tracking) ───

export function getScanHistory() {
  return readJson("scan-history.json") || { scans: [] };
}

function appendScanHistory(results) {
  const history = getScanHistory();

  history.scans.push({
    timestamp: new Date().toISOString(),
    modelCount: results.length,
    successCount: results.filter((r) => !r.error).length,
    failCount: results.filter((r) => r.error).length,
    models: results.map((r) => ({
      id: r.modelId,
      median: r.pricing?.median_eur || null,
      velocity: r.demand?.velocity_score || null,
      confidence: r.confidence || null,
      error: r.error || null,
    })),
  });

  // Keep last 100 scans
  if (history.scans.length > 100) {
    history.scans = history.scans.slice(-100);
  }

  writeJson("scan-history.json", history);
}

// ─── Price History (per model, for charts) ───

export function getPriceHistory(modelId) {
  return readJson(`price-history-${modelId}.json`) || { modelId, history: [] };
}

export function appendPriceHistory(modelId, scanResult) {
  const data = getPriceHistory(modelId);

  data.history.push({
    date: new Date().toISOString().split("T")[0],
    timestamp: new Date().toISOString(),
    median: scanResult.pricing?.median_eur,
    p25: scanResult.pricing?.p25_eur,
    p75: scanResult.pricing?.p75_eur,
    sampleSize: scanResult.pricing?.sample_size,
    velocity: scanResult.demand?.velocity_score,
    trend: scanResult.trend?.direction,
  });

  // Keep last 180 days
  if (data.history.length > 180) {
    data.history = data.history.slice(-180);
  }

  writeJson(`price-history-${modelId}.json`, data);
}

// ─── Agent Status ───

export function getAgentStatus() {
  return readJson("agent-status.json") || {
    status: "IDLE",
    lastScanTimestamp: null,
    scansConductedToday: 0,
    totalListingsTracked: 0,
    errorCount24h: 0,
  };
}

export function updateAgentStatus(updates) {
  const current = getAgentStatus();
  writeJson("agent-status.json", { ...current, ...updates, updatedAt: new Date().toISOString() });
}

// ─── Scan Progress (for background scan tracking) ───

export function getScanProgress() {
  return readJson("scan-progress.json") || null;
}

export function saveScanProgress(data) {
  writeJson("scan-progress.json", data);
}

export function clearScanProgress() {
  writeJson("scan-progress.json", null);
}
