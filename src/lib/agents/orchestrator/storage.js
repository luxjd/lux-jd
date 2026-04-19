/**
 * Orchestrator Agent Storage — decisions, portfolio snapshots.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Decisions ───

export async function getDecisions() {
  const db = await getDb();
  if (!db) return { decisions: [] };
  const decisions = await db.orchestratorDecision.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return {
    decisions: decisions.map((d) => ({
      id: d.id,
      vehicleName: d.vehicleName,
      opportunityId: d.opportunityId,
      decision: d.decision,
      decisionReason: d.decisionReason,
      steps: d.steps,
      financials: d.financials,
      risk: d.risk,
      portfolio: d.portfolio,
      brief: d.brief,
      flagReasons: d.flagReasons,
      savedAt: d.createdAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export async function saveDecision(decision) {
  const db = await getDb();
  if (!db) return;
  await db.orchestratorDecision.create({
    data: {
      vehicleName: decision.vehicleName || "Unknown",
      opportunityId: decision.opportunityId || null,
      decision: decision.decision || "HUMAN_REVIEW",
      decisionReason: decision.decisionReason || decision.reason || "",
      steps: decision.steps || [],
      financials: decision.financials || {},
      risk: decision.risk || {},
      portfolio: decision.portfolio || {},
      brief: decision.brief || null,
      flagReasons: decision.flagReasons || [],
    },
  });
}

/**
 * Return the most recent decision for this opportunity, or null.
 * Used by evaluate/override routes to enforce idempotency (no double-processing).
 */
export async function getLastDecisionForOpportunity(opportunityId) {
  if (!opportunityId) return null;
  const db = await getDb();
  if (!db) return null;
  return db.orchestratorDecision.findFirst({
    where: { opportunityId },
    orderBy: { createdAt: "desc" },
  });
}

const TERMINAL_DECISIONS = new Set(["AUTO_APPROVE", "HUMAN_APPROVED", "HUMAN_REJECTED", "REJECT"]);

/** A decision is "terminal" once the opp has been approved, rejected, or human-resolved. */
export function isTerminalDecision(decision) {
  return TERMINAL_DECISIONS.has(decision);
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE" };
  const s = await db.agentStatus.findUnique({ where: { id: "orchestrator" } });
  if (!s) return { status: "IDLE" };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(u) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...u };
  await db.agentStatus.upsert({
    where: { id: "orchestrator" },
    update: { name: "Orchestrator", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "orchestrator", name: "Orchestrator", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}

// ─── Portfolio Snapshot (KeyValueStore) ───

export async function getLatestPortfolioSnapshot() {
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: "orchestrator-portfolio-snapshot" } });
  return row?.value || null;
}

export async function savePortfolioSnapshot(s) {
  const db = await getDb();
  if (!db) return;
  const value = { ...s, savedAt: new Date().toISOString() };
  await db.keyValueStore.upsert({
    where: { key: "orchestrator-portfolio-snapshot" },
    update: { value },
    create: { key: "orchestrator-portfolio-snapshot", value },
  });
}
