/**
 * Finance Agent Orchestrator — runs full financial analysis.
 *
 * Operations:
 * 1. Record transaction for a vehicle
 * 2. Run FX check with alerts
 * 3. Calculate per-vehicle P&L
 * 4. Calculate portfolio P&L
 * 5. Generate tax comparison
 * 6. Project cash flow
 */

import { isAIAvailable } from "@/lib/claude";
import { formatEur } from "@/lib/format";
import { createTransaction, generateTransactionsFromLandedCost, calculateCompleteness } from "../ledger";
import { calculateVehiclePnL, calculatePortfolioPnL } from "./pnl-engine";
import { checkFxRate, calculateFxImpact, calculatePortfolioFxExposure } from "./fx-monitor";
import { compareTaxTreatments, generateVatDeclaration, reviewTaxCompliance } from "./tax-optimizer";
import { runRegulatoryCheck } from "./regulatory-monitor";
import { projectCashFlow } from "./cashflow-projector";
import { calculateCostDelta, calculatePredictionAccuracy } from "./cost-delta";
import { saveCostEstimate, landedCostToCategoryMap } from "../cost-estimates";
import {
  addTransaction, addTransactions, getTransactionsByVehicle, getAllTransactions,
  getFxHistory, addFxRate, addFxAlert,
  savePortfolio, saveTaxReport, updateAgentStatus,
} from "../storage";

/**
 * Record a single cost transaction.
 */
export async function recordTransaction(data) {
  const txn = createTransaction(data);
  await addTransaction(txn);
  await updateAgentStatus({ status: "ONLINE", lastAction: `Recorded ${data.category} for ${data.vehicleId}` });
  return txn;
}

/**
 * Record all costs from a landed cost breakdown (when vehicle enters pipeline).
 *
 * Docx §6.4.2.1: also freezes a Sourcing-agent cost estimate snapshot so
 * future actuals can be compared against prediction (idempotent — preserves
 * the original snapshot if one already exists).
 */
export async function recordLandedCosts(vehicleId, landedCost, fxRate, { opportunityId = null, sourceAgent = "jp-sourcing" } = {}) {
  // Freeze the Sourcing-agent estimate BEFORE generating transactions, so
  // the delta engine has a stable baseline. Per-vehicle idempotent.
  await saveCostEstimate(vehicleId, {
    byCategory: landedCostToCategoryMap(landedCost),
    totalLandedCostEur: landedCost.totalLandedCostEur,
    sourceAgent,
    opportunityId,
  });

  const txns = generateTransactionsFromLandedCost(vehicleId, landedCost, fxRate);
  await addTransactions(txns);
  await updateAgentStatus({ status: "ONLINE", lastAction: `Recorded ${txns.length} transactions for ${vehicleId}` });
  return { recorded: txns.length, transactions: txns };
}

/**
 * Record a vehicle sale.
 */
export async function recordSale(vehicleId, salePrice, date) {
  const txn = createTransaction({
    vehicleId,
    category: "SALE_PROCEEDS",
    amountEur: salePrice,
    description: `Vehicle sold for ${formatEur(salePrice)}`,
    date,
  });
  await addTransaction(txn);
  await updateAgentStatus({ status: "ONLINE", lastAction: `Recorded sale of ${vehicleId} for ${formatEur(salePrice)}` });
  return txn;
}

/**
 * Run a full financial health check.
 *
 * @param {Array} vehicles — active pipeline vehicles
 * @param {{ upcomingPurchases?: Array }} [opts]
 *   upcomingPurchases: pending Orchestrator AUTO_APPROVE commitments not yet
 *   reflected in the ledger. Each: {vehicleName, expectedPurchaseDate,
 *   expectedOutlayEur, opportunityId?}. Feeds cash-flow projection per
 *   docx §6.4.2.3.
 */
export async function runFinancialCheck(vehicles, { upcomingPurchases = [] } = {}) {
  const startTime = Date.now();
  await updateAgentStatus({ status: "ANALYZING" });

  const allTxns = (await getAllTransactions()).transactions || [];

  // ─── FX Check ───
  const fxHistory = await getFxHistory();
  const fxCheck = await checkFxRate(fxHistory.rates || []);
  await addFxRate(fxCheck.current.rate);

  if (fxCheck.alerts.length > 0) {
    for (const alert of fxCheck.alerts) {
      await addFxAlert(alert);
    }
  }

  // ─── Per-Vehicle P&Ls ───
  const vehiclePnLs = vehicles.map((v) => {
    const txns = allTxns.filter((t) => t.vehicleId === v.id);
    return calculateVehiclePnL(v, txns);
  });

  // ─── Portfolio P&L ───
  const portfolioPnL = calculatePortfolioPnL(vehiclePnLs);
  await savePortfolio(portfolioPnL);

  // ─── Tax Comparison (for sold vehicles) ───
  const taxComparisons = vehiclePnLs
    .filter((v) => v.revenue.salePrice > 0)
    .map((v) => compareTaxTreatments(
      { id: v.vehicleId, purchasePriceEur: v.costs.byCategory?.PURCHASE },
      v.revenue.salePrice,
      v.costs.landedCostEur,
      v.costs.importVatEur,
    ));

  // ─── VAT Declaration ───
  const now = new Date();
  const vatDeclaration = generateVatDeclaration(allTxns, now.getMonth() + 1, now.getFullYear());

  // ─── Portfolio FX Exposure ───
  const fxExposure = calculatePortfolioFxExposure(vehicles, fxCheck.current.rate);

  // ─── Cash Flow Projection (with upcoming purchases per docx §6.4.2.3) ───
  const cashFlow = projectCashFlow(vehicles, allTxns, 8, upcomingPurchases);

  // ─── Regulatory Check (vehicles fed in so reported changes get impact calc) ───
  const regulatoryCheck = await runRegulatoryCheck(vehicles);

  // ─── Cost Prediction Accuracy (docx §6.4.2.1 feedback loop) ───
  const predictionAccuracy = await calculatePredictionAccuracy(
    vehicles.map((v) => ({
      vehicle: v,
      transactions: allTxns.filter((t) => t.vehicleId === v.id),
    }))
  );

  // ─── AI Tax Review (if available) ───
  let taxReview = null;
  if (isAIAvailable()) {
    taxReview = await reviewTaxCompliance(portfolioPnL, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }

  const report = {
    fxCheck,
    fxExposure,
    vehiclePnLs,
    portfolioPnL,
    taxComparisons,
    vatDeclaration,
    cashFlow,
    predictionAccuracy,
    taxReview,
    regulatoryCheck,
    duration: Date.now() - startTime,
    aiPowered: isAIAvailable(),
    generatedAt: new Date().toISOString(),
  };

  await saveTaxReport({ taxComparisons, vatDeclaration, taxReview, generatedAt: report.generatedAt });

  await updateAgentStatus({
    status: "ONLINE",
    lastAction: `Financial check complete — ${vehiclePnLs.length} vehicles analyzed`,
    lastCheckTimestamp: new Date().toISOString(),
    fxRate: fxCheck.current.rate,
    fxStatus: fxCheck.status,
    alertCount: fxCheck.alerts.length,
    portfolioMargin: portfolioPnL.summary.totalMargin,
    capitalDeployed: portfolioPnL.summary.totalCapitalDeployed,
    predictionBiasPct: predictionAccuracy.signedBiasPct ?? null,
    regulatoryAlerts: regulatoryCheck.alerts?.length || 0,
  });

  return report;
}

/**
 * Per-vehicle cost-delta lookup (re-export for route handlers / UI).
 * Returns actual-vs-estimate comparison; `hasEstimate: false` when no
 * snapshot was captured at approval time.
 */
export async function getVehicleCostDelta(vehicle) {
  const txns = await getTransactionsByVehicle(vehicle.id);
  return calculateCostDelta(vehicle, txns);
}
