/**
 * JP Sourcing Agent Storage — opportunities, scan history.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Opportunities (KeyValueStore) ───

export async function getLatestOpportunities() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "jp-sourcing-latest-opportunities" } });
  return row?.value || null;
}

export async function saveOpportunities(data) {
  const db = await getDb();
  if (!db) return;
  const value = {
    opportunities: data.opportunities,
    deepAnalyses: data.deepAnalyses || [],
    scanSummary: data.scanSummary,
    scannedAt: data.scannedAt || new Date().toISOString(),
    count: data.opportunities?.length || 0,
  };
  await db.keyValueStore.upsert({
    where: { key: "jp-sourcing-latest-opportunities" },
    update: { value },
    create: { key: "jp-sourcing-latest-opportunities", value },
  });
  await appendScanHistory(data);
}

// ─── Scan History (KeyValueStore) ───

export async function getScanHistory() {
  const db = await getDb();
  if (!db) return { scans: [] };
  const row = await db.keyValueStore.findUnique({ where: { key: "jp-sourcing-scan-history" } });
  return row?.value || { scans: [] };
}

async function appendScanHistory(data) {
  const db = await getDb();
  if (!db) return;
  const history = await getScanHistory();
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
  await db.keyValueStore.upsert({
    where: { key: "jp-sourcing-scan-history" },
    update: { value: history },
    create: { key: "jp-sourcing-scan-history", value: history },
  });
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE", lastScanTimestamp: null, scansConductedToday: 0 };
  const s = await db.agentStatus.findUnique({ where: { id: "jp-sourcing" } });
  if (!s) return { status: "IDLE", lastScanTimestamp: null, scansConductedToday: 0 };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(updates) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...updates };
  await db.agentStatus.upsert({
    where: { id: "jp-sourcing" },
    update: { name: "JP Sourcing", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "jp-sourcing", name: "JP Sourcing", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}

// ─── Scan Progress (KeyValueStore) ───

export async function getScanProgress() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "jp-sourcing-scan-progress" } });
  return row?.value || null;
}

export async function saveScanProgress(data) {
  const db = await getDb();
  if (!db) return;
  await db.keyValueStore.upsert({
    where: { key: "jp-sourcing-scan-progress" },
    update: { value: data || {} },
    create: { key: "jp-sourcing-scan-progress", value: data || {} },
  });
}
