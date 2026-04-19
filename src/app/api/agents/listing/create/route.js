import { isAIAvailable } from "@/lib/claude";
import { createListing } from "@/lib/agents/listing/ai/listing-orchestrator";
import { agentGuard } from "@/lib/settings";

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
    // `createListing` already persists via `saveListing` (Prisma upsert in
    // listing/storage.js). The duplicate `db.listings.create` here would
    // collide on PK / race with that write.
    const result = await createListing(vehicle);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Listing creation failed: ${error.message}` }, { status: 500 });
  }
}
