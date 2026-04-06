/**
 * Listing Agent Storage — persists listings, price history.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "listing");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filename) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function writeJson(filename, data) {
  ensureDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Listings ───

export function getAllListings() {
  return readJson("listings.json") || { listings: [] };
}

export function saveListing(listing) {
  const data = getAllListings();
  const existing = data.listings.findIndex((l) => l.id === listing.id);
  if (existing >= 0) {
    data.listings[existing] = listing;
  } else {
    data.listings.push(listing);
  }
  data.updatedAt = new Date().toISOString();
  writeJson("listings.json", data);
  return listing;
}

export function getListingById(id) {
  const data = getAllListings();
  return data.listings?.find((l) => l.id === id) || null;
}

export function updateListingPrice(id, newPrice, reason) {
  const data = getAllListings();
  const listing = data.listings?.find((l) => l.id === id);
  if (!listing) return null;

  // Track price history
  if (!listing.priceHistory) listing.priceHistory = [];
  listing.priceHistory.push({
    price: listing.currentPrice || listing.pricing?.initial_price_eur,
    changedTo: newPrice,
    reason,
    timestamp: new Date().toISOString(),
  });

  listing.currentPrice = newPrice;
  listing.priceUpdatedAt = new Date().toISOString();
  data.updatedAt = new Date().toISOString();
  writeJson("listings.json", data);
  return listing;
}

export function updateListingStatus(id, status) {
  const data = getAllListings();
  const listing = data.listings?.find((l) => l.id === id);
  if (!listing) return null;
  listing.status = status;
  listing.statusUpdatedAt = new Date().toISOString();
  data.updatedAt = new Date().toISOString();
  writeJson("listings.json", data);
  return listing;
}

// ─── Agent Status ───

export function getAgentStatus() {
  return readJson("agent-status.json") || {
    status: "IDLE",
    lastActionTimestamp: null,
    listingsCreatedTotal: 0,
    activeListings: 0,
  };
}

export function updateAgentStatus(updates) {
  const current = getAgentStatus();
  writeJson("agent-status.json", { ...current, ...updates, updatedAt: new Date().toISOString() });
}
