/**
 * Portfolio Manager — maintains portfolio state for decision-making.
 *
 * Calculates: total capital deployed, brand allocation, segment distribution,
 * available capacity, and portfolio health score.
 */

import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { getAllTransactions } from "@/lib/agents/finance/storage";
import { computeAvailableCapital } from "@/lib/agents/finance/treasury";

/**
 * Load current portfolio state from all agent data.
 */
export async function loadPortfolioState() {
  const pipelineData = await getPipelineVehicles();
  const vehicles = pipelineData.vehicles || [];
  const allTxns = (await getAllTransactions()).transactions || [];

  // Calculate capital deployed per vehicle
  let totalCapitalDeployed = 0;
  const brandCapital = {};
  // Spec §7.1 segment bands: €50-80k / €80-120k / €120k+
  const segmentCounts = { STANDARD: 0, PREMIUM: 0, ULTRA_PREMIUM: 0 };
  const modelCounts = {};

  for (const v of vehicles) {
    const vTxns = allTxns.filter((t) => t.vehicleId === v.id && t.category !== "SALE_PROCEEDS");
    const vehicleCapital = vTxns.reduce((s, t) => s + t.amountEur, 0) || v.landedCostEur || v.landedCost?.totalLandedCostEur || 100000;

    totalCapitalDeployed += vehicleCapital;

    const make = v.make || "Unknown";
    brandCapital[make] = (brandCapital[make] || 0) + vehicleCapital;

    const modelKey = `${make}|${v.model || ""}`;
    modelCounts[modelKey] = (modelCounts[modelKey] || 0) + 1;

    const cost = vehicleCapital;
    if (cost > 120000) segmentCounts.ULTRA_PREMIUM++;
    else if (cost > 80000) segmentCounts.PREMIUM++;
    else segmentCounts.STANDARD++;
  }

  // Real treasury — docx §7.1 "available capital" + §6.4 Finance cash tracking.
  // Derived from the transaction ledger: opening capital + realized P&L on sold
  // vehicles. Falls back to env baseline if the ledger query fails.
  const treasury = await computeAvailableCapital();
  const totalAvailableCapital = treasury.availableCapitalEur;

  // Brand concentration percentages
  const brandConcentration = {};
  for (const [brand, capital] of Object.entries(brandCapital)) {
    brandConcentration[brand] = totalCapitalDeployed > 0 ? capital / totalCapitalDeployed : 0;
  }

  // Portfolio health score (0-100)
  const diversificationScore = Object.values(brandConcentration).every((c) => c <= 0.30) ? 30 : 10;
  const capitalScore = (totalCapitalDeployed / totalAvailableCapital) <= 0.80 ? 30 : 15;
  const vehicleCount = vehicles.length;
  const volumeScore = vehicleCount >= 5 && vehicleCount <= 20 ? 20 : vehicleCount < 5 ? 10 : 15;
  const segmentScore = Object.values(segmentCounts).filter((c) => c > 0).length >= 2 ? 20 : 10;
  const healthScore = diversificationScore + capitalScore + volumeScore + segmentScore;

  return {
    totalVehicles: vehicles.length,
    totalCapitalDeployed,
    totalAvailableCapital,
    deploymentPct: Number(((totalCapitalDeployed / totalAvailableCapital) * 100).toFixed(1)),
    remainingCapacity: totalAvailableCapital * 0.80 - totalCapitalDeployed,
    canAddMore: totalCapitalDeployed < totalAvailableCapital * 0.80,

    // Full treasury breakdown so the decision brief + UI can show the operator
    // how `totalAvailableCapital` was derived (opening capital + realized P&L).
    treasury,

    brandCapital,
    brandConcentration,

    segmentCounts,
    modelCounts,
    totalCapital: totalCapitalDeployed,

    healthScore,
    healthLevel: healthScore >= 80 ? "EXCELLENT" : healthScore >= 60 ? "GOOD" : healthScore >= 40 ? "FAIR" : "POOR",

    vehicles: vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      currentStage: v.currentStage,
      estimatedValue: v.estimatedSaleEur || v.pricing?.deMarketMedian,
      landedCost: v.landedCostEur || v.landedCost?.totalLandedCostEur,
    })),

    calculatedAt: new Date().toISOString(),
  };
}
