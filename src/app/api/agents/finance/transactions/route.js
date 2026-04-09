import { getAllTransactions, getTransactionsByVehicle } from "@/lib/agents/finance/storage";
import { recordTransaction, recordSale, recordLandedCosts } from "@/lib/agents/finance/ai/finance-orchestrator";
import { agentGuard } from "@/lib/settings";
import { db } from "@/lib/db-storage";

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

  // Record single transaction
  const txn = await recordTransaction(body);

  // Also save to PostgreSQL
  try {
    await db.transactions.create({
      vehicleId: body.vehicleId,
      category: body.category,
      amountEur: body.amountEur,
      amountOriginal: body.amountOriginal || body.amountEur,
      currency: body.currency || "EUR",
      fxRate: body.fxRate || null,
      description: body.description || "",
      documentRef: body.documentRef || null,
    });
  } catch (e) { console.warn("DB save txn failed:", e.message); }

  return Response.json({ success: true, transaction: txn });
}
