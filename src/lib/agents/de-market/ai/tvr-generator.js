/**
 * Target Vehicle Report (TVR) Generator.
 *
 * Takes a market scan result and generates the formal TVR contract
 * that the JP Sourcing Agent and Orchestrator consume.
 *
 * This is the PRIMARY output of the DE Market Agent — per PRD Section 5.5.
 */

import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";
import { formatNumber } from "@/lib/format";
import { getSettings } from "@/lib/settings";

/**
 * Generate a Target Vehicle Report from a market scan result.
 * @param {object} scan — output of market-scanner.scanModel()
 * @param {object} [settings] — app settings (optional, fetched if not provided)
 * @returns {object} Formal TVR contract
 */
export async function generateTVR(scan, settings = null) {
  if (!scan || scan.error) return null;

  if (!settings) settings = await getSettings();

  const fxData = await fetchFxRate();
  const median = scan.pricing?.median_eur || 0;
  const minMargin = Math.max(settings.minMarginEur, median * (settings.minMarginPct / 100));
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
      marginOfErrorPct: scan.pricing?.marginOfErrorPct ?? null,
      salesMix: scan.pricing?.salesMix || null,
      specPremiumModifiers: scan.spec_premiums?.colors || {},
      optionPremiums: scan.spec_premiums?.options || {},
      specPremiumSource: scan.spec_premiums?.seededBrand ? "seeded+ai" : "ai-only",
      // Docx §6.1.3: "Differentiate by critical spec elements (exterior color,
      // interior, optional equipment, service history completeness)"
      comparablesBySpec: scan.comparables_by_spec
        ? {
            byColor: scan.comparables_by_spec.byColor || {},
            byMileage: scan.comparables_by_spec.byMileage || {},
            byServiceHistory: scan.comparables_by_spec.byServiceHistory || {},
            derivedColorPremiums: scan.comparables_by_spec.derivedColorPremiums || {},
            sampleSize: scan.comparables_by_spec.sampleSize || 0,
            enrichmentSource: scan.comparables_by_spec.enrichmentSource || "none",
            skipped: scan.comparables_by_spec.skipped || false,
            skipReason: scan.comparables_by_spec.skipReason || null,
          }
        : null,
    },

    demand: {
      velocityScore: scan.demand?.velocity_score,
      avgDaysOnMarket: scan.demand?.avg_days_on_market,
      inquiryRate: scan.demand?.inquiry_rate,
      priceResilience: scan.demand?.price_resilience,
      salesLast30d: scan.demand?.sales_last_30d,
      newListingsLast7d: scan.demand?.new_listings_last_7d,
      trendDirection: scan.trend?.direction,
      change7dPct: scan.trend?.change_7d_pct,
      change30dPct: scan.trend?.change_30d_pct,
      change90dPct: scan.trend?.change_90d_pct,
      // Docx §6.1.3: "historical trend (30/90/180 days)"
      change180dPct: scan.trend?.change_180d_pct ?? null,
      change180dCovered: scan.trend?.change_180d_covered ?? false,
      historySpanDays: scan.trend?.history_span_days ?? null,
      seasonalFactor: scan.trend?.seasonal_factor,
      seasonalNotes: scan.trend?.seasonal_notes,
      trendSource: scan.trend?.data_source || "fallback",
      trendDataPoints: scan.trend?.data_points || 0,
    },

    // Docx §6.1.3: "market shifts due to new model releases"
    lifecycle: scan.lifecycle
      ? {
          phase: scan.lifecycle.phase,
          successor: scan.lifecycle.successor,
          successorLaunchDate: scan.lifecycle.successorLaunchDate,
          monthsSinceSuccessor: scan.lifecycle.monthsSinceSuccessor,
          expectedDepreciationBias: scan.lifecycle.expectedDepreciationBias,
          notes: scan.lifecycle.notes,
        }
      : null,

    financialThresholds: {
      recommendedMaxLandedCostEur: recommendedMaxLanded,
      minimumAcceptableMarginEur: Math.round(minMargin),
      minimumAcceptableMarginPct: settings.minMarginPct,
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
    validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),

    reasoningChain: `Based on ${scan.pricing?.sample_size || 0} active listings across ${Object.keys(scan.data_sources || {}).length} platforms. Median price €${formatNumber(median)} with ${scan.trend?.direction?.toLowerCase()} trend (${scan.trend?.change_7d_pct > 0 ? "+" : ""}${scan.trend?.change_7d_pct || 0}% 7d, ${scan.trend?.change_30d_pct > 0 ? "+" : ""}${scan.trend?.change_30d_pct || 0}% 30d, ${scan.trend?.change_90d_pct > 0 ? "+" : ""}${scan.trend?.change_90d_pct || 0}% 90d). Velocity score ${scan.demand?.velocity_score}/100 (${scan.demand?.inquiry_rate} demand). Recommended max landed cost = median €${formatNumber(median)} - minimum margin €${formatNumber(Math.round(minMargin))} = €${formatNumber(recommendedMaxLanded)}. FX at ¥${fxData.rate}/€ (${fxData.live ? "live" : "cached"}).`,
  };
}

/**
 * Generate TVRs for all scanned models.
 * @param {object[]} scanResults
 * @param {object} [settings] — app settings (pass once, avoids re-fetching per TVR)
 */
export async function generateAllTVRs(scanResults, settings = null) {
  if (!settings) settings = await getSettings();
  const tvrs = [];
  for (const scan of scanResults) {
    const tvr = await generateTVR(scan, settings);
    if (tvr) tvrs.push(tvr);
  }
  return tvrs;
}
