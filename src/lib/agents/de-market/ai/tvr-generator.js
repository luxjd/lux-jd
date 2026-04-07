/**
 * Target Vehicle Report (TVR) Generator.
 *
 * Takes a market scan result and generates the formal TVR contract
 * that the JP Sourcing Agent and Orchestrator consume.
 *
 * This is the PRIMARY output of the DE Market Agent — per PRD Section 5.5.
 */

import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";

const MIN_MARGIN_EUR = parseInt(process.env.MIN_MARGIN_EUR || "15000");
const MIN_MARGIN_PCT = parseInt(process.env.MIN_MARGIN_PCT || "20");

/**
 * Generate a Target Vehicle Report from a market scan result.
 * @param {object} scan — output of market-scanner.scanModel()
 * @returns {object} Formal TVR contract
 */
export async function generateTVR(scan) {
  if (!scan || scan.error) return null;

  const fxData = await fetchFxRate();
  const median = scan.pricing?.median_eur || 0;
  const minMargin = Math.max(MIN_MARGIN_EUR, median * (MIN_MARGIN_PCT / 100));
  const recommendedMaxLanded = scan.recommended_max_landed_cost_eur || Math.round(median - minMargin);

  // Determine preferred and avoid colors
  const colorEntries = Object.entries(scan.spec_premiums?.colors || {});
  const preferredColors = colorEntries.filter(([, mod]) => mod >= 1.03).map(([name]) => name);
  const avoidColors = colorEntries.filter(([, mod]) => mod < 0.97).map(([name]) => name);

  return {
    reportType: "TARGET_VEHICLE_REPORT",
    version: "1.0",
    modelId: scan.modelId,

    vehicleSpec: {
      make: scan.make,
      model: scan.model,
      yearRange: scan.yearRange,
      segment: scan.segment,
      criticalSpecs: ["LHD", "sub-50K-km", "EU-spec", "Grade-4.0+"],
      preferredColors,
      avoidColors,
      avoidSpecs: scan.spec_premiums?.avoid_specs || [],
    },

    marketValue: {
      medianEur: scan.pricing?.median_eur,
      meanEur: scan.pricing?.mean_eur,
      p25Eur: scan.pricing?.p25_eur,
      p75Eur: scan.pricing?.p75_eur,
      minEur: scan.pricing?.min_eur,
      maxEur: scan.pricing?.max_eur,
      sampleSize: scan.pricing?.sample_size,
      specPremiumModifiers: scan.spec_premiums?.colors || {},
      optionPremiums: scan.spec_premiums?.options || {},
    },

    demand: {
      velocityScore: scan.demand?.velocity_score,
      avgDaysOnMarket: scan.demand?.avg_days_on_market,
      inquiryRate: scan.demand?.inquiry_rate,
      priceResilience: scan.demand?.price_resilience,
      salesLast30d: scan.demand?.sales_last_30d,
      newListingsLast7d: scan.demand?.new_listings_last_7d,
      trendDirection: scan.trend?.direction,
      seasonalFactor: scan.trend?.seasonal_factor,
    },

    financialThresholds: {
      recommendedMaxLandedCostEur: recommendedMaxLanded,
      minimumAcceptableMarginEur: Math.round(minMargin),
      minimumAcceptableMarginPct: MIN_MARGIN_PCT,
      currentFxRate: fxData.rate,
      fxSource: fxData.source,
      fxLive: fxData.live,
    },

    confidence: scan.confidence || 0.75,
    dataSourcesUsed: Object.keys(scan.data_sources || {}).length,
    dataSources: scan.data_sources,
    sampleSize: scan.pricing?.sample_size,
    marketNotes: scan.market_notes,

    comparableListings: scan.comparable_listings || [],

    generatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours

    reasoningChain: `Based on ${scan.pricing?.sample_size || 0} active listings across ${Object.keys(scan.data_sources || {}).length} platforms. Median price €${median?.toLocaleString()} with ${scan.trend?.direction?.toLowerCase()} trend (${scan.trend?.change_30d_pct > 0 ? "+" : ""}${scan.trend?.change_30d_pct}% 30d). Velocity score ${scan.demand?.velocity_score}/100 (${scan.demand?.inquiry_rate} demand). Recommended max landed cost = median €${median?.toLocaleString()} - minimum margin €${Math.round(minMargin)?.toLocaleString()} = €${recommendedMaxLanded?.toLocaleString()}. FX at ¥${fxData.rate}/€ (${fxData.live ? "live" : "cached"}).`,
  };
}

/**
 * Generate TVRs for all scanned models.
 */
export async function generateAllTVRs(scanResults) {
  const tvrs = [];
  for (const scan of scanResults) {
    const tvr = await generateTVR(scan);
    if (tvr) tvrs.push(tvr);
  }
  return tvrs;
}
