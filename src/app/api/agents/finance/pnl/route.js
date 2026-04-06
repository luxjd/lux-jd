import { getLatestPortfolio } from "@/lib/agents/finance/storage";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { getAllTransactions } from "@/lib/agents/finance/storage";
import { calculateVehiclePnL, calculatePortfolioPnL } from "@/lib/agents/finance/ai/pnl-engine";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");

  const allTxns = getAllTransactions().transactions || [];
  const vehicles = getPipelineVehicles().vehicles || [];

  if (vehicleId) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return Response.json({ error: "Vehicle not found" }, { status: 404 });
    const txns = allTxns.filter((t) => t.vehicleId === vehicleId);
    return Response.json(calculateVehiclePnL(vehicle, txns));
  }

  // Portfolio P&L
  const cached = getLatestPortfolio();
  if (cached) return Response.json(cached);

  // Calculate fresh
  const pnls = vehicles.map((v) => calculateVehiclePnL(v, allTxns.filter((t) => t.vehicleId === v.id)));
  return Response.json(calculatePortfolioPnL(pnls));
}
