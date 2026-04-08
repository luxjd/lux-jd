import { runFinancialCheck } from "@/lib/agents/finance/ai/finance-orchestrator";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";

export async function POST() {
  const vehicles = (await getPipelineVehicles()).vehicles || [];

  try {
    const report = await runFinancialCheck(vehicles);
    return Response.json(report);
  } catch (error) {
    return Response.json({ error: `Financial check failed: ${error.message}` }, { status: 500 });
  }
}
