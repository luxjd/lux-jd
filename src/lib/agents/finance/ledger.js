/**
 * Transaction Ledger — records every financial event per vehicle.
 *
 * STRICT RULES:
 * - Every cost MUST have a category from the approved enum
 * - All amounts stored with currency code (JPY or EUR)
 * - FX rate recorded for non-EUR transactions
 * - cost_tracking_completeness must reach 100% before READY_FOR_SALE
 */

import { formatJpy } from "@/lib/format";

export const COST_CATEGORIES = [
  "PURCHASE", "AUCTION_FEE", "TRANSPORT_JP", "EXPORT_DOCS",
  "FREIGHT", "INSURANCE", "CUSTOMS_DUTY", "IMPORT_VAT",
  "PORT_HANDLING", "TUV", "REGISTRATION", "TRANSPORT_DE",
  "DETAILING", "PHOTOGRAPHY", "LISTING_FEE", "STORAGE",
  "MISCELLANEOUS", "SALE_PROCEEDS",
];

// Expected costs for completeness check — which categories are required
const REQUIRED_CATEGORIES = [
  "PURCHASE", "AUCTION_FEE", "TRANSPORT_JP", "EXPORT_DOCS",
  "FREIGHT", "INSURANCE", "CUSTOMS_DUTY", "IMPORT_VAT",
  "PORT_HANDLING", "TUV", "TRANSPORT_DE", "DETAILING", "PHOTOGRAPHY",
];

/**
 * Create a transaction record.
 */
export function createTransaction({
  vehicleId,
  category,
  amountEur,
  amountOriginal = null,
  currency = "EUR",
  fxRate = null,
  description = "",
  documentRef = null,
  date = null,
}) {
  if (!COST_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${COST_CATEGORIES.join(", ")}`);
  }

  return {
    id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    vehicleId,
    category,
    amountEur: Math.round(amountEur * 100) / 100, // 2 decimal precision
    amountOriginal: amountOriginal || amountEur,
    currency,
    fxRate,
    description,
    documentRef,
    transactionDate: date || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Calculate cost tracking completeness for a vehicle.
 * Returns percentage (0-100) and list of missing categories.
 */
export function calculateCompleteness(transactions) {
  const recordedCategories = new Set(transactions.map((t) => t.category));
  const missing = REQUIRED_CATEGORIES.filter((c) => !recordedCategories.has(c));
  const completeness = ((REQUIRED_CATEGORIES.length - missing.length) / REQUIRED_CATEGORIES.length) * 100;

  return {
    completeness: Number(completeness.toFixed(1)),
    isComplete: missing.length === 0,
    missingCategories: missing,
    recordedCategories: [...recordedCategories],
    totalTransactions: transactions.length,
  };
}

/**
 * Generate all standard transactions from a landed cost breakdown.
 * Used when a vehicle enters the pipeline with pre-calculated costs.
 */
export function generateTransactionsFromLandedCost(vehicleId, landedCost, fxRate = null) {
  const txns = [];
  const add = (category, amount, desc, currency = "EUR") => {
    if (amount && amount > 0) {
      txns.push(createTransaction({ vehicleId, category, amountEur: amount, currency, fxRate, description: desc }));
    }
  };

  add("PURCHASE", landedCost.purchasePriceEur, `Purchase at ${formatJpy(landedCost.purchasePriceJpy)}`, "EUR");
  add("AUCTION_FEE", landedCost.auctionFeesEur, "Auction buyer premium (4%)");
  add("TRANSPORT_JP", landedCost.jpTransportEur || 400, "Enclosed Japan inland transport");
  add("EXPORT_DOCS", landedCost.exportDocsEur || 175, "Export documentation (EPC + radiation cert)");
  add("FREIGHT", landedCost.freightEur || 2800, "Container freight");
  add("INSURANCE", landedCost.insuranceEur, "Marine insurance (all-risk, 110% CIF)");
  add("CUSTOMS_DUTY", landedCost.customsDutyEur, "EU customs duty (10% CIF)");
  add("IMPORT_VAT", landedCost.importVatEur, "Import VAT (19%, reclaimable)");
  add("PORT_HANDLING", landedCost.portHandlingEur || 600, "Port handling + customs agent");
  add("TUV", landedCost.tuvEstimatedEur || 400, "TUV Einzelabnahme");
  add("TRANSPORT_DE", landedCost.deTransportEur || 450, "Enclosed DE transport");
  add("DETAILING", landedCost.detailingEur || 1200, "Pre-sale detailing + ceramic coating");
  add("PHOTOGRAPHY", landedCost.photographyEur || 500, "Professional listing photography");

  return txns;
}
