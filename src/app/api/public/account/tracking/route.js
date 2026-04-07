import { parseSessionToken, findCustomerById, CUSTOMER_COOKIE } from "@/lib/customer-auth";
import { getPipelineVehicles, getPipelineEvents } from "@/lib/agents/logistics/storage";
import { STAGES } from "@/lib/agents/logistics/pipeline";

export async function GET(request) {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  if (!token) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const session = parseSessionToken(token);
  if (!session) return Response.json({ error: "Session expired" }, { status: 401 });

  const customer = await findCustomerById(session.id);
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 401 });

  // In production: would link vehicles to customer via sale records
  // For now: return vehicles that are in RESERVED or SOLD status (placeholder)
  const pipeline = getPipelineVehicles();
  const vehicles = (pipeline.vehicles || [])
    .filter((v) => v.currentStage === "RESERVED" || v.currentStage === "SOLD" || v.currentStage === "READY_FOR_SALE")
    .map((v) => {
      const events = getPipelineEvents(v.id);
      return {
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        color: v.exteriorColor,
        currentStage: v.currentStage,
        stageEnteredAt: v.stageEnteredAt,
        estimatedReadyDate: v.estimatedReadyDate,
        stages: STAGES,
        stageHistory: (v.stageHistory || []).map((h) => ({
          stage: h.stage,
          enteredAt: h.enteredAt,
        })),
        recentEvents: (events.events || []).slice(0, 10).map((e) => ({
          message: e.message,
          timestamp: e.timestamp,
        })),
      };
    });

  return Response.json({ vehicles, count: vehicles.length });
}
