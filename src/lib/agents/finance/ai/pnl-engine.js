/**
 * P&L Engine — per-vehicle and portfolio-level profit & loss.
 *
 * Per vehicle: sums all costs by category, compares to sale/estimated price.
 * Portfolio: aggregates across all vehicles for capital efficiency metrics.
 */

import { calculateCompleteness, COST_CATEGORIES } from "../ledger";

/**
 * Calculate per-vehicle P&L.
 */
export function calculateVehiclePnL(vehicle, transactions) {
  const costs = {};
  let totalCostEur = 0;
  let importVatEur = 0;

  for (const txn of transactions) {
    if (txn.category === "SALE_PROCEEDS") continue;
    if (!costs[txn.category]) costs[txn.category] = 0;
    costs[txn.category] += txn.amountEur;
    totalCostEur += txn.amountEur;
    if (txn.category === "IMPORT_VAT") importVatEur += txn.amountEur;
  }

  // Landed cost = total minus reclaimable VAT
  const landedCostEur = totalCostEur - importVatEur;

  // Sale
  const saleTxn = transactions.find((t) => t.category === "SALE_PROCEEDS");
  const actualSalePrice = saleTxn?.amountEur || null;
  const estimatedSalePrice = vehicle.estimatedSaleEur || vehicle.pricing?.deMarketMedian || 0;
  const salePrice = actualSalePrice || estimatedSalePrice;
  const isSold = !!actualSalePrice;

  // Margins
  const grossMargin = salePrice - landedCostEur;
  const grossMarginPct = salePrice > 0 ? Number(((grossMargin / salePrice) * 100).toFixed(1)) : 0;

  // FX impact
  const purchaseFxRate = vehicle.fxRateAtPurchase || vehicle.landedCost?.fxRateUsed;
  const currentFxRate = vehicle.currentFxRate || 183.94;
  const fxImpact = purchaseFxRate && currentFxRate !== purchaseFxRate
    ? Math.round((vehicle.purchasePriceJpy || 0) * (1 / currentFxRate - 1 / purchaseFxRate))
    : 0;

  const completeness = calculateCompleteness(transactions);

  // Days in pipeline
  const enteredAt = vehicle.addedAt || vehicle.stageHistory?.[0]?.enteredAt;
  const daysInPipeline = enteredAt ? Math.round((Date.now() - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // Capital efficiency
  const totalCashOutlay = totalCostEur; // includes VAT (cash actually spent)
  const annualizedRoi = daysInPipeline > 0 && grossMargin > 0
    ? Number(((grossMargin / totalCashOutlay) * (365 / Math.max(daysInPipeline, 1)) * 100).toFixed(1))
    : 0;

  return {
    vehicleId: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    status: isSold ? "SOLD" : "IN_PIPELINE",

    costs: {
      byCategory: costs,
      totalCostEur,
      landedCostEur,
      importVatEur,
      reclaimableVat: importVatEur,
      totalCashOutlay: totalCostEur,
    },

    revenue: {
      estimatedSalePrice,
      actualSalePrice,
      salePrice,
      isSold,
    },

    margin: {
      grossMarginEur: grossMargin,
      grossMarginPct,
      marginAfterOpex: grossMargin - 500,
      isPositive: grossMargin > 0,
      meetsMinThreshold: grossMargin >= 15000 && grossMarginPct >= 20,
    },

    fx: {
      purchaseRate: purchaseFxRate,
      currentRate: currentFxRate,
      fxImpactEur: fxImpact,
    },

    efficiency: {
      daysInPipeline,
      annualizedRoi,
      capitalDeployed: totalCostEur,
    },

    completeness,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate portfolio-level P&L across all vehicles.
 */
export function calculatePortfolioPnL(vehiclePnLs) {
  const inPipeline = vehiclePnLs.filter((v) => v.status === "IN_PIPELINE");
  const sold = vehiclePnLs.filter((v) => v.status === "SOLD");

  const totalCapitalDeployed = inPipeline.reduce((s, v) => s + v.costs.totalCashOutlay, 0);
  const totalRevenue = sold.reduce((s, v) => s + (v.revenue.actualSalePrice || 0), 0);
  const totalCosts = sold.reduce((s, v) => s + v.costs.landedCostEur, 0);
  const realizedMargin = totalRevenue - totalCosts;
  const unrealizedMargin = inPipeline.reduce((s, v) => s + v.margin.grossMarginEur, 0);
  const totalFxImpact = vehiclePnLs.reduce((s, v) => s + (v.fx.fxImpactEur || 0), 0);
  const totalVatReclaimable = vehiclePnLs.reduce((s, v) => s + v.costs.reclaimableVat, 0);

  // Spec §6.4.2 point 2: "weighted average margin" — revenue-weighted, not a
  // simple arithmetic mean. Equivalent formulation: realizedMargin / totalRevenue.
  const avgMarginPct = totalRevenue > 0
    ? Number(((realizedMargin / totalRevenue) * 100).toFixed(1))
    : 0;

  const avgDaysToSell = sold.length > 0
    ? Math.round(sold.reduce((s, v) => s + v.efficiency.daysInPipeline, 0) / sold.length)
    : 0;

  const capitalTurnover = totalCapitalDeployed > 0
    ? Number(((totalRevenue / totalCapitalDeployed) * (365 / Math.max(avgDaysToSell, 30))).toFixed(1))
    : 0;

  // Real deployment % from actual available capital, not a hardcoded 62.
  // Uses the same env knob (`AVAILABLE_CAPITAL_EUR`) as Orchestrator's
  // portfolio-manager so the two agents agree on the denominator.
  const totalAvailableCapital = parseInt(process.env.AVAILABLE_CAPITAL_EUR || "2000000", 10);
  const deploymentPct = totalAvailableCapital > 0
    ? Number(((totalCapitalDeployed / totalAvailableCapital) * 100).toFixed(1))
    : 0;

  return {
    summary: {
      totalVehicles: vehiclePnLs.length,
      inPipeline: inPipeline.length,
      sold: sold.length,
      totalCapitalDeployed,
      totalRevenue,
      totalCosts,
      realizedMargin,
      unrealizedMargin,
      totalMargin: realizedMargin + unrealizedMargin,
      avgMarginPct,
      avgDaysToSell,
      capitalTurnover,
      totalFxImpact,
      totalVatReclaimable,
    },

    capitalDeployment: {
      deployed: totalCapitalDeployed,
      totalAvailable: totalAvailableCapital,
      maxAllowed: Math.round(totalAvailableCapital * 0.8),
      deploymentPct,
      withinLimit: deploymentPct <= 80,
    },

    brandConcentration: calculateBrandConcentration(inPipeline),

    vehicles: {
      inPipeline: inPipeline.map((v) => ({ id: v.vehicleId, make: v.make, model: v.model, margin: v.margin.grossMarginEur, capitalDeployed: v.costs.totalCashOutlay })),
      sold: sold.map((v) => ({ id: v.vehicleId, make: v.make, model: v.model, margin: v.margin.grossMarginEur, salePrice: v.revenue.actualSalePrice, daysToSell: v.efficiency.daysInPipeline })),
    },

    calculatedAt: new Date().toISOString(),
  };
}

function calculateBrandConcentration(vehicles) {
  const byBrand = {};
  const totalCapital = vehicles.reduce((s, v) => s + v.costs.totalCashOutlay, 0);

  for (const v of vehicles) {
    const brand = v.make;
    if (!byBrand[brand]) byBrand[brand] = 0;
    byBrand[brand] += v.costs.totalCashOutlay;
  }

  return Object.entries(byBrand).map(([brand, capital]) => ({
    brand,
    capitalEur: capital,
    concentrationPct: totalCapital > 0 ? Number(((capital / totalCapital) * 100).toFixed(1)) : 0,
    withinLimit: totalCapital > 0 ? (capital / totalCapital) <= 0.30 : true,
  })).sort((a, b) => b.concentrationPct - a.concentrationPct);
}
