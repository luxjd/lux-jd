/**
 * Cost Delta Engine — compare actual costs against Sourcing-agent estimates.
 *
 * Docx §6.4.2 Function 1: "Compare actual costs against estimates from the
 * Sourcing Agent to **continuously improve cost prediction accuracy**."
 *
 * Two levels of analysis:
 *
 *   1. Per-vehicle (`calculateCostDelta`) — for a single vehicle, compute the
 *      difference between the frozen estimate and the actual transactions,
 *      broken down by cost category. Status: ON_TARGET / OVER_BUDGET / UNDER_BUDGET.
 *
 *   2. Portfolio (`calculatePredictionAccuracy`) — aggregate across all
 *      vehicles that have both an estimate and actuals. Produces:
 *        - mean absolute deviation (how noisy is prediction?)
 *        - signed bias (systematic over-estimate or under-estimate?)
 *        - per-category bias (which costs are we consistently wrong about?)
 *
 *   The per-category bias is the signal that flows back to the Sourcing
 *   Agent for improving its landed-cost model.
 */

import { getCostEstimate, getAllCostEstimates } from "../cost-estimates";

const ON_TARGET_ABS_EUR = 50; // a €50 swing is noise, not a real overrun
const ON_TARGET_TOTAL_PCT = 5; // ±5% of total is "on target" at the vehicle level
const BIAS_THRESHOLD_PCT = 1; // ±1% portfolio bias is "unbiased"

/**
 * Compute per-vehicle cost delta against the frozen estimate.
 *
 * @param {object} vehicle      — pipeline vehicle record (must have `id`)
 * @param {Array}  transactions — Finance ledger rows for this vehicle
 * @returns {Promise<object>}
 */
export async function calculateCostDelta(vehicle, transactions) {
  if (!vehicle?.id) return { hasEstimate: false, reason: "no vehicle id" };

  const estimate = await getCostEstimate(vehicle.id);
  if (!estimate) {
    return {
      hasEstimate: false,
      reason: "no snapshot recorded at approval time",
      vehicleId: vehicle.id,
    };
  }

  // Bucket actuals by category (ignore SALE_PROCEEDS — revenue, not cost)
  const actualByCategory = {};
  let actualTotal = 0;
  for (const txn of transactions || []) {
    if (txn.category === "SALE_PROCEEDS") continue;
    const amt = Number(txn.amountEur) || 0;
    actualByCategory[txn.category] = (actualByCategory[txn.category] || 0) + amt;
    actualTotal += amt;
  }

  // Per-category deltas — sorted by largest absolute overrun first
  const allCategories = new Set([
    ...Object.keys(estimate.byCategory || {}),
    ...Object.keys(actualByCategory),
  ]);
  const perCategory = [];
  for (const cat of allCategories) {
    const est = Number(estimate.byCategory?.[cat]) || 0;
    const act = Number(actualByCategory[cat]) || 0;
    const deltaEur = act - est;
    const absDelta = Math.abs(deltaEur);
    const deltaPct = est > 0 ? Number(((deltaEur / est) * 100).toFixed(1)) : null;

    let status;
    if (absDelta < ON_TARGET_ABS_EUR) status = "ON_TARGET";
    else if (deltaEur > 0) status = "OVERRUN";
    else status = "UNDER_BUDGET";

    perCategory.push({
      category: cat,
      estimatedEur: Math.round(est),
      actualEur: Math.round(act),
      deltaEur: Math.round(deltaEur),
      deltaPct,
      status,
    });
  }
  perCategory.sort((a, b) => Math.abs(b.deltaEur) - Math.abs(a.deltaEur));

  const totalDeltaEur = actualTotal - (estimate.totalLandedCostEur || 0);
  const totalDeltaPct = estimate.totalLandedCostEur > 0
    ? Number(((totalDeltaEur / estimate.totalLandedCostEur) * 100).toFixed(1))
    : null;

  let totalStatus;
  if (totalDeltaPct == null) totalStatus = "UNKNOWN";
  else if (Math.abs(totalDeltaPct) < ON_TARGET_TOTAL_PCT) totalStatus = "ON_TARGET";
  else if (totalDeltaEur > 0) totalStatus = "OVER_BUDGET";
  else totalStatus = "UNDER_BUDGET";

  // Worst single overrun — useful for per-vehicle alerts
  const worstOverrun = perCategory.find((c) => c.status === "OVERRUN") || null;

  return {
    hasEstimate: true,
    vehicleId: vehicle.id,
    vehicleName: `${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.year || ""}`.trim(),
    estimatedAt: estimate.estimatedAt,
    sourceAgent: estimate.sourceAgent,
    opportunityId: estimate.opportunityId,
    estimatedTotalEur: Math.round(estimate.totalLandedCostEur || 0),
    actualTotalEur: Math.round(actualTotal),
    totalDeltaEur: Math.round(totalDeltaEur),
    totalDeltaPct,
    status: totalStatus,
    perCategory,
    worstOverrun,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Portfolio-level cost-prediction accuracy — the feedback signal that the
 * Sourcing Agent needs to improve its landed-cost model.
 *
 * Aggregates vehicle-level deltas into:
 *   - meanAbsoluteDeviationPct: how noisy is prediction on average?
 *   - signedBiasPct: are we systematically over- or under-estimating?
 *   - perCategoryAccuracy: which cost categories drive the bias?
 *
 * @param {Array<{vehicle: object, transactions: Array}>} vehiclesWithTxns
 */
export async function calculatePredictionAccuracy(vehiclesWithTxns) {
  const deltas = [];
  for (const { vehicle, transactions } of vehiclesWithTxns || []) {
    const d = await calculateCostDelta(vehicle, transactions);
    if (d.hasEstimate) deltas.push(d);
  }

  if (deltas.length === 0) {
    return {
      hasData: false,
      vehicleCount: 0,
      message: "No cost-estimate snapshots recorded yet — ensure `saveCostEstimate` runs when a vehicle enters the pipeline.",
      generatedAt: new Date().toISOString(),
    };
  }

  // Aggregate per-category across all vehicles
  const categoryTotals = {};
  for (const d of deltas) {
    for (const c of d.perCategory) {
      if (!categoryTotals[c.category]) {
        categoryTotals[c.category] = { aggregateEstimatedEur: 0, aggregateActualEur: 0, sampleSize: 0 };
      }
      const slot = categoryTotals[c.category];
      slot.aggregateEstimatedEur += c.estimatedEur;
      slot.aggregateActualEur += c.actualEur;
      slot.sampleSize++;
    }
  }

  const perCategoryAccuracy = Object.entries(categoryTotals).map(([cat, s]) => {
    const biasEur = s.aggregateActualEur - s.aggregateEstimatedEur;
    const biasPct = s.aggregateEstimatedEur > 0
      ? Number(((biasEur / s.aggregateEstimatedEur) * 100).toFixed(1))
      : null;
    return {
      category: cat,
      sampleSize: s.sampleSize,
      aggregateEstimatedEur: Math.round(s.aggregateEstimatedEur),
      aggregateActualEur: Math.round(s.aggregateActualEur),
      biasEur: Math.round(biasEur),
      biasPct,
      biasDirection: biasPct == null ? "UNKNOWN"
        : biasPct > BIAS_THRESHOLD_PCT ? "UNDERESTIMATE"
        : biasPct < -BIAS_THRESHOLD_PCT ? "OVERESTIMATE"
        : "ACCURATE",
    };
  }).sort((a, b) => Math.abs(b.biasPct || 0) - Math.abs(a.biasPct || 0));

  const deltasWithPct = deltas.filter((d) => d.totalDeltaPct != null);
  const mad = deltasWithPct.length > 0
    ? deltasWithPct.reduce((s, d) => s + Math.abs(d.totalDeltaPct), 0) / deltasWithPct.length
    : 0;
  const signedBias = deltasWithPct.length > 0
    ? deltasWithPct.reduce((s, d) => s + d.totalDeltaPct, 0) / deltasWithPct.length
    : 0;

  const biasDirection = signedBias > BIAS_THRESHOLD_PCT ? "SYSTEMATIC_UNDERESTIMATE"
    : signedBias < -BIAS_THRESHOLD_PCT ? "SYSTEMATIC_OVERESTIMATE"
    : "UNBIASED";

  // Top 3 overrunning categories — this is the actionable signal that feeds
  // back into the Sourcing Agent's landed-cost model.
  const topOverruns = perCategoryAccuracy
    .filter((c) => c.biasDirection === "UNDERESTIMATE")
    .slice(0, 3);
  const topOverestimates = perCategoryAccuracy
    .filter((c) => c.biasDirection === "OVERESTIMATE")
    .slice(0, 3);

  return {
    hasData: true,
    vehicleCount: deltas.length,
    meanAbsoluteDeviationPct: Number(mad.toFixed(1)),
    signedBiasPct: Number(signedBias.toFixed(1)),
    biasDirection,
    perCategoryAccuracy,
    feedbackForSourcing: {
      topUnderestimatedCategories: topOverruns.map((c) => ({
        category: c.category,
        biasPct: c.biasPct,
        suggestion: `Sourcing Agent should increase ${c.category} estimate by ~${c.biasPct}% based on ${c.sampleSize} vehicle(s) actual outcomes.`,
      })),
      topOverestimatedCategories: topOverestimates.map((c) => ({
        category: c.category,
        biasPct: c.biasPct,
        suggestion: `Sourcing Agent can lower ${c.category} estimate by ~${Math.abs(c.biasPct)}% — consistently over-budgeted.`,
      })),
    },
    perVehicle: deltas.map((d) => ({
      vehicleId: d.vehicleId,
      vehicleName: d.vehicleName,
      totalDeltaEur: d.totalDeltaEur,
      totalDeltaPct: d.totalDeltaPct,
      status: d.status,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * List all cost estimates on file — useful for the Finance dashboard.
 */
export async function listCostEstimates() {
  return getAllCostEstimates();
}
