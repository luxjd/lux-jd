/**
 * Listing Agent Orchestrator — creates a complete listing for a vehicle.
 *
 * Pipeline:
 * 1. Load vehicle data + matching TVR
 * 2. Generate listing content (descriptions for 5 platforms)
 * 3. Calculate pricing (initial + reduction schedule)
 * 4. Publish to all platforms
 * 5. Persist listing
 */

import { isAIAvailable } from "@/lib/claude";
import { getLatestTVRs } from "@/lib/agents/de-market/storage";
import { generateListingContent } from "./description-generator";
import { calculateListingPrice, checkPriceReduction } from "./pricing-engine";
import { publishToAllPlatforms, updatePriceOnAllPlatforms } from "./platform-publisher";
import { translateVehicleDocs } from "./translator";
import { matchOptionsToMarketValue } from "./option-matcher";
import { saveListing, updateListingPrice, getAllListings, updateAgentStatus, getAgentStatus } from "../storage";

/**
 * Create a full listing for a vehicle.
 * @param {object} vehicle — vehicle data
 * @param {object} options
 * @returns {object} Complete listing with content, pricing, and platform data
 */
export async function createListing(vehicle, { onProgress = null } = {}) {
  if (!isAIAvailable()) {
    return { error: "AI not available — add OPENROUTER_API_KEY.", aiPowered: false };
  }

  const startTime = Date.now();
  await updateAgentStatus({ status: "CREATING_LISTING" });

  // ─── Step 1: Find matching TVR ───
  onProgress?.("tvr", "Loading market data from DE Market Agent...");
  const tvrData = await getLatestTVRs();
  const tvr = tvrData?.reports?.find((t) => {
    const tvrMake = t.vehicleSpec?.make?.toLowerCase();
    const tvrModel = t.vehicleSpec?.model?.toLowerCase();
    const vMake = vehicle.make?.toLowerCase();
    const vModel = vehicle.model?.toLowerCase();
    return (vMake?.includes(tvrMake) || tvrMake?.includes(vMake)) &&
      (vModel?.includes(tvrModel) || tvrModel?.includes(vModel));
  });

  // ─── Step 1b: Translate any Japanese residue (spec §6.3.2 step 2) ───
  onProgress?.("translating", "Translating Japanese auction docs into DE/EN...");
  const translatedVehicle = await translateVehicleDocs(vehicle);

  // ─── Step 1c: Join factory options to TVR market-value premiums (spec §6.3.2 step 2) ───
  const optionMatch = matchOptionsToMarketValue(translatedVehicle, tvr);

  // ─── Step 2: Generate content + pricing in parallel ───
  onProgress?.("generating", "Generating listing descriptions for 5 platforms...");

  const [content, pricing] = await Promise.all([
    generateListingContent({
      ...translatedVehicle,
      listingPrice: tvr?.marketValue?.medianEur || 150000,
      matchedOptions: optionMatch.matchedOptions,
      totalOptionPremiumEur: optionMatch.totalPremiumEur,
    }),
    calculateListingPrice(translatedVehicle, tvr),
  ]);

  if (!content) {
    await updateAgentStatus({ status: "ERROR" });
    return { error: "Content generation failed", aiPowered: true };
  }

  // ─── Step 3: Publish to all platforms ───
  onProgress?.("publishing", "Publishing to mobile.de, AutoScout24, ClassicDriver...");

  const publishResult = await publishToAllPlatforms(translatedVehicle, content, pricing);

  // ─── Step 4: Assemble and persist ───
  const listingId = `lst-${Date.now()}`;
  const listing = {
    id: listingId,
    vehicleId: vehicle.id,
    status: "ACTIVE",
    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      mileageKm: vehicle.mileageKm,
      driveSide: vehicle.driveSide,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      engineSpec: vehicle.engineSpec,
    },
    content,
    pricing,
    matchedOptions: optionMatch.matchedOptions,
    optionPremiumTotalEur: optionMatch.totalPremiumEur,
    translations: translatedVehicle._translations || null,
    currentPrice: pricing.initial_price_eur,
    publishing: publishResult,
    platforms: publishResult.platforms,
    metrics: {
      totalViews: 0,
      totalInquiries: 0,
      totalFavorites: 0,
      viewsByPlatform: {},
    },
    daysOnMarket: 0,
    createdAt: new Date().toISOString(),
    priceHistory: [{ price: pricing.initial_price_eur, reason: "Initial listing", timestamp: new Date().toISOString() }],
    aiPowered: true,
  };

  await saveListing(listing);

  // Update agent status
  const prevStatus = await getAgentStatus();
  await updateAgentStatus({
    status: "ONLINE",
    lastActionTimestamp: new Date().toISOString(),
    lastAction: `Created listing for ${vehicle.make} ${vehicle.model}`,
    listingsCreatedTotal: (prevStatus.listingsCreatedTotal || 0) + 1,
    activeListings: (await getAllListings()).listings?.filter((l) => l.status === "ACTIVE").length || 0,
  });

  onProgress?.("complete", "Listing created successfully!");

  return {
    aiPowered: true,
    listing,
    duration: Date.now() - startTime,
    platformsPublished: publishResult.totalPublished,
    platformsSkipped: publishResult.totalSkipped,
    contentGenerated: {
      mobileDe: !!content.mobile_de,
      autoScout24: !!content.autoscout24,
      classicDriver: !!content.classicdriver,
      elferspot: !!content.elferspot,
      instagram: !!content.instagram,
    },
    pricingStrategy: pricing.pricing_strategy,
    initialPrice: pricing.initial_price_eur,
  };
}

/**
 * Run price reduction check on all active listings.
 * Called periodically to enforce the dynamic pricing schedule.
 */
export async function runPriceReductionCheck() {
  const data = await getAllListings();
  const activeListings = data.listings?.filter((l) => l.status === "ACTIVE") || [];
  const actions = [];

  for (const listing of activeListings) {
    const check = checkPriceReduction(listing);

    if (check.shouldReduce) {
      await updateListingPrice(listing.id, check.newPrice, check.reason);
      updatePriceOnAllPlatforms(listing, check.newPrice);
      actions.push({
        listingId: listing.id,
        vehicle: `${listing.vehicle?.make} ${listing.vehicle?.model}`,
        action: check.action,
        oldPrice: listing.currentPrice,
        newPrice: check.newPrice,
        reason: check.reason,
      });
    } else if (check.action === "REVIEW") {
      actions.push({
        listingId: listing.id,
        vehicle: `${listing.vehicle?.make} ${listing.vehicle?.model}`,
        action: "REVIEW",
        reason: check.reason,
      });
    }
  }

  return { checked: activeListings.length, actions };
}
