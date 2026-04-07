/**
 * Real Valuation Engine — calls Claude API for AI analysis.
 *
 * Pipeline:
 * 1. Input validation + enrichment (Claude Haiku)
 * 2. Photo analysis (Claude Vision) — parallel
 * 3. Market research (Claude Sonnet) — parallel
 * 4. FX rate fetch (frankfurter.app) — parallel
 * 5. Landed cost calculation (local math)
 * 6. Margin calculation (local math)
 * 7. Risk assessment (Claude Sonnet)
 * 8. Final recommendation (Claude Sonnet)
 * 9. Report assembly
 */

import { isAIAvailable, callClaude } from "@/lib/claude";
import { analyzePhotos } from "./photo-analyzer";
import { parseAuctionSheet } from "./sheet-parser";
import { estimateMarketValue } from "./market-estimator";
import { assessRiskAndRecommend } from "./risk-recommender";
import { fetchFxRate } from "./fx-fetcher";

const FX_BUFFER_PCT = parseFloat(process.env.FX_BUFFER_PCT || "3") / 100;
const OPEX_PER_VEHICLE = 500; // operational overhead per spec

// TUV complexity: EU-spec LHD = low, EU-spec RHD or minor mods = medium, non-EU = high
function getTuvCost(make, driveSide, hasModifications) {
  const euBrands = ["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "BMW M", "Maserati"];
  const isEuSpec = euBrands.includes(make);
  if (isEuSpec && driveSide === "LHD" && !hasModifications) return { cost: 400, complexity: "LOW" };
  if (isEuSpec) return { cost: 800, complexity: "MEDIUM" };
  return { cost: 1500, complexity: "HIGH" };
}

function calculateLandedCost(purchasePriceJpy, fxRate, estimatedValueEur, make, driveSide, hasModifications) {
  const bufferedRate = fxRate * (1 - FX_BUFFER_PCT);
  const purchaseEur = Math.round(purchasePriceJpy / bufferedRate);
  const auctionFees = Math.round(purchaseEur * 0.04);
  const jpTransport = 400;
  const exportDocs = 175;
  const freight = 2800;
  const insurance = Math.round(Math.max(purchaseEur, estimatedValueEur * 0.7) * 0.02);
  const cifValue = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance;
  const customsDuty = Math.round(cifValue * 0.10);
  const importVat = Math.round((cifValue + customsDuty) * 0.19);
  const portHandling = 600;
  const tuv = getTuvCost(make, driveSide, hasModifications);
  const tuvCost = tuv.cost;
  const registration = 150;
  const deTransport = 450;
  const detailing = 1200;
  const photography = 500;
  const totalLanded = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance + customsDuty + portHandling + tuvCost + registration + deTransport + detailing + photography;
  const totalWithVat = totalLanded + importVat;

  return {
    purchasePriceJpy,
    fxRateUsed: fxRate,
    fxBufferApplied: FX_BUFFER_PCT * 100,
    purchasePriceEur: purchaseEur,
    auctionFeesEur: auctionFees,
    jpTransportEur: jpTransport,
    exportDocsEur: exportDocs,
    freightEur: freight,
    insuranceEur: insurance,
    cifValueEur: cifValue,
    customsDutyEur: customsDuty,
    importVatEur: importVat,
    portHandlingEur: portHandling,
    tuvEstimatedEur: tuvCost,
    tuvComplexity: tuv.complexity,
    registrationEur: registration,
    deTransportEur: deTransport,
    detailingEur: detailing,
    photographyEur: photography,
    totalLandedCostEur: totalLanded,
    totalCashOutlayEur: totalWithVat,
    reclaimableVatEur: importVat,
  };
}

export async function generateRealValuation(input) {
  const startTime = Date.now();

  // ─── Step 1: Enrichment (quick Claude call) ───
  let enrichment = null;
  if (isAIAvailable()) {
    enrichment = await callClaude({
      prompt: `Vehicle: ${input.make} ${input.model} ${input.year}. Return ONLY valid JSON: {"engine_spec": "e.g. 3.9L Twin-Turbo V8, 670 PS", "original_msrp_eur": <integer when new>, "production_years": "e.g. 2015-2019", "full_model_name": "e.g. Ferrari 488 GTB (F142M)", "transmission_type": "AUTOMATIC/MANUAL/DCT/PDK/SMG", "fuel_type": "PETROL/DIESEL/HYBRID/ELECTRIC"}`,
      model: process.env.CLAUDE_MODEL_FAST,
      jsonMode: true,
    });
  }

  // ─── Steps 2, 3, 4: Parallel execution ───
  const [photoResult, sheetResult, marketResult, fxResult] = await Promise.all([
    // Step 2: Photo analysis
    input.images?.length > 0
      ? analyzePhotos(input.images, input.make, input.model, input.year)
      : Promise.resolve(null),

    // Step 2b: Auction sheet
    input.auctionSheetImage
      ? parseAuctionSheet(input.auctionSheetImage)
      : Promise.resolve(null),

    // Step 3: Market estimation
    estimateMarketValue(input),

    // Step 4: FX rate
    fetchFxRate(),
  ]);

  // ─── Step 5: Landed cost ───
  if (!marketResult?.estimated_sale_price_eur && !marketResult?.price_statistics?.median) {
    throw new Error("Market estimation failed: no sale price estimate available. Scrapers may have returned no results.");
  }
  const estimatedSalePrice = marketResult.estimated_sale_price_eur || marketResult.price_statistics.median;
  const hasModifications = !!(photoResult?.visible_modifications?.length || sheetResult?.modification_notes?.length);
  const landedCost = calculateLandedCost(input.askingPriceJpy, fxResult.rate, estimatedSalePrice, input.make, input.driveSide, hasModifications);

  // ─── Step 6: Margin ───
  const grossMargin = estimatedSalePrice - landedCost.totalLandedCostEur;
  const grossMarginPct = Number(((grossMargin / estimatedSalePrice) * 100).toFixed(1));
  const p25 = marketResult?.price_statistics?.p25 || estimatedSalePrice;
  const p75 = marketResult?.price_statistics?.p75 || estimatedSalePrice;

  // Condition scores (from photos or auction sheet or defaults)
  const extScore = photoResult?.exterior_score || (input.auctionGrade ? input.auctionGrade * 1.8 : 7.0);
  const intScore = photoResult?.interior_score || (input.auctionGrade ? input.auctionGrade * 1.9 : 7.5);

  // ─── Steps 7-8: Risk + Recommendation (Claude Sonnet) ───
  let riskRecommendation = null;
  if (isAIAvailable()) {
    riskRecommendation = await assessRiskAndRecommend({
      make: input.make,
      model: input.model,
      year: input.year,
      mileageKm: input.mileageKm,
      driveSide: input.driveSide,
      exteriorColor: input.exteriorColor,
      serviceHistory: input.serviceHistory,
      auctionGrade: input.auctionGrade,
      accidentHistory: input.accidentHistory,
      conditionExterior: extScore,
      conditionInterior: intScore,
      conditionNotes: photoResult?.overall_impression || sheetResult?.overall_assessment || "No photos analyzed",
      askingPriceJpy: input.askingPriceJpy,
      purchaseEur: landedCost.purchasePriceEur,
      totalLandedCost: landedCost.totalLandedCostEur,
      estimatedSalePrice,
      grossMargin,
      grossMarginPct,
      cashOutlay: landedCost.totalCashOutlayEur,
      fxRate: fxResult.rate,
      comparableCount: marketResult?.comparable_count || 0,
      avgDaysOnMarket: marketResult?.avg_days_on_market || 30,
      marketLiquidity: marketResult?.market_liquidity || "MEDIUM",
      trendDirection: marketResult?.trend_direction || "STABLE",
    });
  }

  // ─── Step 9: Assemble report ───
  const processingTime = Number(((Date.now() - startTime) / 1000).toFixed(1));
  const holdDays = 42 + 5 + 7 + (marketResult?.avg_days_on_market || 30);
  const annualizedRoi = Number(((grossMargin / landedCost.totalCashOutlayEur) * (365 / holdDays) * 100).toFixed(1));

  // Merge AI results with defaults for any missing pieces
  const conditionGrade = extScore >= 8.5 ? "EXCELLENT" : extScore >= 7.0 ? "VERY_GOOD" : extScore >= 5.5 ? "GOOD" : "FAIR";

  // Confidence: geometric mean of 3 sub-scores per spec section 3.6
  const comparableCount = marketResult?.comparable_count || 0;
  const marketDataConf = comparableCount > 20 ? 0.95 : comparableCount > 10 ? 0.85 : comparableCount > 5 ? 0.70 : 0.55;
  const conditionConf = photoResult?.confidence || (input.auctionGrade ? (input.auctionGrade >= 4.5 ? 0.92 : 0.78) : 0.50);
  const fxConf = fxResult.live ? 0.90 : 0.70;
  const confidence = Number(Math.pow(marketDataConf * conditionConf * fxConf, 1 / 3).toFixed(2));

  return {
    valuationId: `val-${Date.now()}`,
    timestamp: new Date().toISOString(),
    aiPowered: isAIAvailable(),
    fxLive: fxResult.live,

    vehicleSummary: {
      make: input.make,
      model: input.model,
      year: input.year,
      mileageKm: input.mileageKm,
      driveSide: input.driveSide,
      exteriorColor: input.exteriorColor,
      interiorColor: input.interiorColor || "Not specified",
      serviceHistory: input.serviceHistory || "UNKNOWN",
      auctionGrade: input.auctionGrade || null,
      accidentHistory: input.accidentHistory || false,
      segment: enrichment?.full_model_name ? "ENRICHED" : "STANDARD",
      specNotes: input.specificationNotes || "",
      transmission: input.transmission || null,
      fuelType: input.fuelType || null,
      engineSpec: enrichment?.engine_spec || null,
      originalMsrp: enrichment?.original_msrp_eur || null,
      productionYears: enrichment?.production_years || null,
      fullModelName: enrichment?.full_model_name || null,
    },

    conditionAssessment: {
      overallGrade: conditionGrade,
      overallGradeNumeric: Number(((extScore + intScore) / 2).toFixed(1)),
      exteriorScore: Number(extScore.toFixed ? extScore.toFixed(1) : extScore),
      exteriorNotes: photoResult?.exterior_notes || (input.auctionGrade >= 4.5 ? ["Paint in excellent condition", "Minimal wear"] : ["Condition assessment based on grade only"]),
      interiorScore: Number(intScore.toFixed ? intScore.toFixed(1) : intScore),
      interiorNotes: photoResult?.interior_notes || ["Interior assessment based on grade only"],
      mechanicalNotes: sheetResult?.mechanical_notes || (input.auctionGrade >= 4.0 ? ["No mechanical issues noted"] : ["Mechanical condition unknown"]),
      modificationNotes: photoResult?.visible_modifications || sheetResult?.modification_notes || ["No modifications detected"],
      photoAnalysisSummary: photoResult?.overall_impression || null,
      conditionConfidence: conditionConf,
      photoCount: input.images?.length || 0,
      auctionSheetParsed: sheetResult || null,
    },

    marketAnalysis: {
      totalComparables: marketResult?.comparable_count || 0,
      priceStatistics: marketResult?.price_statistics || { median: estimatedSalePrice, mean: estimatedSalePrice, p25, p75, min: p25, max: p75 },
      estimatedSalePrice,
      priceAdjustments: marketResult?.price_adjustments || [],
      searchCriteria: {
        make: input.make,
        model: input.model,
        yearRange: [input.year - 2, input.year + 2],
        mileageRange: [Math.max(0, input.mileageKm - 20000), input.mileageKm + 20000],
        driveSide: input.driveSide,
      },
      avgDaysOnMarket: marketResult?.avg_days_on_market || 30,
      marketLiquidity: marketResult?.market_liquidity || "MEDIUM",
      trendDirection: marketResult?.trend_direction || "STABLE",
      dataFreshness: new Date().toISOString(),
      dataSource: marketResult?.data_source || "mobile.de + autoscout24 + Claude AI",
    },

    landedCost,

    marginAnalysis: {
      estimatedSalePrice,
      totalLandedCost: landedCost.totalLandedCostEur,
      grossMarginEur: grossMargin,
      grossMarginPct,
      marginAfterOpex: grossMargin - OPEX_PER_VEHICLE,
      pessimisticMargin: p25 - landedCost.totalLandedCostEur,
      baseMargin: grossMargin,
      optimisticMargin: p75 - landedCost.totalLandedCostEur,
      capitalRequired: landedCost.totalCashOutlayEur,
      returnOnCapital: Number(((grossMargin / landedCost.totalCashOutlayEur) * 100).toFixed(1)),
      estimatedHoldDays: holdDays,
      annualizedRoi,
      marginConfidence: confidence,
      confidenceBreakdown: {
        marketDataConfidence: marketDataConf,
        conditionConfidence: conditionConf,
        fxConfidence: fxConf,
      },
    },

    riskAssessment: riskRecommendation ? {
      conditionRisk: riskRecommendation.risk_scores.condition,
      provenanceRisk: riskRecommendation.risk_scores.provenance,
      tuvRisk: riskRecommendation.risk_scores.tuv,
      marketRisk: riskRecommendation.risk_scores.market,
      currencyRisk: riskRecommendation.risk_scores.currency,
      capitalRisk: riskRecommendation.risk_scores.capital,
      overallRiskScore: riskRecommendation.overall_risk_score,
      overallRiskLevel: riskRecommendation.overall_risk_level,
    } : null,

    recommendation: riskRecommendation ? {
      verdict: riskRecommendation.verdict,
      verdictReasoning: riskRecommendation.verdict_reasoning,
      maxBidJpy: riskRecommendation.max_bid_jpy,
      maxBidReasoning: riskRecommendation.max_bid_reasoning,
      keyStrengths: riskRecommendation.key_strengths || [],
      keyConcerns: riskRecommendation.key_concerns || [],
      actionItems: riskRecommendation.action_items || [],
    } : null,

    reasoning: riskRecommendation?.verdict_reasoning
      ? `${riskRecommendation.verdict_reasoning} The vehicle's total landed cost of €${landedCost.totalLandedCostEur.toLocaleString()} against an estimated German market value of €${estimatedSalePrice.toLocaleString()} yields a ${grossMarginPct}% gross margin (€${grossMargin.toLocaleString()}). Confidence in this estimate is ${(confidence * 100).toFixed(0)}% based on ${comparableCount} comparable listings, ${conditionConf >= 0.8 ? "strong" : "moderate"} condition data, and ${fxResult.live ? "live" : "cached"} FX rate of ¥${fxResult.rate}/€.`
      : null,

    comparableListings: marketResult?.comparable_listings?.map((c, i) => ({
      id: `comp-${i + 1}`,
      title: c.title,
      price: c.price,
      mileage: c.mileage,
      location: c.location,
      platform: c.platform,
      daysOnMarket: c.days_on_market,
    })) || [],

    processingTimeSeconds: processingTime,
  };
}
