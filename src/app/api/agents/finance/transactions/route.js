import { getAllTransactions, getTransactionsByVehicle } from "@/lib/agents/finance/storage";
import { recordTransaction, recordSale, recordLandedCosts } from "@/lib/agents/finance/ai/finance-orchestrator";
import { agentGuard } from "@/lib/settings";

export async function GET(request) {
  const blocked = await agentGuard("finance");
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");

  if (vehicleId) {
    const txns = await getTransactionsByVehicle(vehicleId);
    return Response.json({ transactions: txns, count: txns.length });
  }

  const all = await getAllTransactions();
  return Response.json({ transactions: all.transactions?.slice(-100) || [], count: all.transactions?.length || 0 });
}

export async function POST(request) {
  const blocked = await agentGuard("finance");
  if (blocked) return blocked;

  const body = await request.json();

  // Record landed costs bulk
  if (body.action === "RECORD_LANDED_COSTS") {
    const result = await recordLandedCosts(body.vehicleId, body.landedCost, body.fxRate);
    return Response.json(result);
  }

  // Record sale
  if (body.action === "RECORD_SALE") {
    const txn = await recordSale(body.vehicleId, body.salePrice, body.date);
    return Response.json({ success: true, transaction: txn });
  }

  // Record single transaction. `recordTransaction` already persists via the
  // finance storage helpers (Prisma); the route used to wrap a second
  // `db.transactions.create(...)` on top, producing a duplicate row.
  const txn = await recordTransaction(body);
  return Response.json({ success: true, transaction: txn });
}
