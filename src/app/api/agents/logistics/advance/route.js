import { advanceStage, addVehicleToPipeline } from "@/lib/agents/logistics/ai/logistics-orchestrator";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  const body = await request.json();

  // Add new vehicle to pipeline
  if (body.action === "ADD") {
    const vehicle = addVehicleToPipeline(body.vehicle);

    // Save to PostgreSQL
    try {
      await db.vehicles.create({
        make: body.vehicle.make, model: body.vehicle.model, year: body.vehicle.year,
        driveSide: body.vehicle.driveSide || "LHD",
        mileageKm: body.vehicle.mileageKm, exteriorColor: body.vehicle.exteriorColor,
        interiorColor: body.vehicle.interiorColor, engineSpec: body.vehicle.engineSpec,
        auctionSource: body.vehicle.auctionSource, auctionGrade: body.vehicle.auctionGrade,
        purchasePriceJpy: body.vehicle.purchasePriceJpy ? BigInt(body.vehicle.purchasePriceJpy) : null,
        status: "SOURCED", stageEnteredAt: new Date(),
      });
      await db.pipelineEvents.create({
        vehicleId: vehicle.id, toStatus: "SOURCED", agent: "logistics",
        message: `${body.vehicle.make} ${body.vehicle.model} added to pipeline`,
      });
    } catch (e) { console.warn("DB save vehicle failed:", e.message); }

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

  // Log pipeline event to PostgreSQL
  try {
    await db.pipelineEvents.create({
      vehicleId: body.vehicleId,
      fromStatus: result.previousStage,
      toStatus: body.targetStage,
      agent: body.agent || "operator",
      message: `${result.previousStage} → ${body.targetStage}`,
      metadata: { sideEffects: result.sideEffects, notes: body.notes },
    });
  } catch (e) { console.warn("DB save event failed:", e.message); }

  return Response.json(result);
}
