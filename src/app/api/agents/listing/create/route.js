import { isAIAvailable } from "@/lib/claude";
import { createListing } from "@/lib/agents/listing/ai/listing-orchestrator";
import { agentGuard } from "@/lib/settings";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  const blocked = await agentGuard("listing");
  if (blocked) return blocked;

  if (!isAIAvailable()) {
    return Response.json({ error: "AI not available.", aiPowered: false }, { status: 503 });
  }

  const vehicle = await request.json();

  if (!vehicle.make || !vehicle.model) {
    return Response.json({ error: "Missing required vehicle data (make, model)" }, { status: 400 });
  }

  try {
    const result = await createListing(vehicle);

    // Save listing to PostgreSQL
    try {
      if (result.listing) {
        await db.listings.create({
          vehicleId: vehicle.id || result.listing.id,
          status: "ACTIVE",
          currentPrice: result.initialPrice || 0,
          initialPrice: result.initialPrice || 0,
          pricingStrategy: result.pricingStrategy,
          platforms: result.listing.platforms || {},
          content: result.listing.content || {},
        });
      }
    } catch (e) { console.warn("DB save listing failed:", e.message); }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Listing creation failed: ${error.message}` }, { status: 500 });
  }
}
