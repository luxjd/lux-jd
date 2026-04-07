/**
 * Market Estimator — scrapes real listings from mobile.de + autoscout24,
 * then uses Claude to analyze pricing adjustments for the specific vehicle.
 *
 * Pipeline:
 *   1. Scrape mobile.de + autoscout24 in parallel
 *   2. Merge & deduplicate results
 *   3. Calculate price statistics (median, p25, p75, etc.)
 *   4. Send real comparables to Claude for vehicle-specific adjustment analysis
 *   5. Return complete market analysis with real listing URLs
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { scrapeMobileDe } from "./scrapers/mobile-de";
import { scrapeAutoScout24 } from "./scrapers/autoscout24";

const ANALYSIS_SYSTEM = `You are a German luxury car pricing analyst. You are given REAL comparable listings scraped from mobile.de and AutoScout24. Analyze the data to estimate the fair market value for a specific target vehicle, considering its exact specs vs the comparables.`;

const ANALYSIS_PROMPT = (input, stats, listings) => `Estimate the fair market value for this target vehicle based on ${listings.length} REAL comparable listings from the German market.

TARGET VEHICLE:
- Make/Model: ${input.make} ${input.model} (${input.year})
- Mileage: ${input.mileageKm} km
- Exterior: ${input.exteriorColor}
- Interior: ${input.interiorColor || "Not specified"}
- Drive Side: ${input.driveSide}
- Service: ${input.serviceHistory || "Unknown"}
- Accident: ${input.accidentHistory ? "Yes" : "No"}
- Grade: ${input.auctionGrade || "N/A"}
- Specs: ${input.specificationNotes || "None noted"}

REAL MARKET DATA (${listings.length} listings scraped just now):
- Median: €${stats.median.toLocaleString()}
- Mean: €${stats.mean.toLocaleString()}
- P25: €${stats.p25.toLocaleString()}
- P75: €${stats.p75.toLocaleString()}
- Min: €${stats.min.toLocaleString()} / Max: €${stats.max.toLocaleString()}

TOP COMPARABLES:
${listings.slice(0, 10).map((l, i) => `${i + 1}. ${l.title} — €${l.price.toLocaleString()} | ${l.mileage.toLocaleString()} km | ${l.platform} | ${l.dealer || "Private"}`).join("\n")}

Based on this REAL market data, estimate the fair sale price for the target vehicle. Apply adjustments for mileage, color, specification, condition, drive side, and service history.

Return ONLY valid JSON:
{
  "estimated_sale_price_eur": <integer — your adjusted estimate>,
  "price_adjustments": [
    {"factor": "Mileage adjustment", "adjustment_eur": <integer>, "reasoning": "explanation based on comparables"},
    {"factor": "Color premium/discount", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Specification premium", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Condition adjustment", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Drive side", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Service history", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Accident history", "adjustment_eur": <integer>, "reasoning": "explanation"}
  ],
  "avg_days_on_market": <integer estimate>,
  "market_liquidity": "HIGH" or "MEDIUM" or "LOW",
  "trend_direction": "RISING" or "STABLE" or "DECLINING",
  "engine_spec": "engine description if known",
  "original_msrp_eur": <integer estimate when new>,
  "confidence": <number 0.0-1.0 — higher if many close comparables exist>
}`;

/**
 * Calculate price statistics from a list of listings.
 */
function calcStats(listings) {
  if (listings.length === 0) return null;
  const prices = listings.map((l) => l.price).sort((a, b) => a - b);
  const n = prices.length;
  return {
    count: n,
    mean: Math.round(prices.reduce((a, b) => a + b, 0) / n),
    median: n % 2 ? prices[Math.floor(n / 2)] : Math.round((prices[n / 2 - 1] + prices[n / 2]) / 2),
    p25: prices[Math.max(0, Math.floor(n / 4))],
    p75: prices[Math.min(n - 1, Math.floor((3 * n) / 4))],
    min: prices[0],
    max: prices[n - 1],
  };
}

/**
 * Deduplicate listings by title + price.
 */
function deduplicate(listings) {
  const seen = new Set();
  return listings.filter((l) => {
    const key = `${l.title.toLowerCase().trim()}|${l.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Estimate German market value using real scraped data + Claude analysis.
 *
 * @param {object} input - Vehicle details
 * @returns {object} Market analysis with real comparables
 */
export async function estimateMarketValue(input) {
  console.log(`Market estimator: scraping ${input.make} ${input.model} (${input.year})...`);

  // Step 1: Scrape both platforms in parallel
  const yearFrom = input.year - 2;
  const yearTo = input.year + 2;
  const maxMileage = input.mileageKm + 30000;

  const [mobileResults, autoscoutResults] = await Promise.allSettled([
    scrapeMobileDe({ make: input.make, model: input.model, yearFrom, yearTo, maxMileage }),
    scrapeAutoScout24({ make: input.make, model: input.model, yearFrom, yearTo, maxMileage }),
  ]);

  const mobileListings = mobileResults.status === "fulfilled" ? mobileResults.value : [];
  const autoscoutListings = autoscoutResults.status === "fulfilled" ? autoscoutResults.value : [];

  console.log(`Scraped: mobile.de=${mobileListings.length}, autoscout24=${autoscoutListings.length}`);

  // Step 2: Merge & deduplicate
  const allListings = deduplicate([...mobileListings, ...autoscoutListings]);
  console.log(`After dedup: ${allListings.length} unique listings`);

  // Step 3: Calculate statistics
  const stats = calcStats(allListings);

  if (!stats || allListings.length === 0) {
    console.warn("No comparable listings found from scrapers");

    // If scraping returned nothing, fall back to Claude-only estimation
    if (!isAIAvailable()) {
      throw new Error("No market data available: scrapers returned 0 results and AI is unavailable.");
    }

    // Ask Claude to estimate without scraped data (degraded but functional)
    console.log("Using Claude-only market estimation (scrapers blocked/failed)...");
    const aiOnlyResult = await callClaude({
      prompt: `You are analyzing the current German luxury car market. Estimate the market value for this vehicle as it would appear on mobile.de and AutoScout24 today.

Vehicle: ${input.year} ${input.make} ${input.model}
Mileage: ${input.mileageKm.toLocaleString()} km
Drive Side: ${input.driveSide}
Color: ${input.exteriorColor}
Interior: ${input.interiorColor || "Not specified"}
Service: ${input.serviceHistory || "Unknown"}
Accident: ${input.accidentHistory ? "Yes" : "No"}
Grade: ${input.auctionGrade || "N/A"}
Specs: ${input.specificationNotes || "None"}

Return ONLY valid JSON:
{
  "estimated_sale_price_eur": <integer — realistic asking price>,
  "price_statistics": {
    "count": <integer — estimated comparable listings in Germany>,
    "median": <integer>, "mean": <integer>,
    "p25": <integer>, "p75": <integer>,
    "min": <integer>, "max": <integer>
  },
  "comparable_count": <integer>,
  "price_adjustments": [
    {"factor": "Mileage adjustment", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Color premium/discount", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Drive side", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Service history", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Accident history", "adjustment_eur": <integer>, "reasoning": "explanation"}
  ],
  "avg_days_on_market": <integer>,
  "market_liquidity": "HIGH" or "MEDIUM" or "LOW",
  "trend_direction": "RISING" or "STABLE" or "DECLINING",
  "engine_spec": "engine description",
  "original_msrp_eur": <integer>,
  "comparable_listings": [
    {"title": "realistic listing title", "price": <integer>, "mileage": <integer>, "location": "German city", "platform": "mobile.de", "url": "https://www.mobile.de", "days_on_market": <integer>}
  ],
  "confidence": <number 0.4-0.7 — lower because this is AI-estimated without live data>
}

Provide 5-8 realistic comparable listings that would plausibly exist on mobile.de today. Be conservative with pricing.`,
      system: ANALYSIS_SYSTEM,
      jsonMode: true,
    });

    if (!aiOnlyResult?.estimated_sale_price_eur) {
      throw new Error("Market estimation failed: scrapers returned 0 results and AI estimation produced no price.");
    }

    return {
      ...aiOnlyResult,
      comparable_listings: aiOnlyResult.comparable_listings || [],
      data_source: "Claude AI estimation (scrapers were blocked — prices are AI-estimated, not live market data)",
      scraped_count: { mobile_de: 0, autoscout24: 0 },
      confidence: Math.min(aiOnlyResult.confidence || 0.5, 0.65), // Cap confidence since no real data
    };
  }

  // Step 4: Claude analyzes real data for vehicle-specific adjustments
  let aiAnalysis = null;
  if (isAIAvailable()) {
    aiAnalysis = await callClaude({
      prompt: ANALYSIS_PROMPT(input, stats, allListings),
      system: ANALYSIS_SYSTEM,
      jsonMode: true,
    });
  }

  // Step 5: Combine scraped data + AI analysis
  const estimatedPrice = aiAnalysis?.estimated_sale_price_eur || stats.median;
  const daysOnMarket = aiAnalysis?.avg_days_on_market || (allListings.length <= 5 ? 21 : allListings.length <= 15 ? 35 : 45);
  const liquidity = allListings.length >= 15 ? "HIGH" : allListings.length >= 5 ? "MEDIUM" : "LOW";

  // Confidence based on real data quality
  let confidence = 0.5;
  if (allListings.length >= 20) confidence = 0.92;
  else if (allListings.length >= 10) confidence = 0.82;
  else if (allListings.length >= 5) confidence = 0.70;
  else if (allListings.length >= 2) confidence = 0.55;

  if (aiAnalysis?.confidence) {
    // Average our data-confidence with AI-confidence
    confidence = (confidence + aiAnalysis.confidence) / 2;
  }

  return {
    estimated_sale_price_eur: estimatedPrice,
    price_statistics: stats,
    comparable_count: allListings.length,
    price_adjustments: aiAnalysis?.price_adjustments || [],
    avg_days_on_market: daysOnMarket,
    market_liquidity: aiAnalysis?.market_liquidity || liquidity,
    trend_direction: aiAnalysis?.trend_direction || "STABLE",
    engine_spec: aiAnalysis?.engine_spec || null,
    original_msrp_eur: aiAnalysis?.original_msrp_eur || null,
    confidence,
    comparable_listings: allListings.slice(0, 10).map((l) => ({
      title: l.title,
      price: l.price,
      mileage: l.mileage,
      location: l.dealer || "Germany",
      platform: l.platform,
      url: l.url,
      days_on_market: null,
    })),
    data_source: `mobile.de (${mobileListings.length}) + autoscout24 (${autoscoutListings.length})`,
    scraped_count: { mobile_de: mobileListings.length, autoscout24: autoscoutListings.length },
  };
}
