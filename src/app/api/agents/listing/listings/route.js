import { getAllListings } from "@/lib/agents/listing/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const data = await getAllListings();
  let listings = data.listings || [];

  if (status && status !== "ALL") {
    listings = listings.filter((l) => l.status === status);
  }

  return Response.json({
    listings,
    count: listings.length,
    updatedAt: data.updatedAt,
  });
}
