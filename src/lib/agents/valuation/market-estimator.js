/**
 * Market Estimator — scrapes real listings from mobile.de + autoscout24,
 * then uses Claude to analyze pricing adjustments for the specific vehicle.
 *
 * Enhanced pipeline:
 *   1. Scrape mobile.de + autoscout24 in parallel (with pagination)
 *   2. Merge & deduplicate results
 *   3. Remove statistical outliers (IQR method)
 *   4. Calculate price statistics (median, p25, p75, etc.)
 *   5. Send real comparables to Claude for structured price adjustments
 *   6. Return complete market analysis with real listing URLs
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatNumber } from "@/lib/format";
import { scrapeMobileDe } from "./scrapers/mobile-de";
import { scrapeAutoScout24 } from "./scrapers/autoscout24";
import { buildMobileDeSearchUrl, buildAutoScout24SearchUrl } from "./scrapers/search-urls";
import { removeOutliers, validateMarketOutput } from "./validation";

const ANALYSIS_SYSTEM = `You are a senior German luxury car pricing analyst with 15+ years of experience at premium dealerships. You are given REAL comparable listings scraped from mobile.de and AutoScout24. Your price estimates directly influence €50,000-€400,000 purchase decisions. Be precise and evidence-based — reference specific comparables to justify your adjustments.`;

const ANALYSIS_PROMPT = (input, stats, listings, outlierCount) => `Estimate the fair market value for this target vehicle based on ${listings.length} REAL comparable listings from the German market.${outlierCount > 0 ? ` (${outlierCount} statistical outliers were removed before analysis.)` : ""}

TARGET VEHICLE:
- Make/Model: ${input.make} ${input.model} (${input.year})
- Mileage: ${formatNumber(input.mileageKm)} km
- Exterior: ${input.exteriorColor}
- Interior: ${input.interiorColor || "Not specified"}
- Drive Side: ${input.driveSide}
- Transmission: ${input.transmission || "Unknown"}
- Fuel Type: ${input.fuelType || "Unknown"}
- Service: ${input.serviceHistory || "Unknown"}
- Accident: ${input.accidentHistory ? "YES — documented" : "No"}
- Auction Grade: ${input.auctionGrade || "N/A"}
- Specs/Options: ${input.specificationNotes || "None noted"}

REAL MARKET DATA (${listings.length} listings scraped just now):
- Median: €${formatNumber(stats.median)}
- Mean: €${formatNumber(stats.mean)}
- P25: €${formatNumber(stats.p25)}
- P75: €${formatNumber(stats.p75)}
- Range: €${formatNumber(stats.min)} — €${formatNumber(stats.max)}

TOP COMPARABLES:
${listings.slice(0, 15).map((l, i) => `${i + 1}. ${l.title} — €${formatNumber(l.price)} | ${formatNumber(l.mileage)} km | ${l.year || "?"} | ${l.platform} | ${l.dealer || "Private"}`).join("\n")}

APPLY THESE 7 ADJUSTMENTS (each must be calculated individually):

1. MILEAGE ADJUSTMENT: Compare target mileage vs average comparable mileage.
   Rule: +/- €50-200 per 1,000 km deviation (higher for exotic brands, lower for mainstream luxury).
   Example: If comparables avg 25,000 km and target is 15,000 km → positive adjustment.

2. COLOR PREMIUM/DISCOUNT: Certain colors command premiums in the German market.
   Examples: Ferrari Rosso Corsa = standard (no adjustment). Rare colors (Blu Pozzi, Verde Abetone) = +3-8%.
   AMG: Selenite Grey = standard. Special matte colors = +2-5%.
   Porsche: GT Silver, Chalk = premium. Guards Red = standard.

3. SPECIFICATION PREMIUM: Factory options add measurable value.
   Key premiums: Carbon ceramic brakes (+€3-8K), sport exhaust (+€2-4K), carbon fiber packages (+€3-6K),
   special editions (+5-15%), full PPF (+€2-3K retained value, rare colors.
   Compare visible options to comparables listed.

4. CONDITION ADJUSTMENT: Based on auction grade / photo analysis vs typical comparable condition.
   Grade 5+: premium vehicle, add 3-5%. Grade 4-4.5: standard, no adjustment. Grade 3.5 or below: discount 5-10%.

5. DRIVE SIDE: LHD commands premium in German market for non-German brands.
   Ferrari/Lamborghini/Maserati LHD: +3-5%. RHD: major discount (-10-20%, very limited buyer pool).
   German brands (Porsche, AMG, BMW M): LHD = standard, no adjustment.

6. SERVICE HISTORY: Full dealer service history adds significant value for exotics.
   Full dealer: +5-10%. Partial: no change. Unknown/Independent: -3-7%.

7. ACCIDENT HISTORY: Any documented accident reduces value.
   Minor repair: -10-15%. Significant repair: -15-25%. Unknown severity: -12%.

IMPORTANT: Start from the MEDIAN price and add/subtract each adjustment. The final estimated_sale_price_eur should equal median + sum of all adjustments.

Return ONLY valid JSON:
{
  "estimated_sale_price_eur": <integer — median + all adjustments>,
  "price_adjustments": [
    {"factor": "Mileage adjustment", "adjustment_eur": <integer +/->, "reasoning": "target has X km vs avg Y km of comparables, Z per 1000km"},
    {"factor": "Color premium/discount", "adjustment_eur": <integer +/->, "reasoning": "specific color analysis"},
    {"factor": "Specification premium", "adjustment_eur": <integer +/->, "reasoning": "specific options referenced"},
    {"factor": "Condition adjustment", "adjustment_eur": <integer +/->, "reasoning": "grade-based analysis"},
    {"factor": "Drive side", "adjustment_eur": <integer +/->, "reasoning": "market preference analysis"},
    {"factor": "Service history", "adjustment_eur": <integer +/->, "reasoning": "documentation value"},
    {"factor": "Accident history", "adjustment_eur": <integer +/->, "reasoning": "impact analysis"}
  ],
  "avg_days_on_market": <integer estimate based on liquidity>,
  "market_liquidity": "HIGH" or "MEDIUM" or "LOW",
  "trend_direction": "RISING" or "STABLE" or "DECLINING",
  "engine_spec": "engine description if identifiable from model",
  "original_msrp_eur": <integer estimate when new>,
  "confidence": <number 0.0-1.0 — 0.9+ if 15+ close comparables, 0.7 if 5-15, 0.5 if <5>
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
 * Deduplicate listings by normalized title + price.
 */
function deduplicate(listings) {
  const seen = new Set();
  return listings.filter((l) => {
    const key = `${l.title.toLowerCase().trim().replace(/\s+/g, " ")}|${l.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Estimate German market value using real scraped data + Claude analysis.
 * Enhanced with outlier removal, wider search fallback, and structured adjustments.
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

  const fallbackSearchUrls = {
    mobile_de: buildMobileDeSearchUrl({ make: input.make, model: input.model, yearFrom, yearTo, maxMileage }),
    autoscout24: buildAutoScout24SearchUrl({ make: input.make, model: input.model, yearFrom, yearTo, maxMileage }),
  };

  const primaryMobile = mobileResults.status === "fulfilled" ? mobileResults.value : { listings: [], searchUrl: fallbackSearchUrls.mobile_de };
  const primaryAuto = autoscoutResults.status === "fulfilled" ? autoscoutResults.value : { listings: [], searchUrl: fallbackSearchUrls.autoscout24 };

  let mobileListings = primaryMobile.listings;
  let autoscoutListings = primaryAuto.listings;
  let mobileSearchUrl = primaryMobile.searchUrl || fallbackSearchUrls.mobile_de;
  let autoscoutSearchUrl = primaryAuto.searchUrl || fallbackSearchUrls.autoscout24;

  console.log(`Primary scrape: mobile.de=${mobileListings.length}, autoscout24=${autoscoutListings.length}`);

  // Step 1b: If <5 results, widen search (±4 years, +50% mileage)
  let searchWidened = false;
  if (mobileListings.length + autoscoutListings.length < 5) {
    console.log("Few results, widening search to ±4 years...");
    searchWidened = true;
    const wideYearFrom = input.year - 4;
    const wideYearTo = input.year + 4;
    const wideMileage = Math.round(input.mileageKm * 1.5) + 30000;

    const [wideM, wideA] = await Promise.allSettled([
      scrapeMobileDe({ make: input.make, model: input.model, yearFrom: wideYearFrom, yearTo: wideYearTo, maxMileage: wideMileage }),
      scrapeAutoScout24({ make: input.make, model: input.model, yearFrom: wideYearFrom, yearTo: wideYearTo, maxMileage: wideMileage }),
    ]);

    if (wideM.status === "fulfilled") {
      mobileListings = wideM.value.listings;
      mobileSearchUrl = wideM.value.searchUrl || mobileSearchUrl;
    }
    if (wideA.status === "fulfilled") {
      autoscoutListings = wideA.value.listings;
      autoscoutSearchUrl = wideA.value.searchUrl || autoscoutSearchUrl;
    }
    console.log(`Widened scrape: mobile.de=${mobileListings.length}, autoscout24=${autoscoutListings.length}`);
  }

  const searchUrls = { mobile_de: mobileSearchUrl, autoscout24: autoscoutSearchUrl };

  // Step 2: Merge & deduplicate
  const allListings = deduplicate([...mobileListings, ...autoscoutListings]);
  console.log(`After dedup: ${allListings.length} unique listings`);

  // Step 3: Remove outliers
  const originalCount = allListings.length;
  let filteredListings = allListings;
  if (allListings.length >= 4) {
    const cleanPrices = removeOutliers(allListings.map((l) => l.price));
    const cleanPriceSet = new Set(cleanPrices);
    filteredListings = allListings.filter((l) => cleanPriceSet.has(l.price));
    // If outlier removal was too aggressive (removed >40%), keep originals
    if (filteredListings.length < allListings.length * 0.6) {
      filteredListings = allListings;
    }
  }
  const outliersRemoved = originalCount - filteredListings.length;
  if (outliersRemoved > 0) {
    console.log(`Removed ${outliersRemoved} outlier listings`);
  }

  // Step 4: Calculate statistics
  const stats = calcStats(filteredListings);

  // ── Fallback: Claude AI market estimation when scrapers fail ──
  if ((!stats || filteredListings.length === 0) && isAIAvailable()) {
    console.warn("No scraped listings — falling back to Claude AI market estimation");
    return estimateWithAI(input, searchUrls);
  }

  if (!stats || filteredListings.length === 0) {
    const err = new Error("No comparable listings found and AI estimation unavailable.");
    err.code = "NO_MARKET_DATA";
    throw err;
  }

  // Step 5: Claude analyzes real data for vehicle-specific adjustments
  let aiAnalysis = null;
  if (isAIAvailable()) {
    const rawResult = await callClaude({
      prompt: ANALYSIS_PROMPT(input, stats, filteredListings, outliersRemoved),
      system: ANALYSIS_SYSTEM,
      jsonMode: true,
    });
    aiAnalysis = validateMarketOutput(rawResult);
  }

  // Step 6: Combine scraped data + AI analysis
  const estimatedPrice = aiAnalysis?.estimated_sale_price_eur || stats.median;
  const daysOnMarket = aiAnalysis?.avg_days_on_market || (filteredListings.length <= 5 ? 45 : filteredListings.length <= 15 ? 35 : 21);
  const liquidity = aiAnalysis?.market_liquidity || (filteredListings.length >= 15 ? "HIGH" : filteredListings.length >= 5 ? "MEDIUM" : "LOW");

  // Confidence: minimum of data confidence and AI confidence (not average)
  let dataConfidence = 0.5;
  if (filteredListings.length >= 20) dataConfidence = 0.92;
  else if (filteredListings.length >= 10) dataConfidence = 0.82;
  else if (filteredListings.length >= 5) dataConfidence = 0.70;
  else if (filteredListings.length >= 2) dataConfidence = 0.55;

  // Penalize if search was widened
  if (searchWidened) dataConfidence *= 0.85;

  const confidence = aiAnalysis?.confidence
    ? Math.min(dataConfidence, aiAnalysis.confidence)
    : dataConfidence;

  return {
    estimated_sale_price_eur: estimatedPrice,
    price_statistics: stats,
    comparable_count: filteredListings.length,
    price_adjustments: aiAnalysis?.price_adjustments || [],
    avg_days_on_market: daysOnMarket,
    market_liquidity: aiAnalysis?.market_liquidity || liquidity,
    trend_direction: aiAnalysis?.trend_direction || "STABLE",
    engine_spec: aiAnalysis?.engine_spec || null,
    original_msrp_eur: aiAnalysis?.original_msrp_eur || null,
    confidence,
    outliers_removed: outliersRemoved,
    search_widened: searchWidened,
    comparable_listings: filteredListings.slice(0, 10).map((l) => ({
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
    search_urls: searchUrls,
  };
}

// ══════════════════════════════════════════
// WEB SEARCH FALLBACK — when all scrapers fail
// Strategy: Google search → extract real prices → Claude analysis
// Much better than pure AI estimation (real-time data vs training knowledge)
// ══════════════════════════════════════════

import { runActorAndGetItems } from "./scrapers/apify-client";

/**
 * Search Google for current German market prices, extract price data from
 * search snippets, then send real prices to Claude for structured analysis.
 * Falls back to pure AI estimation if web search also fails.
 */
async function estimateWithAI(input, searchUrls) {
  // ── Step 1: Web search for real prices ──
  const webPrices = await searchWebForPrices(input);

  if (webPrices.length > 0) {
    console.log(`Market estimator: found ${webPrices.length} web prices — using web-grounded estimation`);
    return estimateFromWebPrices(input, webPrices, searchUrls);
  }

  // ── Step 2: Pure AI fallback (no real data at all) ──
  console.log("Market estimator: web search found no prices — using pure AI estimation");
  return estimateFromTrainingData(input, searchUrls);
}

/**
 * Search Google for real market prices using multiple queries.
 * Returns array of { price, title, source, url }.
 */
async function searchWebForPrices(input) {
  const prices = [];

  // Build search queries — try multiple angles
  const modelClean = input.model.replace(/\(.*?\)/g, "").trim();
  const queries = [
    `${input.make} ${modelClean} ${input.year} kaufen mobile.de preis €`,
    `${input.make} ${modelClean} ${input.year} autoscout24 preis`,
    `${input.make} ${modelClean} ${input.year} gebraucht Deutschland preis`,
  ];

  for (const query of queries) {
    try {
      console.log(`Web search: "${query}"`);

      const items = await runActorAndGetItems("apify~google-search-scraper", {
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        languageCode: "de",
        countryCode: "de",
      });

      if (!items || items.length === 0) continue;

      // Parse results — Google shows prices in snippets for car listings
      const results = items[0]?.organicResults || items.flatMap((i) => i.organicResults || [i]);

      for (const r of results) {
        const text = `${r.title || ""} ${r.description || r.snippet || ""}`;
        const url = r.url || r.link || "";

        // Extract Euro prices from text (formats: €89.900, 89.900 €, EUR 89.900, 89900€)
        const pricePatterns = [
          /€\s?([\d.]+)/g,
          /([\d.]+)\s?€/g,
          /EUR\s?([\d.]+)/g,
          /(\d{2,3}\.\d{3})(?!\s*km)/g,
        ];

        for (const pattern of pricePatterns) {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const raw = match[1].replace(/\./g, "");
            const price = parseInt(raw);
            if (price >= 15000 && price <= 1500000) {
              prices.push({
                price,
                title: (r.title || "").substring(0, 120),
                source: url.includes("mobile.de") ? "mobile.de" : url.includes("autoscout24") ? "autoscout24.de" : "web",
                url,
              });
              break; // One price per result
            }
          }
        }
      }

      // If we already have enough prices, stop searching
      if (prices.length >= 8) break;
    } catch (err) {
      console.log(`Web search failed for query: ${err.message}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return prices.filter((p) => {
    const key = p.url || `${p.price}-${p.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Estimate market value from real web search prices + Claude analysis.
 * Higher confidence than pure AI because we have real price data points.
 */
async function estimateFromWebPrices(input, webPrices, searchUrls) {
  // Calculate basic stats from web prices
  const sortedPrices = webPrices.map((p) => p.price).sort((a, b) => a - b);
  const n = sortedPrices.length;
  const median = n % 2 ? sortedPrices[Math.floor(n / 2)] : Math.round((sortedPrices[n / 2 - 1] + sortedPrices[n / 2]) / 2);
  const mean = Math.round(sortedPrices.reduce((a, b) => a + b, 0) / n);
  const p25 = sortedPrices[Math.max(0, Math.floor(n * 0.25))];
  const p75 = sortedPrices[Math.min(n - 1, Math.floor(n * 0.75))];

  // Ask Claude to analyze these real prices for this specific vehicle
  const webAnalysis = await callClaude({
    prompt: `You are a senior German luxury car pricing analyst. I searched the web for current market prices and found REAL listings.

TARGET VEHICLE:
${input.make} ${input.model} (${input.year}) | ${formatNumber(input.mileageKm)} km | ${input.driveSide} | ${input.exteriorColor}
Condition/Grade: ${input.auctionGrade || "Unknown"} | Service: ${input.serviceHistory || "Unknown"} | Accident: ${input.accidentHistory ? "YES" : "No"}
Specs: ${input.specificationNotes || "None"}

REAL WEB PRICES FOUND (${webPrices.length} results):
${webPrices.map((p, i) => `${i + 1}. €${formatNumber(p.price)} — ${p.title} [${p.source}]`).join("\n")}

Price stats: Median €${formatNumber(median)}, Mean €${formatNumber(mean)}, Range €${formatNumber(sortedPrices[0])} — €${formatNumber(sortedPrices[n - 1])}

Based on these REAL prices, estimate the fair sale price for this specific vehicle. Apply adjustments for mileage, color, condition, drive side vs the listings found.

Return ONLY valid JSON:
{
  "estimated_sale_price_eur": <integer>,
  "price_adjustments": [{"factor": "<name>", "adjustment_eur": <+/- integer>, "reasoning": "<brief>"}],
  "avg_days_on_market": <integer>,
  "market_liquidity": "HIGH" or "MEDIUM" or "LOW",
  "trend_direction": "RISING" or "STABLE" or "DECLINING",
  "confidence": <0.55-0.75>
}`,
    system: ANALYSIS_SYSTEM,
    jsonMode: true,
  });

  const aiResult = validateMarketOutput(webAnalysis);
  const estimatedPrice = aiResult?.estimated_sale_price_eur || median;

  // Confidence: web-grounded is much better than pure AI
  let confidence = 0.55;
  if (n >= 8) confidence = 0.72;
  else if (n >= 5) confidence = 0.65;
  else if (n >= 3) confidence = 0.58;

  if (aiResult?.confidence) confidence = Math.max(confidence, Math.min(aiResult.confidence, 0.75));

  return {
    estimated_sale_price_eur: estimatedPrice,
    price_statistics: { count: n, mean, median, p25, p75, min: sortedPrices[0], max: sortedPrices[n - 1] },
    comparable_count: n,
    price_adjustments: aiResult?.price_adjustments || [],
    avg_days_on_market: aiResult?.avg_days_on_market || 35,
    market_liquidity: aiResult?.market_liquidity || (n >= 5 ? "MEDIUM" : "LOW"),
    trend_direction: aiResult?.trend_direction || "STABLE",
    engine_spec: null,
    original_msrp_eur: null,
    confidence,
    outliers_removed: 0,
    search_widened: false,
    comparable_listings: webPrices.slice(0, 10).map((p) => ({
      title: p.title,
      price: p.price,
      mileage: null,
      location: "Germany",
      platform: p.source,
      url: p.url,
      days_on_market: null,
    })),
    data_source: `Web search (${webPrices.length} prices found via Google)`,
    scraped_count: { mobile_de: 0, autoscout24: 0, web_search: n },
    ai_fallback: false,
    web_search_fallback: true,
    search_urls: searchUrls || {
      mobile_de: buildMobileDeSearchUrl({ make: input.make, model: input.model, yearFrom: input.year - 2, yearTo: input.year + 2, maxMileage: input.mileageKm + 30000 }),
      autoscout24: buildAutoScout24SearchUrl({ make: input.make, model: input.model, yearFrom: input.year - 2, yearTo: input.year + 2, maxMileage: input.mileageKm + 30000 }),
    },
  };
}

/**
 * Pure AI estimation — last resort when even web search fails.
 * Uses Claude's training knowledge only. Lowest confidence.
 */
async function estimateFromTrainingData(input, searchUrls) {
  const result = await callClaude({
    prompt: `You are a senior German luxury car pricing expert. No live market data is available — provide your best estimate based on your knowledge of the German luxury car market.

TARGET: ${input.make} ${input.model} (${input.year}) | ${formatNumber(input.mileageKm)} km | ${input.driveSide} | ${input.exteriorColor}
Grade: ${input.auctionGrade || "?"} | Service: ${input.serviceHistory || "?"} | Accident: ${input.accidentHistory ? "YES" : "No"}

Return ONLY valid JSON:
{
  "estimated_sale_price_eur": <integer>,
  "price_range": {"low": <integer>, "mid": <integer>, "high": <integer>},
  "avg_days_on_market": <integer>,
  "market_liquidity": "HIGH" or "MEDIUM" or "LOW",
  "trend_direction": "RISING" or "STABLE" or "DECLINING",
  "reasoning": "2-3 sentences",
  "confidence": <0.3-0.5>
}`,
    system: ANALYSIS_SYSTEM,
    jsonMode: true,
  });

  if (!result || !result.estimated_sale_price_eur) {
    const err = new Error("AI market estimation failed. Cannot determine market value.");
    err.code = "NO_MARKET_DATA";
    throw err;
  }

  const price = result.estimated_sale_price_eur;
  const range = result.price_range || { low: Math.round(price * 0.85), mid: price, high: Math.round(price * 1.15) };
  const confidence = Math.min(result.confidence || 0.35, 0.45);

  return {
    estimated_sale_price_eur: price,
    price_statistics: { count: 0, mean: price, median: price, p25: range.low, p75: range.high, min: range.low, max: range.high },
    comparable_count: 0,
    price_adjustments: [],
    avg_days_on_market: result.avg_days_on_market || 35,
    market_liquidity: result.market_liquidity || "MEDIUM",
    trend_direction: result.trend_direction || "STABLE",
    engine_spec: null,
    original_msrp_eur: null,
    confidence,
    outliers_removed: 0,
    search_widened: false,
    comparable_listings: [],
    data_source: "Claude AI estimation (no live data available)",
    scraped_count: { mobile_de: 0, autoscout24: 0 },
    ai_reasoning: result.reasoning || null,
    ai_fallback: true,
    search_urls: searchUrls || {
      mobile_de: buildMobileDeSearchUrl({ make: input.make, model: input.model, yearFrom: input.year - 2, yearTo: input.year + 2, maxMileage: input.mileageKm + 30000 }),
      autoscout24: buildAutoScout24SearchUrl({ make: input.make, model: input.model, yearFrom: input.year - 2, yearTo: input.year + 2, maxMileage: input.mileageKm + 30000 }),
    },
  };
}
