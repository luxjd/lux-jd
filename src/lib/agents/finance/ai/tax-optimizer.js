/**
 * Tax Optimizer — models Differenzbesteuerung vs Regelbesteuerung per vehicle.
 *
 * German tax law for used vehicle dealers:
 * - Regelbesteuerung: full VAT on sale, but import VAT is deductible
 * - Differenzbesteuerung (§25a UStG): VAT only on margin, but no VAT deduction on purchase
 *
 * For imports: Regelbesteuerung is almost always better because
 * import VAT is significant and reclaimable.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatEur, formatNumber } from "@/lib/format";

const VAT_RATE = 0.19;

/**
 * Model both tax treatments for a vehicle.
 */
export function compareTaxTreatments(vehicle, salePrice, landedCostExclVat, importVat) {
  // ─── Regelbesteuerung (Standard) ───
  const regelSaleVat = Math.round((salePrice / (1 + VAT_RATE)) * VAT_RATE);
  const regelVatReclaimed = importVat;
  const regelNetVat = regelSaleVat - regelVatReclaimed;
  const regelEffectiveMargin = salePrice - regelSaleVat - landedCostExclVat;

  // ─── Differenzbesteuerung (Margin Scheme) ───
  const purchasePrice = vehicle.purchasePriceEur || vehicle.landedCost?.purchasePriceEur || landedCostExclVat;
  const diffMargin = salePrice - purchasePrice;
  const diffVat = diffMargin > 0 ? Math.round((diffMargin / (1 + VAT_RATE)) * VAT_RATE) : 0;
  const diffVatReclaimed = 0; // No VAT reclaim under margin scheme
  const diffNetVat = diffVat;
  const diffTotalCost = landedCostExclVat + importVat; // VAT NOT reclaimable
  const diffEffectiveMargin = salePrice - diffVat - diffTotalCost;

  // ─── Recommendation ───
  const regelBetter = regelEffectiveMargin > diffEffectiveMargin;
  const advantage = Math.abs(regelEffectiveMargin - diffEffectiveMargin);

  return {
    vehicleId: vehicle.id,
    salePrice,

    regelbesteuerung: {
      name: "Regelbesteuerung (Standard)",
      saleVat: regelSaleVat,
      vatReclaimed: regelVatReclaimed,
      netVatLiability: regelNetVat,
      effectiveMargin: regelEffectiveMargin,
      marginPct: salePrice > 0 ? Number(((regelEffectiveMargin / salePrice) * 100).toFixed(1)) : 0,
      explanation: `Full VAT (${formatEur(regelSaleVat)}) on sale, but import VAT (${formatEur(regelVatReclaimed)}) reclaimed. Net VAT: ${formatEur(regelNetVat)}.`,
    },

    differenzbesteuerung: {
      name: "Differenzbesteuerung (§25a UStG)",
      marginForVat: diffMargin > 0 ? diffMargin : 0,
      saleVat: diffVat,
      vatReclaimed: 0,
      netVatLiability: diffNetVat,
      effectiveMargin: diffEffectiveMargin,
      marginPct: salePrice > 0 ? Number(((diffEffectiveMargin / salePrice) * 100).toFixed(1)) : 0,
      explanation: `VAT only on margin (${formatEur(diffVat)}), but import VAT (${formatEur(importVat)}) NOT reclaimable. Significantly worse for imports.`,
    },

    recommendation: {
      recommended: regelBetter ? "REGELBESTEUERUNG" : "DIFFERENZBESTEUERUNG",
      advantage: advantage,
      reasoning: regelBetter
        ? `Regelbesteuerung yields ${formatEur(advantage)} higher net margin because the import VAT of ${formatEur(importVat)} is reclaimable — critical for imports.`
        : `Differenzbesteuerung yields ${formatEur(advantage)} higher net margin. This is unusual for imports — review the calculation.`,
    },

    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Generate monthly VAT declaration data (Umsatzsteuer-Voranmeldung).
 */
export function generateVatDeclaration(transactions, month, year) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthTxns = transactions.filter((t) => t.transactionDate?.startsWith(monthStr));

  const salesVat = monthTxns
    .filter((t) => t.category === "SALE_PROCEEDS")
    .reduce((s, t) => s + Math.round((t.amountEur / 1.19) * 0.19), 0);

  const inputVat = monthTxns
    .filter((t) => t.category === "IMPORT_VAT")
    .reduce((s, t) => s + t.amountEur, 0);

  const netVat = salesVat - inputVat;

  // Umsatzsteuer-Voranmeldung is due by the 10th of the month following the
  // reporting period. `month` is 1-12 here; passing it as the 0-indexed
  // `Date` month effectively means "next month", which correctly rolls
  // December over to January of the following year.
  const dueDateObj = new Date(Date.UTC(year, month, 10));
  const dueDate = dueDateObj.toISOString().split("T")[0];

  return {
    period: monthStr,
    declaration: "Umsatzsteuer-Voranmeldung",
    salesVat,
    inputVat,
    netVatLiability: netVat,
    isRefund: netVat < 0,
    refundAmount: netVat < 0 ? Math.abs(netVat) : 0,
    dueDate,
    transactionCount: monthTxns.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * AI-powered tax compliance review.
 */
export async function reviewTaxCompliance(portfolioPnL, currentMonth) {
  if (!isAIAvailable()) return null;

  const result = await callClaude({
    prompt: `Review tax compliance for a German luxury vehicle import business (§38 GewO dealer).

Portfolio status:
- Vehicles in pipeline: ${portfolioPnL.summary?.inPipeline || 0}
- Vehicles sold: ${portfolioPnL.summary?.sold || 0}
- Total revenue: €${portfolioPnL.summary?.totalRevenue != null ? formatNumber(portfolioPnL.summary.totalRevenue) : 0}
- Total costs: €${portfolioPnL.summary?.totalCosts != null ? formatNumber(portfolioPnL.summary.totalCosts) : 0}
- Total VAT reclaimable: €${portfolioPnL.summary?.totalVatReclaimable != null ? formatNumber(portfolioPnL.summary.totalVatReclaimable) : 0}
- Current month: ${currentMonth}

Return ONLY valid JSON:
{
  "compliance_status": "COMPLIANT" or "REVIEW_NEEDED" or "ACTION_REQUIRED",
  "issues": ["issue 1"] or [],
  "recommendations": ["rec 1", "rec 2"],
  "upcoming_deadlines": [{"deadline": "description", "date": "YYYY-MM-DD"}],
  "tax_savings_opportunities": ["opportunity 1"],
  "risk_areas": ["area 1"] or []
}`,
    system: "You are a German tax advisor (Steuerberater) specializing in vehicle trading businesses, import VAT, and Differenzbesteuerung/Regelbesteuerung optimization.",
    jsonMode: true,
  });

  return result;
}
