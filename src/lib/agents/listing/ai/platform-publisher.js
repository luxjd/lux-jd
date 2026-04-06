/**
 * Platform Publisher — publishes listings to multiple platforms.
 *
 * v1: Simulates publishing and generates realistic listing IDs.
 * v2: Will integrate with mobile.de Dealer API, AutoScout24 API, etc.
 */

const PLATFORMS = [
  { id: "mobile_de", name: "mobile.de", type: "PRIMARY", idPrefix: "MDE", formats: ["de"] },
  { id: "autoscout24", name: "AutoScout24", type: "PRIMARY", idPrefix: "AS24", formats: ["de", "en"] },
  { id: "classicdriver", name: "ClassicDriver", type: "SPECIALIST", idPrefix: "CD", formats: ["en"] },
  { id: "elferspot", name: "elferspot", type: "SPECIALIST", idPrefix: "ES", formats: ["de", "en"], brands: ["Porsche"] },
  { id: "instagram", name: "Instagram", type: "SOCIAL", idPrefix: "IG", formats: ["caption"] },
];

/**
 * Publish a listing to all relevant platforms.
 * @param {object} vehicle — vehicle data
 * @param {object} content — generated listing content from description-generator
 * @param {object} pricing — from pricing-engine
 * @returns {object} Publishing results per platform
 */
export function publishToAllPlatforms(vehicle, content, pricing) {
  const results = {};
  const timestamp = new Date().toISOString();

  for (const platform of PLATFORMS) {
    // Skip elferspot for non-Porsche vehicles
    if (platform.brands && !platform.brands.includes(vehicle.make)) {
      results[platform.id] = { status: "SKIPPED", reason: `${platform.name} is ${platform.brands.join("/")} only` };
      continue;
    }

    const platformContent = content[platform.id];
    if (!platformContent) {
      results[platform.id] = { status: "SKIPPED", reason: "No content generated for this platform" };
      continue;
    }

    // Generate realistic listing ID
    const listingId = `${platform.idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    results[platform.id] = {
      status: "PUBLISHED",
      platform: platform.name,
      platformType: platform.type,
      listingId,
      listingUrl: generateListingUrl(platform, listingId, vehicle),
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

  return {
    publishedAt: timestamp,
    platforms: results,
    totalPublished: Object.values(results).filter((r) => r.status === "PUBLISHED").length,
    totalSkipped: Object.values(results).filter((r) => r.status === "SKIPPED").length,
  };
}

function generateListingUrl(platform, listingId, vehicle) {
  const slug = `${vehicle.make}-${vehicle.model}-${vehicle.year}`.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
  switch (platform.id) {
    case "mobile_de": return `https://suchen.mobile.de/fahrzeuge/details/${listingId}/${slug}`;
    case "autoscout24": return `https://www.autoscout24.de/angebote/${slug}-${listingId}`;
    case "classicdriver": return `https://www.classicdriver.com/en/car/${slug}/${listingId}`;
    case "elferspot": return `https://www.elferspot.com/vehicle/${listingId}`;
    case "instagram": return `https://www.instagram.com/p/${listingId}/`;
    default: return `https://luxjd.com/listing/${listingId}`;
  }
}

/**
 * Update price on all published platforms.
 */
export function updatePriceOnAllPlatforms(listing, newPrice) {
  const updates = {};
  const timestamp = new Date().toISOString();

  for (const [platformId, platformData] of Object.entries(listing.platforms || {})) {
    if (platformData.status !== "PUBLISHED") continue;

    updates[platformId] = {
      ...platformData,
      price: newPrice,
      previousPrice: platformData.price,
      priceUpdatedAt: timestamp,
    };
  }

  return { platforms: updates, updatedAt: timestamp, newPrice };
}
