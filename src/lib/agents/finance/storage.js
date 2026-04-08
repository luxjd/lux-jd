/**
 * Finance Agent Storage.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Transactions ───

export async function getAllTransactions() {
  const db = await getDb();
  if (!db) return { transactions: [] };
  const transactions = await db.transaction.findMany({ orderBy: { transactionDate: "desc" } });
  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      vehicleId: t.vehicleId,
      category: t.category,
      amountEur: Number(t.amountEur),
      amountOriginal: t.amountOriginal ? Number(t.amountOriginal) : null,
      currency: t.currency,
      fxRate: t.fxRate ? Number(t.fxRate) : null,
      description: t.description,
      documentRef: t.documentRef,
      transactionDate: t.transactionDate.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function getTransactionsByVehicle(vehicleId) {
  const all = await getAllTransactions();
  return (all.transactions || []).filter((t) => t.vehicleId === vehicleId);
}

export async function addTransaction(txn) {
  const db = await getDb();
  if (!db) return txn;
  const created = await db.transaction.create({
    data: {
      vehicleId: txn.vehicleId,
      category: txn.category,
      amountEur: txn.amountEur,
      amountOriginal: txn.amountOriginal || null,
      currency: txn.currency || "EUR",
      fxRate: txn.fxRate || null,
      description: txn.description || null,
      documentRef: txn.documentRef || null,
      transactionDate: txn.transactionDate ? new Date(txn.transactionDate) : new Date(),
    },
  });
  return created;
}

export async function addTransactions(txns) {
  const db = await getDb();
  if (!db) return;
  for (const txn of txns) {
    await addTransaction(txn);
  }
}

// ─── FX Rate History ───

export async function getFxHistory() {
  const db = await getDb();
  if (!db) return { rates: [] };
  const rates = await db.fxRate.findMany({ orderBy: { createdAt: "desc" }, take: 365 });
  return {
    rates: rates.reverse().map((r) => ({
      rate: Number(r.rate),
      source: r.source,
      live: r.live,
      timestamp: r.createdAt.toISOString(),
    })),
  };
}

export async function addFxRate(rate) {
  const db = await getDb();
  if (!db) return;
  await db.fxRate.create({
    data: {
      rate: typeof rate === "object" ? rate.rate : rate,
      source: typeof rate === "object" ? (rate.source || "frankfurter.app") : "frankfurter.app",
      live: typeof rate === "object" ? (rate.live !== undefined ? rate.live : true) : true,
    },
  });
}

// ─── FX Alerts ───

export async function getFxAlerts() {
  const db = await getDb();
  if (!db) return { alerts: [] };
  const alerts = await db.fxAlert.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return {
    alerts: alerts.reverse().map((a) => ({
      id: a.id,
      level: a.level,
      type: a.type,
      message: a.message,
      impact: a.impact,
      timestamp: a.createdAt.toISOString(),
    })),
  };
}

export async function addFxAlert(alert) {
  const db = await getDb();
  if (!db) return;
  await db.fxAlert.create({
    data: {
      level: alert.level || "INFO",
      type: alert.type || "general",
      message: alert.message || "",
      impact: alert.impact || null,
    },
  });
}

// ─── Portfolio Snapshots (KeyValueStore) ───

export async function getLatestPortfolio() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "finance-portfolio-latest" } });
  return row?.value || null;
}

export async function savePortfolio(data) {
  const db = await getDb();
  if (!db) return;
  const value = { ...data, savedAt: new Date().toISOString() };
  await db.keyValueStore.upsert({
    where: { key: "finance-portfolio-latest" },
    update: { value },
    create: { key: "finance-portfolio-latest", value },
  });
}

// ─── Tax Reports (KeyValueStore) ───

export async function getLatestTaxReport() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "finance-tax-latest" } });
  return row?.value || null;
}

export async function saveTaxReport(data) {
  const db = await getDb();
  if (!db) return;
  await db.keyValueStore.upsert({
    where: { key: "finance-tax-latest" },
    update: { value: data },
    create: { key: "finance-tax-latest", value: data },
  });
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE" };
  const s = await db.agentStatus.findUnique({ where: { id: "finance" } });
  if (!s) return { status: "IDLE" };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(u) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...u };
  await db.agentStatus.upsert({
    where: { id: "finance" },
    update: { name: "Finance", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "finance", name: "Finance", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}
