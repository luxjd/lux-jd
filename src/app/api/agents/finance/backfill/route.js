import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { recordLandedCosts } from "@/lib/agents/finance/ai/finance-orchestrator";
import { getAllTransactions } from "@/lib/agents/finance/storage";

/**
 * POST — Backfill Finance transactions for all pipeline vehicles that don't have any.
 * One-time utility to sync existing vehicles with the Finance Agent.
 */
export async function POST() {
  const data = getPipelineVehicles();
  const vehicles = data.vehicles || [];
  const existingTxns = getAllTransactions().transactions || [];

  const results = [];

  for (const v of vehicles) {
    // Skip if vehicle already has transactions
    const vehicleTxns = existingTxns.filter((t) => t.vehicleId === v.id);
    if (vehicleTxns.length > 0) {
      results.push({ vehicleId: v.id, make: v.make, model: v.model, status: "ALREADY_HAS_TRANSACTIONS", count: vehicleTxns.length });
      continue;
    }

    const lc = v.landedCost;
    if (!lc || Object.keys(lc).length === 0) {
      results.push({ vehicleId: v.id, make: v.make, model: v.model, status: "NO_LANDED_COST_DATA" });
      continue;
    }

    try {
      const result = recordLandedCosts(v.id, lc, lc.fxRateUsed || 166.80);
      results.push({ vehicleId: v.id, make: v.make, model: v.model, status: "BACKFILLED", transactionsCreated: result.recorded });
    } catch (err) {
      results.push({ vehicleId: v.id, make: v.make, model: v.model, status: "ERROR", error: err.message });
    }
  }

  return Response.json({
    vehiclesProcessed: vehicles.length,
    backfilled: results.filter((r) => r.status === "BACKFILLED").length,
    skipped: results.filter((r) => r.status === "ALREADY_HAS_TRANSACTIONS").length,
    results,
  });
}
