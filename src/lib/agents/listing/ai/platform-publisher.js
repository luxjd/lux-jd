/**
 * Platform Publisher — publishes listings to multiple platforms.
 *
 * mobile.de and AutoScout24 route through real dealer-API adapters that honour
 * LISTING_PUBLISH_MODE (simulation | dry_run | live). ClassicDriver, elferspot
 * and Instagram remain simulated — none of them have public listing APIs that
 * map cleanly to programmatic publishing (ClassicDriver/elferspot are dealer
 * relationships + CMS uploads; Instagram needs the Graph API + business
 * account + image assets).
 */

import * as mobileDeAdapter from "./platform-adapters/mobile-de";
import * as autoScout24Adapter from "./platform-adapters/autoscout24";

const SIMULATED_PLATFORMS = [
  { id: "classicdriver", name: "ClassicDriver", type: "SPECIALIST", idPrefix: "CD", formats: ["en"] },
  { id: "elferspot", name: "elferspot", type: "SPECIALIST", idPrefix: "ES", formats: ["de", "en"], brands: ["Porsche"] },
  { id: "instagram", name: "Instagram", type: "SOCIAL", idPrefix: "IG", formats: ["caption"] },
];

function simulatePlatform(platform, vehicle, content, pricing) {
  if (platform.brands && !platform.brands.includes(vehicle.make)) {
    return { status: "SKIPPED", reason: `${platform.name} is ${platform.brands.join("/")} only` };
  }
  const platformContent = content[platform.id];
  if (!platformContent) {
    return { status: "SKIPPED", reason: "No content generated for this platform" };
  }
  const listingId = `${platform.idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();
  return {
    status: "PUBLISHED",
    mode: "simulation",
    platform: platform.name,
    platformType: platform.type,
    listingId,
    listingUrl: generateSimulatedUrl(platform, listingId, vehicle),
    publishedAt: timestamp,
    price: pricing.initial_price_eur,
    currency: "EUR",
    title: platformContent.title_de || platformContent.title_en || `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
    descriptionLength: (platformContent.description_de?.length || 0) + (platformContent.description_en?.length || 0),
    languages: platform.formats,
    views: 0,
    inquiries: 0,
    favorites: 0,
  };
}

function generateSimulatedUrl(platform, listingId, vehicle) {
  const slug = `${vehicle.make}-${vehicle.model}-${vehicle.year}`.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
  switch (platform.id) {
    case "classicdriver": return `https://www.classicdriver.com/en/car/${slug}/${listingId}`;
    case "elferspot": return `https://www.elferspot.com/vehicle/${listingId}`;
    case "instagram": return `https://www.instagram.com/p/${listingId}/`;
    default: return `https://luxjd.com/listing/${listingId}`;
  }
}

/**
 * Publish a listing to all relevant platforms.
 */
export async function publishToAllPlatforms(vehicle, content, pricing) {
  const results = {};
  const publishedAt = new Date().toISOString();

  // Primary platforms via real adapters.
  const [mobileDeResult, autoScout24Result] = await Promise.all([
    mobileDeAdapter.publish(vehicle, content, pricing).catch((err) => ({
      status: "FAILED", mode: "live", error: err.message, platform: "mobile.de",
    })),
    autoScout24Adapter.publish(vehicle, content, pricing).catch((err) => ({
      status: "FAILED", mode: "live", error: err.message, platform: "AutoScout24",
    })),
  ]);
  results.mobile_de = { publishedAt, platformType: "PRIMARY", languages: ["de"], views: 0, inquiries: 0, favorites: 0, ...mobileDeResult };
  results.autoscout24 = { publishedAt, platformType: "PRIMARY", languages: ["de", "en"], views: 0, inquiries: 0, favorites: 0, ...autoScout24Result };

  // Secondary platforms remain simulated — no public dealer APIs.
  for (const platform of SIMULATED_PLATFORMS) {
    results[platform.id] = simulatePlatform(platform, vehicle, content, pricing);
  }

  return {
    publishedAt,
    platforms: results,
    totalPublished: Object.values(results).filter((r) => r.status === "PUBLISHED" || r.status === "DRY_RUN").length,
    totalSkipped: Object.values(results).filter((r) => r.status === "SKIPPED").length,
    totalFailed: Object.values(results).filter((r) => r.status === "FAILED").length,
    publishMode: process.env.LISTING_PUBLISH_MODE || "simulation",
  };
}

/**
 * Update price on all published platforms — live where the adapter is
 * configured, simulated otherwise.
 */
export async function updatePriceOnAllPlatforms(listing, newPrice) {
  const updates = {};
  const timestamp = new Date().toISOString();

  for (const [platformId, platformData] of Object.entries(listing.platforms || {})) {
    if (platformData.status !== "PUBLISHED" && platformData.status !== "DRY_RUN") continue;

    let adapterResult = { ok: true, mode: "simulation" };
    if (platformId === "mobile_de") {
      adapterResult = await mobileDeAdapter.updatePrice(platformData.listingId, newPrice)
        .catch((err) => ({ ok: false, error: err.message }));
    } else if (platformId === "autoscout24") {
      adapterResult = await autoScout24Adapter.updatePrice(platformData.listingId, newPrice)
        .catch((err) => ({ ok: false, error: err.message }));
    }

    updates[platformId] = {
      ...platformData,
      price: newPrice,
      previousPrice: platformData.price,
      priceUpdatedAt: timestamp,
      priceUpdateResult: adapterResult,
    };
  }

  return { platforms: updates, updatedAt: timestamp, newPrice };
}
