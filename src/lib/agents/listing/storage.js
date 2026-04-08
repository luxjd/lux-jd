/**
 * Listing Agent Storage — listings, price history.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Listings ───

export async function getAllListings() {
  const db = await getDb();
  if (!db) return { listings: [] };
  const listings = await db.listing.findMany({ orderBy: { updatedAt: "desc" }, include: { vehicle: true } });
  return {
    listings: listings.map(mapListingToJson),
    updatedAt: listings[0]?.updatedAt?.toISOString() || null,
  };
}

export async function saveListing(listing) {
  const db = await getDb();
  if (!db) return listing;
  const data = mapJsonToListingData(listing);
  const saved = await db.listing.upsert({
    where: { id: listing.id },
    update: data,
    create: { id: listing.id, ...data },
    include: { vehicle: true },
  });
  return mapListingToJson(saved);
}

export async function getListingById(id) {
  const db = await getDb();
  if (!db) return null;
  const listing = await db.listing.findUnique({ where: { id }, include: { vehicle: true } });
  return listing ? mapListingToJson(listing) : null;
}

export async function updateListingPrice(id, newPrice, reason) {
  const db = await getDb();
  if (!db) return null;
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return null;

  const history = Array.isArray(listing.priceHistory) ? listing.priceHistory : [];
  history.push({
    price: Number(listing.currentPrice),
    changedTo: newPrice,
    reason,
    timestamp: new Date().toISOString(),
  });

  const updated = await db.listing.update({
    where: { id },
    data: { currentPrice: newPrice, priceHistory: history },
    include: { vehicle: true },
  });
  return mapListingToJson(updated);
}

export async function updateListingStatus(id, status) {
  const db = await getDb();
  if (!db) return null;
  try {
    const updated = await db.listing.update({
      where: { id },
      data: { status },
      include: { vehicle: true },
    });
    return mapListingToJson(updated);
  } catch { return null; }
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE", lastActionTimestamp: null, listingsCreatedTotal: 0, activeListings: 0 };
  const s = await db.agentStatus.findUnique({ where: { id: "listing" } });
  if (!s) return { status: "IDLE", lastActionTimestamp: null, listingsCreatedTotal: 0, activeListings: 0 };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(updates) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...updates };
  await db.agentStatus.upsert({
    where: { id: "listing" },
    update: { name: "Listing", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "listing", name: "Listing", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}

// ─── Helpers ───

function mapListingToJson(l) {
  return {
    id: l.id,
    vehicleId: l.vehicleId,
    vehicle: l.vehicle ? { make: l.vehicle.make, model: l.vehicle.model, year: l.vehicle.year, exteriorColor: l.vehicle.exteriorColor, photos: l.vehicle.photos } : null,
    status: l.status,
    currentPrice: Number(l.currentPrice),
    price: Number(l.currentPrice),
    initialPrice: Number(l.initialPrice),
    pricingStrategy: l.pricingStrategy,
    platforms: l.platforms,
    content: l.content,
    priceHistory: l.priceHistory,
    daysOnMarket: l.daysOnMarket,
    totalViews: l.totalViews,
    totalInquiries: l.totalInquiries,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    // Compat fields for callers that expect nested pricing
    pricing: { initial_price_eur: Number(l.initialPrice), current_price_eur: Number(l.currentPrice) },
  };
}

function mapJsonToListingData(listing) {
  const data = {};
  if (listing.vehicleId !== undefined) data.vehicleId = listing.vehicleId;
  if (listing.status !== undefined) data.status = listing.status;
  if (listing.currentPrice !== undefined) data.currentPrice = listing.currentPrice;
  else if (listing.price !== undefined) data.currentPrice = listing.price;
  else if (listing.pricing?.initial_price_eur !== undefined) data.currentPrice = listing.pricing.initial_price_eur;
  if (listing.initialPrice !== undefined) data.initialPrice = listing.initialPrice;
  else if (listing.pricing?.initial_price_eur !== undefined) data.initialPrice = listing.pricing.initial_price_eur;
  if (!data.currentPrice && !data.initialPrice) { data.currentPrice = 0; data.initialPrice = 0; }
  if (data.currentPrice && !data.initialPrice) data.initialPrice = data.currentPrice;
  if (data.initialPrice && !data.currentPrice) data.currentPrice = data.initialPrice;
  if (listing.pricingStrategy !== undefined) data.pricingStrategy = listing.pricingStrategy;
  if (listing.platforms !== undefined) data.platforms = listing.platforms;
  if (listing.content !== undefined) data.content = listing.content;
  if (listing.priceHistory !== undefined) data.priceHistory = listing.priceHistory;
  if (listing.daysOnMarket !== undefined) data.daysOnMarket = listing.daysOnMarket;
  if (listing.totalViews !== undefined) data.totalViews = listing.totalViews;
  if (listing.totalInquiries !== undefined) data.totalInquiries = listing.totalInquiries;
  return data;
}
