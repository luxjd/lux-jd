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
import { createTransaction, generateTransactionsFromLandedCost, calculateCompleteness } from "../ledger";
import { calculateVehiclePnL, calculatePortfolioPnL } from "./pnl-engine";
import { checkFxRate, calculateFxImpact } from "./fx-monitor";
import { compareTaxTreatments, generateVatDeclaration, reviewTaxCompliance } from "./tax-optimizer";
import { projectCashFlow } from "./cashflow-projector";
import {
  addTransaction, addTransactions, getTransactionsByVehicle, getAllTransactions,
  getFxHistory, addFxRate, addFxAlert,
  savePortfolio, saveTaxReport, updateAgentStatus,
} from "../storage";

/**
 * Record a single cost transaction.
 */
export function recordTransaction(data) {
  const txn = createTransaction(data);
  addTransaction(txn);
  updateAgentStatus({ status: "ONLINE", lastAction: `Recorded ${data.category} for ${data.vehicleId}` });
  return txn;
}

/**
 * Record all costs from a landed cost breakdown (when vehicle enters pipeline).
 */
export function recordLandedCosts(vehicleId, landedCost, fxRate) {
  const txns = generateTransactionsFromLandedCost(vehicleId, landedCost, fxRate);
  addTransactions(txns);
  updateAgentStatus({ status: "ONLINE", lastAction: `Recorded ${txns.length} transactions for ${vehicleId}` });
  return { recorded: txns.length, transactions: txns };
}

/**
 * Record a vehicle sale.
 */
export function recordSale(vehicleId, salePrice, date) {
  const txn = createTransaction({
    vehicleId,
    category: "SALE_PROCEEDS",
    amountEur: salePrice,
    description: `Vehicle sold for €${salePrice.toLocaleString()}`,
    date,
  });
  addTransaction(txn);
  updateAgentStatus({ status: "ONLINE", lastAction: `Recorded sale of ${vehicleId} for €${salePrice.toLocaleString()}` });
  return txn;
}

/**
 * Run a full financial health check.
 */
export async function runFinancialCheck(vehicles) {
  const startTime = Date.now();
  updateAgentStatus({ status: "ANALYZING" });

  const allTxns = getAllTransactions().transactions || [];

  // ─── FX Check ───
  const fxHistory = getFxHistory();
  const fxCheck = await checkFxRate(fxHistory.rates || []);
  addFxRate(fxCheck.current.rate);

  if (fxCheck.alerts.length > 0) {
    for (const alert of fxCheck.alerts) {
      addFxAlert(alert);
    }
  }

  // ─── Per-Vehicle P&Ls ───
  const vehiclePnLs = vehicles.map((v) => {
    const txns = allTxns.filter((t) => t.vehicleId === v.id);
    return calculateVehiclePnL(v, txns);
  });

  // ─── Portfolio P&L ───
  const portfolioPnL = calculatePortfolioPnL(vehiclePnLs);
  savePortfolio(portfolioPnL);

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

  // ─── Cash Flow Projection ───
  const cashFlow = projectCashFlow(vehicles, allTxns, 8);

  // ─── AI Tax Review (if available) ───
  let taxReview = null;
  if (isAIAvailable()) {
    taxReview = await reviewTaxCompliance(portfolioPnL, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }

  const report = {
    fxCheck,
    vehiclePnLs,
    portfolioPnL,
    taxComparisons,
    vatDeclaration,
    cashFlow,
    taxReview,
    duration: Date.now() - startTime,
    aiPowered: isAIAvailable(),
    generatedAt: new Date().toISOString(),
  };

  saveTaxReport({ taxComparisons, vatDeclaration, taxReview, generatedAt: report.generatedAt });

  updateAgentStatus({
    status: "ONLINE",
    lastAction: `Financial check complete — ${vehiclePnLs.length} vehicles analyzed`,
    lastCheckTimestamp: new Date().toISOString(),
    fxRate: fxCheck.current.rate,
    fxStatus: fxCheck.status,
    alertCount: fxCheck.alerts.length,
    portfolioMargin: portfolioPnL.summary.totalMargin,
    capitalDeployed: portfolioPnL.summary.totalCapitalDeployed,
  });

  return report;
}
