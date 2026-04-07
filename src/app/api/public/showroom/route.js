/**
 * Public Showroom API — returns active vehicle listings for customer browsing.
 * NO authentication required.
 *
 * Filters: make, priceMin, priceMax, year, driveSide
 * Strips internal data (costs, margins, agent notes) — only public-safe data.
 */

import { getAllListings } from "@/lib/agents/listing/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const make = searchParams.get("make");
  const priceMin = parseInt(searchParams.get("priceMin") || "0");
  const priceMax = parseInt(searchParams.get("priceMax") || "999999999");
  const yearMin = parseInt(searchParams.get("yearMin") || "1990");
  const driveSide = searchParams.get("driveSide");

  const data = getAllListings();
  let listings = (data.listings || []).filter((l) => l.status === "ACTIVE");

  // Apply filters
  if (make) listings = listings.filter((l) => l.vehicle?.make?.toLowerCase().includes(make.toLowerCase()));
  if (priceMin > 0) listings = listings.filter((l) => (l.currentPrice || 0) >= priceMin);
  if (priceMax < 999999999) listings = listings.filter((l) => (l.currentPrice || 0) <= priceMax);
  if (yearMin > 1990) listings = listings.filter((l) => (l.vehicle?.year || 0) >= yearMin);
  if (driveSide) listings = listings.filter((l) => l.vehicle?.driveSide === driveSide);

  // Strip internal/sensitive data — return only public-safe info
  const publicListings = listings.map((l) => ({
    id: l.id,
    vehicle: {
      make: l.vehicle?.make,
      model: l.vehicle?.model,
      year: l.vehicle?.year,
      mileageKm: l.vehicle?.mileageKm,
      driveSide: l.vehicle?.driveSide,
      exteriorColor: l.vehicle?.exteriorColor,
      interiorColor: l.vehicle?.interiorColor,
      engineSpec: l.vehicle?.engineSpec,
    },
    price: l.currentPrice,
    currency: "EUR",
    title: l.content?.mobile_de?.title_de || l.content?.classicdriver?.title_en || `${l.vehicle?.make} ${l.vehicle?.model} ${l.vehicle?.year}`,
    highlights: l.content?.mobile_de?.highlights_de || l.content?.autoscout24?.highlights || [],
    specSheet: l.content?.specification_sheet || null,
    platforms: Object.entries(l.platforms || {})
      .filter(([, p]) => p.status === "PUBLISHED")
      .map(([, p]) => ({ platform: p.platform, url: p.listingUrl })),
    daysOnMarket: l.daysOnMarket || 0,
    createdAt: l.createdAt,
  }));

  return Response.json({
    vehicles: publicListings,
    count: publicListings.length,
    filters: { make, priceMin, priceMax, yearMin, driveSide },
  });
}
