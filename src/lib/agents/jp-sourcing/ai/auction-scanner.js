/**
 * JP Auction Scanner — discovers vehicles on Japanese marketplaces.
 *
 * Scrapes real listings from goo-net.com + carsensor.net,
 * then normalizes them into the opportunity evaluation format.
 *
 * Supports pause/resume via onProgress callback that checks scan state.
 */

import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";
import { scrapeGooNet } from "../scrapers/goo-net";
import { scrapeCarsensor } from "../scrapers/carsensor";
import { scrapeJapanAuktion } from "../scrapers/japan-auktion";

// Docx §6.2.3: "auction grade (minimum 4.0 for luxury — higher threshold than standard vehicles)".
// Listings with an explicit grade below this are filtered at discovery. Listings with
// an unknown (null) grade are still admitted — the downstream risk model will penalize them.
const MIN_AUCTION_GRADE = parseFloat(process.env.MIN_AUCTION_GRADE || "4.0");

const COLOR_MAP = {
  "ブラック": "Black", "ホワイト": "White", "シルバー": "Silver",
  "レッド": "Red", "ブルー": "Blue", "グレー": "Grey",
  "イエロー": "Yellow", "グリーン": "Green", "ゴールド": "Gold",
  "パール": "Pearl White", "ワイン": "Wine Red", "ガンメタ": "Gunmetal",
  "紺": "Dark Blue", "黒": "Black", "白": "White", "赤": "Red", "銀": "Silver",
};

function translateColor(jpColor) {
  if (!jpColor) return null;
  for (const [jp, en] of Object.entries(COLOR_MAP)) {
    if (jpColor.includes(jp)) return en;
  }
  return jpColor;
}

function deduplicate(listings) {
  const seen = new Set();
  return listings.filter((l) => {
    const key = `${l.title.toLowerCase().trim()}|${l.priceJpy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Spec §4.2: EU luxury cars sold in Japan are commonly delivered LHD (Japanese buyers
// prefer LHD for authenticity). BMW/Jaguar/Land Rover Japan-market stock is RHD.
// Use the listing's explicit drive-side when the scraper extracts it; otherwise
// default by brand and flag the assumption for operator review.
const LHD_DEFAULT_BRANDS = [
  "ferrari",
  "porsche",
  "lamborghini",
  "aston martin",
  "bentley",
  "mercedes-amg",
  "mercedes-benz",
  "maserati",
];

function resolveDriveSide(listing, make) {
  const explicit = listing?.driveSide || listing?.drive_side;
  if (explicit === "LHD" || explicit === "RHD") {
    return { side: explicit, assumed: false };
  }
  const m = (make || "").toLowerCase();
  if (LHD_DEFAULT_BRANDS.some((b) => m.includes(b))) {
    return { side: "LHD", assumed: true };
  }
  return { side: "RHD", assumed: true };
}

/**
 * Scan Japanese platforms for vehicles matching DE Market TVRs.
 * @param {Array} tvrs — Target Vehicle Reports
 * @param {object} options
 * @param {function} options.onProgress — callback(modelIndex, total, make, model, vehiclesSoFar)
 * @param {function} options.checkState — returns current scan state string, used for pause/stop
 */
export async function scanAuctions(tvrs, { onProgress, checkState } = {}) {
  if (!tvrs || tvrs.length === 0) {
    return { error: "No Target Vehicle Reports available. Run DE Market Agent scan first." };
  }

  if (!process.env.APIFY_API_KEY) {
    return { error: "APIFY_API_KEY not configured. Cannot scrape Japanese marketplaces." };
  }

  const fxData = await fetchFxRate();
  const allVehicles = [];
  let totalGooNet = 0;
  let totalCarsensor = 0;
  let totalJapanAuktion = 0;
  let filteredByGrade = 0;
  const completedModels = [];

  for (let idx = 0; idx < tvrs.length; idx++) {
    const tvr = tvrs[idx];
    const make = tvr.vehicleSpec?.make;
    const model = tvr.vehicleSpec?.model;
    const yearRange = tvr.vehicleSpec?.yearRange || [2018, 2024];

    if (!make || !model) continue;

    // Check for stop
    if (checkState) {
      const state = checkState();
      if (state === "stopped") break;

      // Wait while paused
      while (checkState() === "paused") {
        await new Promise((r) => setTimeout(r, 500));
        if (checkState() === "stopped") break;
      }
      if (checkState() === "stopped") break;
    }

    onProgress?.(idx, tvrs.length, make, model, allVehicles.length);

    console.log(`JP Sourcing: scanning ${make} ${model} on Japanese platforms...`);

    const [gooResults, carsensorResults, japanAuktionResults] = await Promise.allSettled([
      scrapeGooNet({ make, model, yearFrom: yearRange[0], yearTo: yearRange[1], maxMileage: 50000 }),
      scrapeCarsensor({ make, model, yearFrom: yearRange[0], yearTo: yearRange[1], maxMileage: 50000 }),
      scrapeJapanAuktion({ make, model, yearFrom: yearRange[0], yearTo: yearRange[1], maxMileage: 50000 }),
    ]);

    const gooListings = gooResults.status === "fulfilled" ? gooResults.value : [];
    const carsensorListings = carsensorResults.status === "fulfilled" ? carsensorResults.value : [];
    const japanAuktionListings = japanAuktionResults.status === "fulfilled" ? japanAuktionResults.value : [];

    totalGooNet += gooListings.length;
    totalCarsensor += carsensorListings.length;
    totalJapanAuktion += japanAuktionListings.length;

    const combined = deduplicate([...gooListings, ...carsensorListings, ...japanAuktionListings]);

    console.log(`JP Sourcing [${make} ${model}]: goo-net=${gooListings.length}, carsensor=${carsensorListings.length}, japan-auktion=${japanAuktionListings.length}, deduped=${combined.length}`);

    for (const listing of combined) {
      // Docx §6.2.3 grade filter — drop listings with explicit grade below threshold.
      // Listings without a grade (carsensor / goo-net / RHD brokers often omit it) pass through
      // and get penalized later by scoreRisk.
      if (listing.auctionGrade != null && listing.auctionGrade < MIN_AUCTION_GRADE) {
        filteredByGrade++;
        continue;
      }

      // Use sold price when available (japan-auktion.de provides actual hammer prices)
      const priceJpy = listing.soldPriceJpy || listing.priceJpy;
      const ds = resolveDriveSide(listing, make);

      allVehicles.push({
        id: `opp-${Date.now()}-${allVehicles.length}`,
        tvr_model_id: tvr.modelId || null,
        auction_source: listing.platform,
        lot_number: listing.lotNumber || null,
        make,
        model,
        year: listing.year || yearRange[0],
        mileage_km: listing.mileage || 0,
        drive_side: ds.side,
        drive_side_assumed: ds.assumed,
        auction_grade: listing.auctionGrade || null,
        exterior_color: translateColor(listing.color) || null,
        interior_color: null,
        transmission: listing.transmission || null,
        engine_spec: listing.engineCc ? `${listing.engineCc}cc` : null,
        asking_price_jpy: priceJpy,
        asking_price_eur: Math.round(priceJpy / fxData.rate),
        start_price_jpy: listing.startPriceJpy || null,
        sold_price_jpy: listing.soldPriceJpy || null,
        auction_house: listing.auctionHouse || null,
        auction_status: listing.status || null,
        specification_notes: null,
        service_history: "UNKNOWN",
        accident_history: false,
        condition_notes: null,
        auction_sheet_notes: null,
        photo_summary: null,
        photo_urls: Array.isArray(listing.photos) ? listing.photos.slice(0, 30) : [],
        listing_url: listing.url,
        listing_title: listing.title,
        fx_rate_used: fxData.rate,
        fx_live: fxData.live,
        discovered_at: new Date().toISOString(),
      });
    }

    completedModels.push({ make, model, count: combined.length });

    await new Promise((r) => setTimeout(r, 1500));
  }

  return {
    auctionDate: new Date().toISOString().split("T")[0],
    vehicles: allVehicles,
    scanSummary: {
      total_lots_scanned: totalGooNet + totalCarsensor + totalJapanAuktion,
      matching_vehicles: allVehicles.length,
      auction_houses_checked: 3,
      vehicles_with_grades: allVehicles.filter((v) => v.auction_grade != null).length,
      vehicles_with_sold_prices: allVehicles.filter((v) => v.sold_price_jpy != null).length,
      vehiclesFilteredByGrade: filteredByGrade,
      minAuctionGrade: MIN_AUCTION_GRADE,
      scan_notes: `Scraped ${totalGooNet} from goo-net.com, ${totalCarsensor} from carsensor.net, and ${totalJapanAuktion} from japan-auktion.de (auction aggregator). ${allVehicles.length} vehicles matched${filteredByGrade > 0 ? ` (${filteredByGrade} filtered out: auction grade < ${MIN_AUCTION_GRADE})` : ""}.`,
      sources: { "goo-net.com": totalGooNet, "carsensor.net": totalCarsensor, "japan-auktion.de": totalJapanAuktion },
    },
    completedModels,
    fxRate: fxData.rate,
    fxLive: fxData.live,
    // Full FX object — includes 90-day moving-average deviation used by scoreRisk for currency_risk.
    fxData,
    scannedAt: new Date().toISOString(),
  };
}
