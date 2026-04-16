/**
 * DE Market Scanner — scrapes real listings from mobile.de + autoscout24,
 * then uses Claude to analyze the data for pricing intelligence.
 *
 * v2: Real scraping via Apify + Claude analysis of actual data.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { getSettings } from "@/lib/settings";
import { scrapeMobileDe } from "@/lib/agents/valuation/scrapers/mobile-de";
import { scrapeAutoScout24 } from "@/lib/agents/valuation/scrapers/autoscout24";
import { scrapeElferspot } from "../scrapers/elferspot";
import { scrapeClassicDriver } from "../scrapers/classicdriver";
import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";
import { recordListingSnapshot, computeDemandVelocity } from "../demand-tracker";

const ANALYSIS_SYSTEM = `You are a senior German luxury car market analyst. You are given REAL scraped listing data from mobile.de and AutoScout24. Analyze the data to produce accurate market intelligence. Only base your analysis on the actual data provided — do not invent listings or prices.`;

const ANALYSIS_PROMPT = (model, stats, listings) => `Analyze this REAL market data for ${model.make} ${model.model} (${model.yearRange[0]}-${model.yearRange[1]}) in the German market.

SCRAPED DATA (${listings.length} real listings found just now):
- Median: €${finalStats.median.toLocaleString()}
- Mean: €${finalStats.mean.toLocaleString()}
- P25: €${finalStats.p25.toLocaleString()}
- P75: €${finalStats.p75.toLocaleString()}
- Min: €${finalStats.min.toLocaleString()} / Max: €${finalStats.max.toLocaleString()}

ALL LISTINGS:
${listings.slice(0, 20).map((l, i) => `${i + 1}. ${l.title} — €${l.price.toLocaleString()} | ${l.mileage.toLocaleString()} km | ${l.year} | ${l.platform}`).join("\n")}

Based on this REAL data, provide market intelligence. Return ONLY valid JSON:
{
  "trend": {
    "direction": "APPRECIATING" or "STABLE" or "DEPRECIATING",
    "change_7d_pct": <float — estimate based on newest listing age patterns>,
    "change_30d_pct": <float — estimate based on listing age patterns>,
    "change_90d_pct": <float>,
    "seasonal_factor": "POSITIVE" or "NEUTRAL" or "NEGATIVE",
    "seasonal_notes": "<brief explanation>"
  },
  "demand": {
    "velocity_score": <integer 0-100 — based on listing count and price clustering>,
    "avg_days_on_market": <integer — estimate from listing freshness>,
    "inquiry_rate": "EXTREME" or "HIGH" or "MODERATE" or "LOW" or "VERY_LOW",
    "price_resilience": "STRONG" or "MODERATE" or "WEAK",
    "sales_last_30d": <integer — estimate>,
    "new_listings_last_7d": <integer — estimate>
  },
  "spec_premiums": {
    "colors": {
      "<color>": <float multiplier e.g. 1.05>,
      "<color>": <float>
    },
    "options": {
      "<option>": {"modifier": <float>, "premium_eur": <integer>}
    },
    "avoid_specs": ["<spec1>", "<spec2>"]
  },
  "market_notes": "<2-3 sentence summary based on the actual data>",
  "confidence": <float 0.0-1.0>
}`;

/**
 * Calculate price statistics from listings.
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
 * Scan a single model using real scraped data + Claude analysis.
 */
export async function scanModel(model) {
  console.log(`DE Market: scanning ${model.make} ${model.model}...`);

  const yearFrom = model.yearRange[0];
  const yearTo = model.yearRange[1];
  const maxMileage = 50000;

  // Scrape ALL platforms in parallel (primary + specialist)
  const isPorsche = /porsche/i.test(model.make);
  const isExotic = /ferrari|lamborghini|aston martin|bentley|rolls|mclaren|maserati|bugatti/i.test(model.make);

  const scrapePromises = [
    scrapeMobileDe({ make: model.make, model: model.model, yearFrom, yearTo, maxMileage }),
    scrapeAutoScout24({ make: model.make, model: model.model, yearFrom, yearTo, maxMileage }),
  ];

  // Add specialist platforms where relevant (per spec Section 6.1.2)
  if (isPorsche) {
    scrapePromises.push(scrapeElferspot({ model: model.model, yearFrom, yearTo, maxMileage }));
  }
  if (isExotic || isPorsche) {
    scrapePromises.push(scrapeClassicDriver({ make: model.make, model: model.model, yearFrom, yearTo, maxMileage }));
  }

  const results = await Promise.allSettled(scrapePromises);

  const mobileListings = results[0].status === "fulfilled" ? results[0].value : [];
  const autoscoutListings = results[1].status === "fulfilled" ? results[1].value : [];
  const specialistListings = results.slice(2)
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  console.log(`DE Market [${model.id}]: mobile.de=${mobileListings.length}, autoscout24=${autoscoutListings.length}, specialist=${specialistListings.length}`);

  const allListings = deduplicate([...mobileListings, ...autoscoutListings, ...specialistListings]);
  const stats = calcStats(allListings);

  // ── Fallback: Google web search when all scrapers fail ──
  if (!stats || allListings.length === 0) {
    console.warn(`DE Market [${model.id}]: no listings from scrapers — trying web search`);

    const webListings = await searchWebForListings(model);
    if (webListings.length > 0) {
      allListings.push(...webListings);
      Object.assign(stats || {}, calcStats(allListings));
      console.log(`DE Market [${model.id}]: ${webListings.length} listings from web search`);
    }
  }

  if (!calcStats(allListings) || allListings.length === 0) {
    console.warn(`DE Market [${model.id}]: no listings found anywhere`);
    return {
      modelId: model.id,
      make: model.make,
      model: model.model,
      yearRange: model.yearRange,
      segment: model.segment,
      error: "No listings found on any platform or web search",
      scannedAt: new Date().toISOString(),
    };
  }

  // Recalculate stats if web search added listings
  const finalStats = calcStats(allListings);

  // Build pricing from real data
  const pricing = {
    median_eur: finalStats.median,
    mean_eur: finalStats.mean,
    p25_eur: finalStats.p25,
    p75_eur: finalStats.p75,
    min_eur: finalStats.min,
    max_eur: finalStats.max,
    sample_size: allListings.length,
  };

  // Use Claude to analyze the real data for trends/demand/premiums
  let aiAnalysis = null;
  if (isAIAvailable()) {
    try {
      aiAnalysis = await callClaude({
        prompt: ANALYSIS_PROMPT(model, finalStats, allListings),
        system: ANALYSIS_SYSTEM,
        jsonMode: true,
      });
    } catch (err) {
      console.warn(`DE Market [${model.id}]: AI analysis failed:`, err.message);
    }
  }

  // Build comparable listings from real data
  const comparableListings = allListings.slice(0, 10).map((l) => ({
    title: l.title,
    price_eur: l.price,
    mileage_km: l.mileage,
    year: l.year,
    color: null,
    location: "Germany",
    platform: l.platform,
    days_listed: null,
    dealer_name: l.dealer || null,
    key_options: null,
    url: l.url,
  }));

  const dataSources = {
    "mobile.de": mobileListings.length,
    "AutoScout24": autoscoutListings.length,
    ...(specialistListings.length > 0 && {
      ...(isPorsche && { "elferspot.com": specialistListings.filter((l) => l.platform === "elferspot.com").length }),
      ...((isExotic || isPorsche) && { "classicdriver.com": specialistListings.filter((l) => l.platform === "classicdriver.com").length }),
    }),
  };

  // Confidence based on real data volume
  let confidence = 0.5;
  if (allListings.length >= 20) confidence = 0.92;
  else if (allListings.length >= 10) confidence = 0.82;
  else if (allListings.length >= 5) confidence = 0.70;
  else if (allListings.length >= 2) confidence = 0.55;

  // Use settings from DB (not hardcoded env vars)
  const settings = await getSettings();
  const minMargin = Math.max(settings.minMarginEur, finalStats.median * (settings.minMarginPct / 100));

  return {
    modelId: model.id,
    make: model.make,
    model: model.model,
    yearRange: model.yearRange,
    segment: model.segment,

    pricing,

    trend: aiAnalysis?.trend || {
      direction: "STABLE",
      change_7d_pct: 0,
      change_30d_pct: 0,
      change_90d_pct: 0,
      seasonal_factor: "NEUTRAL",
      seasonal_notes: "Insufficient data for trend analysis",
    },

    demand: await (async () => {
      // Record this scan's listings for velocity tracking
      try { await recordListingSnapshot(model.id, allListings); } catch (e) { console.warn("Demand tracker record failed:", e.message); }

      // Compute REAL demand velocity from tracked data
      try {
        const realVelocity = await computeDemandVelocity(model.id);
        if (realVelocity.velocityScore !== null) {
          return {
            velocity_score: realVelocity.velocityScore,
            avg_days_on_market: realVelocity.avgDaysOnMarket,
            inquiry_rate: realVelocity.velocityScore >= 70 ? "HIGH" : realVelocity.velocityScore >= 40 ? "MODERATE" : "LOW",
            price_resilience: realVelocity.priceResilience >= 70 ? "STRONG" : realVelocity.priceResilience >= 40 ? "MODERATE" : "WEAK",
            sales_last_30d: realVelocity.turnoverRate,
            new_listings_last_7d: realVelocity.supplyRate,
            data_source: "real_tracking",
            data_points: realVelocity.dataPoints,
          };
        }
      } catch (e) { console.warn("Demand velocity compute failed:", e.message); }

      // Fallback to AI-estimated or heuristic demand
      return aiAnalysis?.demand || {
        velocity_score: allListings.length >= 15 ? 70 : allListings.length >= 5 ? 50 : 30,
        avg_days_on_market: allListings.length >= 10 ? 28 : 45,
        inquiry_rate: allListings.length >= 15 ? "HIGH" : "MODERATE",
        price_resilience: "MODERATE",
        sales_last_30d: null,
        new_listings_last_7d: null,
        data_source: "estimated",
      };
    })(),

    spec_premiums: aiAnalysis?.spec_premiums || { colors: {}, options: {}, avoid_specs: [] },

    comparable_listings: comparableListings,
    data_sources: dataSources,

    market_notes: aiAnalysis?.market_notes || `${allListings.length} real listings found. Median price €${finalStats.median.toLocaleString()}.`,
    recommended_max_landed_cost_eur: Math.round(finalStats.median - minMargin),
    minimum_acceptable_margin_eur: Math.round(minMargin),

    confidence,
    dataSource: "REAL_SCRAPING",

    scannedAt: new Date().toISOString(),
  };
}

/**
 * Scan ALL tracked models. Runs sequentially to avoid rate limits.
 */
export async function scanAllModels(models, onProgress) {
  const results = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    onProgress?.(model.id, i, models.length);

    try {
      const result = await scanModel(model);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`Scan failed for ${model.make} ${model.model}:`, error.message);
      results.push({
        modelId: model.id,
        make: model.make,
        model: model.model,
        error: error.message,
        scannedAt: new Date().toISOString(),
      });
    }

    // Buffer between models to avoid Apify rate limits
    if (i < models.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results;
}

// ══════════════════════════════════════════
// WEB SEARCH FALLBACK — when all scrapers fail
// ══════════════════════════════════════════

async function searchWebForListings(model) {
  if (!process.env.APIFY_API_KEY) return [];

  const listings = [];
  const queries = [
    `${model.make} ${model.model} kaufen Deutschland preis € ${model.yearRange[0]}-${model.yearRange[1]}`,
    `${model.make} ${model.model} mobile.de autoscout24 ${model.yearRange[0]}`,
  ];

  for (const query of queries) {
    try {
      console.log(`DE Market [${model.id}]: web search — "${query}"`);

      const items = await runActorAndGetItems("apify~google-search-scraper", {
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        languageCode: "de",
        countryCode: "de",
      });

      const results = items?.[0]?.organicResults || items.flatMap((i) => i.organicResults || [i]);

      for (const r of results) {
        const text = `${r.title || ""} ${r.description || r.snippet || ""}`;
        const url = r.url || r.link || "";

        // Extract Euro prices
        const pricePatterns = [/€\s?([\d.]+)/g, /([\d.]+)\s?€/g, /(\d{2,3}\.\d{3})(?!\s*km)/g];
        for (const pattern of pricePatterns) {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const price = parseInt(match[1].replace(/\./g, ""));
            if (price >= 20000 && price <= 1500000) {
              const kmMatch = text.match(/([\d.]+)\s*km/);
              const yearMatch = text.match(/\b(20[012]\d)\b/);
              listings.push({
                title: (r.title || "").substring(0, 120),
                price,
                mileage: kmMatch ? parseInt(kmMatch[1].replace(/\./g, "")) : 0,
                year: yearMatch ? parseInt(yearMatch[1]) : 0,
                dealer: null,
                platform: url.includes("mobile.de") ? "mobile.de" : url.includes("autoscout24") ? "autoscout24.de" : "web",
                url,
              });
              break;
            }
          }
        }
      }

      if (listings.length >= 5) break;
    } catch (err) {
      console.log(`DE Market [${model.id}]: web search failed — ${err.message}`);
    }
  }

  // Deduplicate
  const seen = new Set();
  return listings.filter((l) => {
    const key = l.url || `${l.price}-${l.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
