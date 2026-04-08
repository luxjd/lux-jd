import { runRegulatoryCheck, simulateRegulatoryChange } from "@/lib/agents/finance/ai/regulatory-monitor";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";

/**
 * GET — Run regulatory compliance check.
 */
export async function GET() {
  const result = runRegulatoryCheck();
  return Response.json(result);
}

/**
 * POST — Simulate impact of a regulatory change on portfolio.
 * Body: { field: "customsDutyRate", newValue: 12 }
 */
export async function POST(request) {
  const change = await request.json();

  if (!change.field || change.newValue === undefined) {
    return Response.json({ error: "Missing field or newValue" }, { status: 400 });
  }

  const data = await getPipelineVehicles();
  const vehicles = data.vehicles || [];
  const impact = simulateRegulatoryChange(change, vehicles);

  return Response.json(impact);
}
