import { isAIAvailable } from "@/lib/claude";
import { createListing } from "@/lib/agents/listing/ai/listing-orchestrator";

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json({ error: "AI not available.", aiPowered: false }, { status: 503 });
  }

  const vehicle = await request.json();

  if (!vehicle.make || !vehicle.model) {
    return Response.json({ error: "Missing required vehicle data (make, model)" }, { status: 400 });
  }

  try {
    const result = await createListing(vehicle);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Listing creation failed: ${error.message}` }, { status: 500 });
  }
}
