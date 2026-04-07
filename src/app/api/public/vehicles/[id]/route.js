/**
 * Public Vehicle Detail API — returns full public data for a single vehicle.
 * NO authentication required.
 */

import { getListingById } from "@/lib/agents/listing/storage";

export async function GET(request, { params }) {
  const { id } = await params;
  const listing = getListingById(id);

  if (!listing || listing.status !== "ACTIVE") {
    return Response.json({ error: "Vehicle not found or not available" }, { status: 404 });
  }

  return Response.json({
    id: listing.id,
    vehicle: listing.vehicle,
    price: listing.currentPrice,
    currency: "EUR",
    content: {
      titleDe: listing.content?.mobile_de?.title_de,
      titleEn: listing.content?.classicdriver?.title_en || listing.content?.autoscout24?.title_en,
      descriptionDe: listing.content?.mobile_de?.description_de,
      descriptionEn: listing.content?.classicdriver?.description_en || listing.content?.autoscout24?.description_en,
      highlightsDe: listing.content?.mobile_de?.highlights_de || [],
      highlightsEn: listing.content?.classicdriver?.highlights_en || listing.content?.autoscout24?.highlights || [],
    },
    specSheet: listing.content?.specification_sheet || null,
    platforms: Object.entries(listing.platforms || {})
      .filter(([, p]) => p.status === "PUBLISHED")
      .map(([, p]) => ({ platform: p.platform, url: p.listingUrl })),
    pricing: {
      current: listing.currentPrice,
      strategy: listing.pricing?.pricing_strategy,
    },
    daysOnMarket: listing.daysOnMarket || 0,
  });
}
