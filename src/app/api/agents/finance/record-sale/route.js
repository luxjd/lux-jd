/**
 * POST /api/agents/finance/record-sale
 *
 * Records a completed vehicle sale in the Finance ledger.
 * Spec §6.4.2 point 1: "Track every cost in real-time from purchase to sale."
 *
 * This is the explicit integration point for the sale closure — when the
 * Concierge's negotiation returns ACCEPT, payment has been received, and the
 * vehicle hands over. Also available via POST /transactions { action:
 * "RECORD_SALE", ... } but this route is the clean name for the lifecycle
 * event so UI wiring and audit logs are unambiguous.
 *
 * Body: { vehicleId, salePrice, date? }
 */

import { recordSale } from "@/lib/agents/finance/ai/finance-orchestrator";
import { getTransactionsByVehicle } from "@/lib/agents/finance/storage";
import { calculateCompleteness } from "@/lib/agents/finance/ledger";
import { calculateVehiclePnL } from "@/lib/agents/finance/ai/pnl-engine";
import { agentGuard } from "@/lib/settings";

export async function POST(request) {
  const blocked = await agentGuard("finance");
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { vehicleId, salePrice, date, vehicle } = body || {};

  if (!vehicleId) {
    return Response.json({ error: "vehicleId is required" }, { status: 400 });
  }
  if (typeof salePrice !== "number" || salePrice <= 0) {
    return Response.json({ error: "salePrice (EUR) is required and must be > 0" }, { status: 400 });
  }

  // Check cost completeness before closing the sale — if the ledger is
  // missing major categories, the realised margin will be wrong.
  const existingTxns = await getTransactionsByVehicle(vehicleId);
  const completeness = calculateCompleteness(existingTxns);

  const txn = await recordSale(vehicleId, salePrice, date);

  // Recompute P&L with the sale transaction included so the caller can
  // surface realised margin immediately.
  let realizedPnL = null;
  if (vehicle) {
    const txnsWithSale = await getTransactionsByVehicle(vehicleId);
    realizedPnL = calculateVehiclePnL(vehicle, txnsWithSale);
  }

  return Response.json({
    success: true,
    transaction: txn,
    preCloseCompleteness: {
      completeness: completeness.completeness,
      missingCategories: completeness.missingCategories,
      warning: completeness.completeness < 98
        ? `Ledger at ${completeness.completeness}% before sale close — realised margin may omit unrecorded costs.`
        : null,
    },
    realizedPnL,
  });
}
