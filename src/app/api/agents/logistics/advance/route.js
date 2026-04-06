import { advanceStage, addVehicleToPipeline } from "@/lib/agents/logistics/ai/logistics-orchestrator";

export async function POST(request) {
  const body = await request.json();

  // Add new vehicle to pipeline
  if (body.action === "ADD") {
    const vehicle = addVehicleToPipeline(body.vehicle);
    return Response.json({ success: true, vehicle });
  }

  // Advance stage
  if (!body.vehicleId || !body.targetStage) {
    return Response.json({ error: "Missing vehicleId or targetStage" }, { status: 400 });
  }

  const result = await advanceStage(body.vehicleId, body.targetStage, {
    override: body.override,
    notes: body.notes,
    agent: body.agent || "operator",
    shipping: body.shipping,
  });

  if (result.error) {
    return Response.json(result, { status: 400 });
  }

  return Response.json(result);
}
