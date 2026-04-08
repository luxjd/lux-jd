/**
 * FX Monitor — tracks JPY/EUR rate with alert thresholds.
 *
 * Fetches live rate, compares to historical averages,
 * generates alerts when thresholds are breached.
 */

import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";

// Alert thresholds per PRD
const ALERT_THRESHOLDS = {
  DAILY_MOVE: 1.0,     // >1% single-day move → DAILY ALERT
  DEVIATION_WARN: 2.0,  // >2% from 30-day avg → WARN
  DEVIATION_CRITICAL: 5.0, // >5% from 30-day avg → CRITICAL
};

/**
 * Fetch current rate and check against thresholds.
 */
export async function checkFxRate(rateHistory = []) {
  const fxData = await fetchFxRate();
  const currentRate = fxData.rate;

  // Calculate averages from history
  const last30 = rateHistory.slice(-30);
  const last7 = rateHistory.slice(-7);
  const avg30d = last30.length > 0 ? last30.reduce((s, r) => s + r.rate, 0) / last30.length : currentRate;
  const avg7d = last7.length > 0 ? last7.reduce((s, r) => s + r.rate, 0) / last7.length : currentRate;
  const previousRate = rateHistory.length > 0 ? rateHistory[rateHistory.length - 1].rate : currentRate;

  // Calculate deviations
  const deviation30d = ((currentRate - avg30d) / avg30d) * 100;
  const dailyChange = ((currentRate - previousRate) / previousRate) * 100;

  // Generate alerts
  const alerts = [];

  if (Math.abs(dailyChange) >= ALERT_THRESHOLDS.DAILY_MOVE) {
    alerts.push({
      level: "WARN",
      type: "DAILY_MOVE",
      message: `EUR/JPY moved ${dailyChange > 0 ? "+" : ""}${dailyChange.toFixed(2)}% in 24h (¥${previousRate.toFixed(2)} → ¥${currentRate.toFixed(2)})`,
      impact: dailyChange > 0 ? "JPY weakening — imports cheaper" : "JPY strengthening — margins shrinking",
    });
  }

  if (Math.abs(deviation30d) >= ALERT_THRESHOLDS.DEVIATION_CRITICAL) {
    alerts.push({
      level: "CRITICAL",
      type: "DEVIATION_CRITICAL",
      message: `EUR/JPY deviated ${deviation30d > 0 ? "+" : ""}${deviation30d.toFixed(1)}% from 30-day average (¥${avg30d.toFixed(2)} → ¥${currentRate.toFixed(2)})`,
      impact: "Immediate margin recalculation required on all pipeline vehicles",
    });
  } else if (Math.abs(deviation30d) >= ALERT_THRESHOLDS.DEVIATION_WARN) {
    alerts.push({
      level: "WARN",
      type: "DEVIATION_WARN",
      message: `EUR/JPY deviated ${deviation30d > 0 ? "+" : ""}${deviation30d.toFixed(1)}% from 30-day average`,
      impact: "Monitor closely — may affect margin on pending purchases",
    });
  }

  // Favorable window detection
  if (currentRate > avg30d * 1.03) {
    alerts.push({
      level: "INFO",
      type: "FAVORABLE_WINDOW",
      message: `EUR/JPY at ¥${currentRate.toFixed(2)} — 3%+ above 30-day avg. Favorable buying window.`,
      impact: "Consider accelerating purchases — JPY is cheap",
    });
  }

  return {
    current: {
      rate: currentRate,
      live: fxData.live,
      source: fxData.source,
      timestamp: fxData.timestamp,
    },
    averages: {
      avg7d: Number(avg7d.toFixed(2)),
      avg30d: Number(avg30d.toFixed(2)),
    },
    changes: {
      daily: Number(dailyChange.toFixed(2)),
      deviation30d: Number(deviation30d.toFixed(2)),
    },
    buffer: {
      rate: Number((currentRate * 0.97).toFixed(2)),
      bufferPct: 3,
    },
    alerts,
    status: alerts.some((a) => a.level === "CRITICAL") ? "CRITICAL"
      : alerts.some((a) => a.level === "WARN") ? "WARN"
      : "NORMAL",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Calculate portfolio-wide FX exposure — realized vs estimated rates across all vehicles.
 * @param {Array} vehicles — all pipeline vehicles
 * @param {number} currentRate — current EUR/JPY rate
 * @returns {object} Portfolio FX exposure report
 */
export function calculatePortfolioFxExposure(vehicles, currentRate) {
  const exposures = [];
  let totalOriginalEur = 0;
  let totalCurrentEur = 0;
  let totalPurchaseJpy = 0;

  for (const v of vehicles) {
    const purchaseRate = v.fxRateAtPurchase || v.fxRateAtValuation || v.landedCost?.fxRateUsed;
    const purchaseJpy = v.askingPriceJpy || v.purchasePriceJpy || v.landedCost?.purchasePriceJpy;
    if (!purchaseRate || !purchaseJpy) continue;

    const originalEur = Math.round(purchaseJpy / purchaseRate);
    const currentEur = Math.round(purchaseJpy / currentRate);
    const impact = originalEur - currentEur;

    totalOriginalEur += originalEur;
    totalCurrentEur += currentEur;
    totalPurchaseJpy += purchaseJpy;

    exposures.push({
      vehicleId: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      stage: v.currentStage,
      purchaseJpy: purchaseJpy,
      purchaseRate: purchaseRate,
      purchaseCostEur: originalEur,
      currentCostEur: currentEur,
      impactEur: impact,
      impactPct: Number(((impact / originalEur) * 100).toFixed(1)),
      direction: impact > 0 ? "FAVORABLE" : impact < 0 ? "UNFAVORABLE" : "NEUTRAL",
    });
  }

  const totalImpact = totalOriginalEur - totalCurrentEur;
  const weightedAvgPurchaseRate = totalPurchaseJpy > 0 ? totalPurchaseJpy / totalOriginalEur : currentRate;

  return {
    summary: {
      vehiclesTracked: exposures.length,
      totalJpyExposure: totalPurchaseJpy,
      totalOriginalCostEur: totalOriginalEur,
      totalCurrentCostEur: totalCurrentEur,
      totalImpactEur: totalImpact,
      totalImpactPct: totalOriginalEur > 0 ? Number(((totalImpact / totalOriginalEur) * 100).toFixed(1)) : 0,
      direction: totalImpact > 0 ? "FAVORABLE" : totalImpact < 0 ? "UNFAVORABLE" : "NEUTRAL",
      weightedAvgPurchaseRate: Number(weightedAvgPurchaseRate.toFixed(2)),
      currentRate,
      rateChange: Number(((currentRate - weightedAvgPurchaseRate) / weightedAvgPurchaseRate * 100).toFixed(1)),
    },
    perVehicle: exposures,
    hedgingRecommendation: Math.abs(totalImpact) > 5000
      ? `Portfolio FX exposure is €${Math.abs(totalImpact).toLocaleString()} ${totalImpact > 0 ? "favorable" : "unfavorable"}. Consider hedging ${totalPurchaseJpy > 10000000 ? "with forward contracts" : "by accumulating JPY during favorable windows"}.`
      : "FX exposure within acceptable range. No hedging action needed.",
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate FX impact on a specific vehicle.
 */
export function calculateFxImpact(vehicle, currentRate) {
  const purchaseRate = vehicle.fxRateAtPurchase || vehicle.landedCost?.fxRateUsed;
  if (!purchaseRate || !vehicle.purchasePriceJpy) return null;

  const originalEur = Math.round(vehicle.purchasePriceJpy / purchaseRate);
  const currentEur = Math.round(vehicle.purchasePriceJpy / currentRate);
  const impact = originalEur - currentEur;

  return {
    purchaseRate,
    currentRate,
    originalCostEur: originalEur,
    currentCostEur: currentEur,
    impactEur: impact,
    direction: impact > 0 ? "FAVORABLE" : impact < 0 ? "UNFAVORABLE" : "NEUTRAL",
    explanation: impact > 0
      ? `JPY weakened since purchase — you'd pay €${Math.abs(impact).toLocaleString()} less today`
      : impact < 0
      ? `JPY strengthened since purchase — cost increased by €${Math.abs(impact).toLocaleString()}`
      : "No FX impact — rate unchanged",
  };
}
