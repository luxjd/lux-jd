/**
 * DE Market Agent Storage — scan results, TVRs, history.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Scan Results (KeyValueStore) ───

export async function getLatestScanResults() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "de-market-latest-scan" } });
  return row?.value || null;
}

export async function saveScanResults(results) {
  const db = await getDb();
  if (!db) return;
  const value = { results, scannedAt: new Date().toISOString(), count: results.length };
  await db.keyValueStore.upsert({
    where: { key: "de-market-latest-scan" },
    update: { value },
    create: { key: "de-market-latest-scan", value },
  });
  await appendScanHistory(results);
}

// ─── TVRs (KeyValueStore) ───

export async function getLatestTVRs() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "de-market-latest-tvrs" } });
  return row?.value || null;
}

export async function saveTVRs(tvrs) {
  const db = await getDb();
  if (!db) return;
  const value = { reports: tvrs, generatedAt: new Date().toISOString(), count: tvrs.length };
  await db.keyValueStore.upsert({
    where: { key: "de-market-latest-tvrs" },
    update: { value },
    create: { key: "de-market-latest-tvrs", value },
  });
}

export async function getTVRByModel(modelId) {
  const data = await getLatestTVRs();
  if (!data?.reports) return null;
  return data.reports.find((t) =>
    t.vehicleSpec?.make?.toLowerCase().replace(/\s+/g, "-") + "-" + t.vehicleSpec?.model?.toLowerCase().replace(/[\s()]+/g, "-") === modelId || t.modelId === modelId
  );
}

// ─── Competitors (KeyValueStore) ───

export async function getLatestCompetitors() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "de-market-competitors" } });
  return row?.value || null;
}

export async function saveCompetitors(data) {
  const db = await getDb();
  if (!db) return;
  await db.keyValueStore.upsert({
    where: { key: "de-market-competitors" },
    update: { value: data },
    create: { key: "de-market-competitors", value: data },
  });
}

// ─── Scan History (KeyValueStore) ───

export async function getScanHistory() {
  const db = await getDb();
  if (!db) return { scans: [] };
  const row = await db.keyValueStore.findUnique({ where: { key: "de-market-scan-history" } });
  return row?.value || { scans: [] };
}

async function appendScanHistory(results) {
  const db = await getDb();
  if (!db) return;
  const history = await getScanHistory();
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
  if (history.scans.length > 100) history.scans = history.scans.slice(-100);
  await db.keyValueStore.upsert({
    where: { key: "de-market-scan-history" },
    update: { value: history },
    create: { key: "de-market-scan-history", value: history },
  });
}

// ─── Price History (KeyValueStore, per model) ───

export async function getPriceHistory(modelId) {
  const db = await getDb();
  if (!db) return { modelId, history: [] };
  const row = await db.keyValueStore.findUnique({ where: { key: `de-market-price-history-${modelId}` } });
  return row?.value || { modelId, history: [] };
}

export async function appendPriceHistory(modelId, scanResult) {
  const db = await getDb();
  if (!db) return;
  const data = await getPriceHistory(modelId);
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
  if (data.history.length > 180) data.history = data.history.slice(-180);
  await db.keyValueStore.upsert({
    where: { key: `de-market-price-history-${modelId}` },
    update: { value: data },
    create: { key: `de-market-price-history-${modelId}`, value: data },
  });
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE", lastScanTimestamp: null, scansConductedToday: 0, totalListingsTracked: 0, errorCount24h: 0 };
  const s = await db.agentStatus.findUnique({ where: { id: "de-market" } });
  if (!s) return { status: "IDLE", lastScanTimestamp: null, scansConductedToday: 0, totalListingsTracked: 0, errorCount24h: 0 };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), errorCount24h: s.errorCount24h, updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(updates) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, errorCount24h, ...rest } = { ...current, ...updates };
  await db.agentStatus.upsert({
    where: { id: "de-market" },
    update: { name: "DE Market", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), errorCount24h: errorCount24h || 0, metadata: rest },
    create: { id: "de-market", name: "DE Market", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), errorCount24h: errorCount24h || 0, metadata: rest },
  });
}

// ─── Scan Progress (KeyValueStore) ───

export async function getScanProgress() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "de-market-scan-progress" } });
  return row?.value || null;
}

export async function saveScanProgress(data) {
  const db = await getDb();
  if (!db) return;
  await db.keyValueStore.upsert({
    where: { key: "de-market-scan-progress" },
    update: { value: data || {} },
    create: { key: "de-market-scan-progress", value: data || {} },
  });
}

export async function clearScanProgress() {
  const db = await getDb();
  if (!db) return;
  await db.keyValueStore.delete({ where: { key: "de-market-scan-progress" } }).catch(() => {});
}
