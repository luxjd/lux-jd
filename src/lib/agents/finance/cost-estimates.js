/**
 * Cost Estimate Snapshots — frozen Sourcing-agent estimates for accuracy tracking.
 *
 * Docx §6.4.2 Function 1: "Track every cost in real-time from purchase to sale.
 * **Compare actual costs against estimates from the Sourcing Agent to
 * continuously improve cost prediction accuracy**."
 *
 * Flow:
 *   1. When a vehicle is approved by Orchestrator and its landed-cost
 *      breakdown enters the Finance ledger, `saveCostEstimate` captures a
 *      FROZEN snapshot of the Sourcing-agent's estimate keyed by vehicleId.
 *   2. As real invoices materialize, operator-recorded transactions may diverge
 *      from the initial estimate (e.g., higher auction fee, cheaper freight).
 *   3. `calculateCostDelta` (in ai/cost-delta.js) compares the two.
 *   4. Aggregated across the fleet → cost-prediction bias per category,
 *      which feeds back to Sourcing to improve future estimates.
 *
 * Storage: `KeyValueStore` table (Prisma), key = `cost-estimate.{vehicleId}`.
 * No new tables needed — the schema's JSON column handles the structured
 * payload cleanly.
 */

import { getDb } from "@/lib/db";

const KEY_PREFIX = "cost-estimate.";

/**
 * Capture the Sourcing-agent's landed-cost estimate as a frozen snapshot.
 *
 * By default NEVER overwrites an existing snapshot — the whole point is that
 * the estimate is frozen at approval time. Pass `{ overwrite: true }` only
 * when the operator explicitly replaces the baseline (rare).
 *
 * @param {string} vehicleId
 * @param {object} estimate — {byCategory, totalLandedCostEur, sourceAgent, opportunityId}
 * @param {{overwrite?: boolean}} [opts]
 * @returns {Promise<object|null>} The stored snapshot (existing or new)
 */
export async function saveCostEstimate(vehicleId, estimate, { overwrite = false } = {}) {
  if (!vehicleId) return null;
  const db = await getDb();
  if (!db) return null;

  const key = `${KEY_PREFIX}${vehicleId}`;
  const existing = await db.keyValueStore.findUnique({ where: { key } });

  if (existing && !overwrite) {
    // Frozen-snapshot semantics: keep the original. Returns existing so caller
    // can observe that their save was a no-op.
    return { ...existing.value, preserved: true };
  }

  const value = {
    vehicleId,
    byCategory: normalizeCategoryMap(estimate.byCategory || {}),
    totalLandedCostEur: Number(estimate.totalLandedCostEur) || 0,
    sourceAgent: estimate.sourceAgent || "jp-sourcing",
    opportunityId: estimate.opportunityId || null,
    estimatedAt: new Date().toISOString(),
    overwritten: !!(existing && overwrite),
  };

  await db.keyValueStore.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return value;
}

/**
 * Get the frozen cost estimate snapshot for a vehicle.
 */
export async function getCostEstimate(vehicleId) {
  if (!vehicleId) return null;
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: `${KEY_PREFIX}${vehicleId}` } });
  return row?.value || null;
}

/**
 * Get all cost estimate snapshots (portfolio-wide accuracy analysis).
 */
export async function getAllCostEstimates() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.keyValueStore.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  return rows.map((r) => r.value);
}

/**
 * Map a landed-cost breakdown (as emitted by Valuation/JP-Sourcing) into the
 * ledger's category taxonomy. Keeps the snapshot directly comparable to
 * actual transactions grouped by category.
 */
export function landedCostToCategoryMap(landedCost) {
  if (!landedCost || typeof landedCost !== "object") return {};
  return {
    PURCHASE: Number(landedCost.purchasePriceEur) || 0,
    AUCTION_FEE: Number(landedCost.auctionFeesEur) || 0,
    TRANSPORT_JP: Number(landedCost.jpTransportEur) || 400,
    EXPORT_DOCS: Number(landedCost.exportDocsEur) || 175,
    FREIGHT: Number(landedCost.freightEur) || 2800,
    INSURANCE: Number(landedCost.insuranceEur) || 0,
    CUSTOMS_DUTY: Number(landedCost.customsDutyEur) || 0,
    IMPORT_VAT: Number(landedCost.importVatEur) || 0,
    PORT_HANDLING: Number(landedCost.portHandlingEur) || 600,
    TUV: Number(landedCost.tuvEstimatedEur) || 400,
    REGISTRATION: Number(landedCost.registrationEur) || 150,
    TRANSPORT_DE: Number(landedCost.deTransportEur) || 450,
    DETAILING: Number(landedCost.detailingEur) || 1200,
    PHOTOGRAPHY: Number(landedCost.photographyEur) || 500,
  };
}

function normalizeCategoryMap(byCategory) {
  const out = {};
  for (const [cat, v] of Object.entries(byCategory)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[cat] = n;
  }
  return out;
}
