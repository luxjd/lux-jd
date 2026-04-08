import { getPipelineOverview } from "@/lib/agents/logistics/ai/logistics-orchestrator";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";

export async function GET() {
  const overview = getPipelineOverview();
  const data = await getPipelineVehicles();

  return Response.json({
    ...overview,
    vehicles: data.vehicles || [],
  });
}
