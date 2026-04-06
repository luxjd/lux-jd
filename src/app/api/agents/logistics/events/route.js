import { getPipelineEvents } from "@/lib/agents/logistics/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");

  const data = getPipelineEvents(vehicleId);
  return Response.json({ events: data.events?.slice(-50).reverse() || [], count: data.events?.length || 0 });
}
