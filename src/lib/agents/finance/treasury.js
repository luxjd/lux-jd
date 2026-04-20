/**
 * Treasury — computes the real "available capital" the business can deploy.
 *
 * Per `luxury_auto_arbitrage_1.docx`:
 *   §7.1 (Orchestrator):  "maximum pipeline capacity based on available capital
 *                          (never commit more than 80% of available capital to
 *                          vehicles in transit)"
 *   §6.4.2 (Finance):     "Cash Flow Management ... Alert when cash reserves
 *                          drop below safety threshold."
 *   §9 table:             "Finance Agent: cash flow projection + capital alerts"
 *
 * The Orchestrator previously read `process.env.AVAILABLE_CAPITAL_EUR` as a
 * hardcoded stand-in because Finance didn't expose a treasury primitive. This
 * module is that primitive. It derives available capital from the real
 * transaction ledger:
 *
 *   available_capital = opening_capital + realized_P&L_on_sold_vehicles
 *
 * A vehicle is "sold" for P&L purposes when it has a SALE_PROCEEDS transaction.
 * In-pipeline vehicles are NOT deducted here — that subtraction happens in the
 * Orchestrator's 80% deployment check (portfolio-manager.js) which already
 * tracks `totalCapitalDeployed` separately. Keeping them separate preserves
 * the docx model where "available capital" is the total pool and the 80%
 * rule is applied against it.
 */

import { getAllTransactions } from "./storage";

// Opening capital is the initial equity pool (cash on day zero before any
// purchases). Configurable so operators can raise it as the business scales
// or inject new capital. Falls back to the legacy `AVAILABLE_CAPITAL_EUR`
// env for backward compatibility.
function getOpeningCapitalEur() {
  const raw = process.env.OPENING_CAPITAL_EUR || process.env.AVAILABLE_CAPITAL_EUR || "2000000";
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000000;
}

/**
 * Compute real available capital from the transaction ledger.
 *
 * Returns a structured breakdown so the Orchestrator's decision brief and
 * portfolio state can show the operator exactly how the number was derived.
 *
 * @returns {Promise<{
 *   openingCapitalEur: number,
 *   realizedPnLEur: number,
 *   soldVehicleCount: number,
 *   availableCapitalEur: number,
 *   source: "computed" | "fallback",
 *   fallbackReason?: string,
 *   computedAt: string
 * }>}
 */
export async function computeAvailableCapital() {
  const openingCapitalEur = getOpeningCapitalEur();

  try {
    const { transactions } = await getAllTransactions();

    // Group transactions by vehicle so we can identify which vehicles have
    // been sold (have a SALE_PROCEEDS entry) and compute per-vehicle realized P&L.
    const byVehicle = {};
    for (const t of transactions || []) {
      if (!t?.vehicleId) continue;
      if (!byVehicle[t.vehicleId]) byVehicle[t.vehicleId] = { revenue: 0, costs: 0 };
      const amount = Number(t.amountEur) || 0;
      if (t.category === "SALE_PROCEEDS") {
        byVehicle[t.vehicleId].revenue += amount;
      } else {
        byVehicle[t.vehicleId].costs += amount;
      }
    }

    // Realized P&L = (revenue − costs) summed ONLY over vehicles that have been
    // sold. Unsold vehicles' costs stay in the "deployed" bucket, which the
    // Orchestrator tracks separately.
    let realizedPnLEur = 0;
    let soldVehicleCount = 0;
    for (const { revenue, costs } of Object.values(byVehicle)) {
      if (revenue > 0) {
        realizedPnLEur += revenue - costs;
        soldVehicleCount++;
      }
    }

    const availableCapitalEur = Math.round(openingCapitalEur + realizedPnLEur);

    return {
      openingCapitalEur,
      realizedPnLEur: Math.round(realizedPnLEur),
      soldVehicleCount,
      availableCapitalEur,
      source: "computed",
      computedAt: new Date().toISOString(),
    };
  } catch (err) {
    // If the DB is unreachable or the transaction query fails, fall back to
    // the opening-capital value. Flagged as "fallback" so the operator knows
    // the 80% deployment check is running against a stale baseline.
    return {
      openingCapitalEur,
      realizedPnLEur: 0,
      soldVehicleCount: 0,
      availableCapitalEur: openingCapitalEur,
      source: "fallback",
      fallbackReason: err?.message || "Transaction query failed",
      computedAt: new Date().toISOString(),
    };
  }
}
