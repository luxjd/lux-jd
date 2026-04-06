import { runPriceReductionCheck } from "@/lib/agents/listing/ai/listing-orchestrator";
import { updateListingPrice } from "@/lib/agents/listing/storage";

export async function POST(request) {
  const body = await request.json();

  // Manual price update for a specific listing
  if (body.listingId && body.newPrice) {
    const result = updateListingPrice(body.listingId, body.newPrice, body.reason || "Manual price update");
    if (!result) return Response.json({ error: "Listing not found" }, { status: 404 });
    return Response.json({ success: true, listing: result });
  }

  // Run automatic price reduction check on all listings
  const result = runPriceReductionCheck();
  return Response.json(result);
}
