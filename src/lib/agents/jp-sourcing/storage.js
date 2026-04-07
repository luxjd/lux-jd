/**
 * JP Sourcing Agent Storage — persists opportunities, scan history.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "jp-sourcing");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function writeJson(filename, data) {
  ensureDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Opportunities ───

export function getLatestOpportunities() {
  return readJson("latest-opportunities.json");
}

export function saveOpportunities(data) {
  writeJson("latest-opportunities.json", {
    opportunities: data.opportunities,
    deepAnalyses: data.deepAnalyses || [],
    scanSummary: data.scanSummary,
    scannedAt: data.scannedAt || new Date().toISOString(),
    count: data.opportunities?.length || 0,
  });

  appendScanHistory(data);
}

// ─── Scan History ───

export function getScanHistory() {
  return readJson("scan-history.json") || { scans: [] };
}

function appendScanHistory(data) {
  const history = getScanHistory();
  history.scans.push({
    timestamp: new Date().toISOString(),
    vehiclesFound: data.scanSummary?.matchingVehicles || data.opportunities?.length || 0,
    strongBuy: data.opportunities?.filter((o) => o.recommendation === "STRONG_BUY").length || 0,
    buy: data.opportunities?.filter((o) => o.recommendation === "BUY").length || 0,
    review: data.opportunities?.filter((o) => o.recommendation === "REVIEW").length || 0,
    pass: data.opportunities?.filter((o) => o.recommendation === "PASS").length || 0,
    deepAnalyzed: data.deepAnalyses?.length || 0,
  });

  if (history.scans.length > 50) history.scans = history.scans.slice(-50);
  writeJson("scan-history.json", history);
}

// ─── Agent Status ───

export function getAgentStatus() {
  return readJson("agent-status.json") || {
    status: "IDLE",
    lastScanTimestamp: null,
    scansConductedToday: 0,
  };
}

export function updateAgentStatus(updates) {
  const current = getAgentStatus();
  writeJson("agent-status.json", { ...current, ...updates, updatedAt: new Date().toISOString() });
}

// ─── Scan Progress ───

export function getScanProgress() {
  return readJson("scan-progress.json") || null;
}

export function saveScanProgress(data) {
  writeJson("scan-progress.json", data);
}
