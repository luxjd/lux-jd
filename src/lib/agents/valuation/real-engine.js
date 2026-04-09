/**
 * Real Valuation Engine — production-grade pipeline.
 *
 * Pipeline:
 * 1. Input validation + enrichment (Claude Haiku)
 * 2. Photo analysis with classification (Claude Vision) — parallel
 * 3. Auction sheet parsing with damage codes (Claude Vision) — parallel
 * 4. Market research with outlier filtering (Scrapers + Claude Sonnet) — parallel
 * 5. FX rate fetch with volatility scoring — parallel
 * 6. Photo + sheet merge (condition precedence logic)
 * 7. Landed cost calculation (local math)
 * 8. Deterministic max bid calculation
 * 9. Margin calculation with scenarios
 * 10. Risk assessment + recommendation (Claude Sonnet)
 * 11. Valuation history comparison
 * 12. Report assembly
 */

import { isAIAvailable, callClaude } from "@/lib/claude";
import { analyzePhotos } from "./photo-analyzer";
import { parseAuctionSheet } from "./sheet-parser";
import { estimateMarketValue } from "./market-estimator";
import { assessRiskAndRecommend } from "./risk-recommender";
import { fetchFxRate } from "./fx-fetcher";
import { validateInput } from "./validation";
import { db } from "@/lib/db-storage";

const FX_BUFFER_PCT = parseFloat(process.env.FX_BUFFER_PCT || "3") / 100;
const MIN_MARGIN_EUR = parseInt(process.env.MIN_MARGIN_EUR || "15000");
const MIN_MARGIN_PCT = parseInt(process.env.MIN_MARGIN_PCT || "20");
const OPEX_PER_VEHICLE = 500;

// ══════════════════════════════════════════
// TUV COST ESTIMATION
// ══════════════════════════════════════════

function getTuvCost(make, driveSide, hasModifications, tuvRiskFlags = []) {
  const euBrands = ["Ferrari", "Mercedes-Benz", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "BMW", "BMW M", "Maserati", "Rolls-Royce", "McLaren", "Bugatti", "Lotus", "Alfa Romeo"];
  const isEuSpec = euBrands.includes(make);
  const highRiskFlags = tuvRiskFlags.length;

  if (isEuSpec && driveSide === "LHD" && !hasModifications && highRiskFlags === 0) {
    return { cost: 400, complexity: "LOW" };
  }
  if (isEuSpec && highRiskFlags <= 1) {
    return { cost: 800, complexity: "MEDIUM" };
  }
  if (highRiskFlags >= 3) {
    return { cost: 2000, complexity: "VERY_HIGH" };
  }
  return { cost: 1500, complexity: "HIGH" };
}

// ══════════════════════════════════════════
// LANDED COST CALCULATOR
// ══════════════════════════════════════════

function calculateLandedCost(purchasePriceJpy, fxRate, estimatedValueEur, make, driveSide, hasModifications, tuvRiskFlags) {
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
  const tuv = getTuvCost(make, driveSide, hasModifications, tuvRiskFlags);
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

// ══════════════════════════════════════════
// DETERMINISTIC MAX BID FORMULA
// Per spec: max_bid = (sale_price - min_margin - fixed_costs) * fx_rate / (1 + variable_cost_pct)
// ══════════════════════════════════════════

function calculateMaxBid(estimatedSalePrice, fxRate, fixedCostsEur) {
  // Variable costs as % of purchase: auction fees 4%, insurance ~2%, customs 10% of CIF
  const variableCostPct = 0.04 + 0.02 + 0.10;
  const minMargin = Math.max(MIN_MARGIN_EUR, estimatedSalePrice * (MIN_MARGIN_PCT / 100));
  const maxPurchaseEur = estimatedSalePrice - minMargin - fixedCostsEur;

  if (maxPurchaseEur <= 0) return null;

  const maxPurchaseBeforeVariables = maxPurchaseEur / (1 + variableCostPct);
  const bufferedRate = fxRate * (1 - FX_BUFFER_PCT);
  const maxBidJpy = Math.round(maxPurchaseBeforeVariables * bufferedRate);

  return maxBidJpy > 0 ? maxBidJpy : null;
}

// ══════════════════════════════════════════
// CONDITION SCORING — improved grade mapping
// ══════════════════════════════════════════

// Maps auction grade (1-6) to condition score (1-10) using a realistic curve
function gradeToScore(grade) {
  if (!grade) return null;
  // Grade 6(S)=9.5, 5=8.5, 4.5=7.5, 4=6.5, 3.5=5.5, 3=4.5, 2=3, 1=1.5
  const mapping = { 6: 9.5, 5.5: 9.0, 5: 8.5, 4.5: 7.5, 4: 6.5, 3.5: 5.5, 3: 4.5, 2.5: 3.5, 2: 3.0, 1.5: 2.0, 1: 1.5 };
  if (mapping[grade] !== undefined) return mapping[grade];
  // Interpolate
  const grades = Object.keys(mapping).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < grades.length - 1; i++) {
    if (grade >= grades[i] && grade <= grades[i + 1]) {
      const ratio = (grade - grades[i]) / (grades[i + 1] - grades[i]);
      return mapping[grades[i]] + ratio * (mapping[grades[i + 1]] - mapping[grades[i]]);
    }
  }
  return Math.min(10, Math.max(1, grade * 1.5));
}

// ══════════════════════════════════════════
// PHOTO + SHEET MERGE LOGIC
// Spec: sheet precedence for mechanical, photos for cosmetic
// ══════════════════════════════════════════

function mergeConditionData(photoResult, sheetResult, auctionGrade) {
  const photoExt = photoResult?.exterior_score;
  const photoInt = photoResult?.interior_score;
  const gradeExt = gradeToScore(auctionGrade);
  const gradeInt = gradeToScore(auctionGrade);

  // Exterior: photo takes precedence if available, grade as fallback
  let exteriorScore;
  if (photoExt && gradeExt) {
    // Weighted: 70% photo (visual truth), 30% grade (structural assessment)
    exteriorScore = photoExt * 0.7 + gradeExt * 0.3;
  } else {
    exteriorScore = photoExt || gradeExt || 5.0;
  }

  // Interior: photo takes precedence
  let interiorScore;
  if (photoInt && gradeInt) {
    // If sheet has interior grade, factor it in
    const sheetIntGrade = sheetResult?.interior_grade;
    const intGradeScore = sheetIntGrade === "A" ? 9 : sheetIntGrade === "B" ? 7 : sheetIntGrade === "C" ? 5 : sheetIntGrade === "D" ? 3 : null;
    if (intGradeScore) {
      interiorScore = photoInt * 0.5 + intGradeScore * 0.3 + gradeInt * 0.2;
    } else {
      interiorScore = photoInt * 0.7 + gradeInt * 0.3;
    }
  } else {
    interiorScore = photoInt || gradeInt || 5.0;
  }

  // Mechanical notes: sheet takes precedence (photos can't see mechanical)
  const mechanicalNotes = sheetResult?.mechanical_notes?.length
    ? sheetResult.mechanical_notes
    : (auctionGrade && auctionGrade >= 4.0 ? ["No mechanical issues noted on auction sheet"] : ["Mechanical condition unknown — no auction sheet"]);

  // Modifications: merge both sources, deduplicate
  const mods = new Set([
    ...(photoResult?.visible_modifications || []),
    ...(sheetResult?.modification_notes || []),
  ]);

  // Damage: merge photo damage + sheet damage codes
  const visibleDamage = [
    ...(photoResult?.visible_damage || []),
    ...(sheetResult?.damage_codes?.map((d) => `${d.location}: ${d.meaning} [${d.severity || ""}]`) || []),
  ];

  // TUV risk flags from photos
  const tuvRiskFlags = photoResult?.tuv_risk_flags || [];

  // Confidence: use minimum (weakest link)
  const photoConf = photoResult?.confidence || 0;
  const sheetConf = sheetResult?.confidence || 0;
  let conditionConf;
  if (photoConf && sheetConf) {
    conditionConf = (photoConf + sheetConf) / 2; // Both sources = higher confidence
  } else if (photoConf) {
    conditionConf = photoConf * 0.85; // Photo only = slightly lower
  } else if (sheetConf) {
    conditionConf = sheetConf * 0.80; // Sheet only
  } else if (auctionGrade) {
    conditionConf = auctionGrade >= 4.5 ? 0.65 : 0.50; // Grade only
  } else {
    conditionConf = 0.30; // No condition data
  }

  return {
    exteriorScore: Number(exteriorScore.toFixed(1)),
    interiorScore: Number(interiorScore.toFixed(1)),
    mechanicalNotes,
    modifications: Array.from(mods),
    visibleDamage,
    tuvRiskFlags,
    conditionConfidence: Number(conditionConf.toFixed(2)),
    exteriorNotes: photoResult?.exterior_notes || (auctionGrade >= 4.5 ? ["Paint in excellent condition based on grade"] : ["Exterior assessment based on grade only"]),
    interiorNotes: photoResult?.interior_notes || ["Interior assessment based on grade only"],
    interiorOriginality: photoResult?.interior_originality || "UNKNOWN",
    driveSideObserved: photoResult?.drive_side_observed || null,
    panelConditions: sheetResult?.panel_conditions || null,
    damageCodes: sheetResult?.damage_codes || [],
    accidentContradiction: sheetResult?.accident_contradiction || null,
    serviceBookPresent: sheetResult?.service_book_present ?? null,
    serviceHistoryIndicator: sheetResult?.service_history_indicator || null,
  };
}

// ══════════════════════════════════════════
// VALUATION HISTORY COMPARISON
// ══════════════════════════════════════════

async function getHistoricalComparison(make, model, year) {
  try {
    const history = await db.valuations.getAll(50);
    if (!history || history.length === 0) return null;

    const similar = history.filter((v) => {
      const d = v.reportData || {};
      const vs = d.vehicleSummary || {};
      return vs.make === make && (vs.model === model || (vs.model && model && vs.model.toLowerCase().includes(model.toLowerCase().split(" ")[0])));
    });

    if (similar.length === 0) return null;

    const sameModel = similar.filter((v) => {
      const vs = (v.reportData || {}).vehicleSummary || {};
      return Math.abs((vs.year || 0) - year) <= 3;
    });

    const margins = sameModel
      .map((v) => (v.reportData || {}).marginAnalysis?.grossMarginEur)
      .filter((m) => m != null);

    const verdicts = sameModel
      .map((v) => (v.reportData || {}).recommendation?.verdict)
      .filter(Boolean);

    if (margins.length === 0 && verdicts.length === 0) return null;

    const avgMargin = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null;
    const buyCount = verdicts.filter((v) => v === "BUY").length;
    const passCount = verdicts.filter((v) => v === "PASS").length;

    let summary = `Found ${sameModel.length} previous valuations for similar ${make} ${model} vehicles.`;
    if (avgMargin != null) summary += ` Average margin was €${avgMargin.toLocaleString()}.`;
    if (verdicts.length) summary += ` Verdicts: ${buyCount} BUY, ${verdicts.length - buyCount - passCount} REVIEW, ${passCount} PASS.`;

    return {
      similarCount: sameModel.length,
      avgMarginEur: avgMargin,
      verdictBreakdown: { buy: buyCount, review: verdicts.length - buyCount - passCount, pass: passCount },
      summary,
    };
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════

export async function generateRealValuation(input) {
  const startTime = Date.now();

  // ─── Step 1: Validate input ───
  const validatedInput = validateInput(input);

  // ─── Step 1b: Enrichment (quick Claude call) ───
  let enrichment = null;
  if (isAIAvailable()) {
    enrichment = await callClaude({
      prompt: `Vehicle: ${validatedInput.make} ${validatedInput.model} ${validatedInput.year}.
Transmission provided: ${validatedInput.transmission || "unknown"}
Fuel type provided: ${validatedInput.fuelType || "unknown"}
Specification notes: ${validatedInput.specificationNotes || "none"}

Return ONLY valid JSON with these fields. Be precise — this data is used for financial decisions:
{
  "engine_spec": "exact engine specification e.g. '3.9L Twin-Turbo V8, 670 PS' — include displacement, configuration, forced induction, and power output",
  "original_msrp_eur": <integer — original MSRP when new in EUR, be accurate for the specific variant>,
  "production_years": "e.g. 2015-2019 — exact production run for this specific model variant",
  "full_model_name": "e.g. Ferrari 488 GTB (F142M) — include internal designation/chassis code if known",
  "transmission_type": "AUTOMATIC/MANUAL/DCT/PDK/SMG — only if not already provided, otherwise echo provided value",
  "fuel_type": "PETROL/DIESEL/HYBRID/ELECTRIC — only if not already provided",
  "notable_standard_features": ["key standard features for this model that affect resale value"],
  "known_issues": ["common problems/failure points for this model that a buyer should be aware of"],
  "depreciation_profile": "SLOW/MODERATE/FAST — how this model typically depreciates"
}`,
      model: process.env.CLAUDE_MODEL_FAST,
      jsonMode: true,
    });
  }

  // ─── Steps 2-5: Parallel execution ───
  const [photoResult, sheetResult, marketResult, fxResult] = await Promise.all([
    // Step 2: Photo analysis (with classification)
    input.images?.length > 0
      ? analyzePhotos(input.images, validatedInput.make, validatedInput.model, validatedInput.year)
      : Promise.resolve(null),

    // Step 3: Auction sheet parsing (with damage codes + service history)
    input.auctionSheetImage
      ? parseAuctionSheet(input.auctionSheetImage)
      : Promise.resolve(null),

    // Step 4: Market estimation (with outlier removal)
    estimateMarketValue(validatedInput),

    // Step 5: FX rate (with volatility)
    fetchFxRate(),
  ]);

  // ─── Step 6: Merge condition data ───
  const condition = mergeConditionData(photoResult, sheetResult, validatedInput.auctionGrade);

  // ─── Step 7: Landed cost ───
  if (!marketResult?.estimated_sale_price_eur && !marketResult?.price_statistics?.median) {
    throw new Error("Market estimation failed: no sale price estimate available.");
  }
  const estimatedSalePrice = marketResult.estimated_sale_price_eur || marketResult.price_statistics.median;
  const hasModifications = condition.modifications.length > 0;
  const landedCost = calculateLandedCost(
    validatedInput.askingPriceJpy, fxResult.rate, estimatedSalePrice,
    validatedInput.make, validatedInput.driveSide, hasModifications, condition.tuvRiskFlags
  );

  // ─── Step 8: Deterministic max bid ───
  const fixedCosts = landedCost.jpTransportEur + landedCost.exportDocsEur + landedCost.freightEur +
    landedCost.portHandlingEur + landedCost.tuvEstimatedEur + landedCost.registrationEur +
    landedCost.deTransportEur + landedCost.detailingEur + landedCost.photographyEur + OPEX_PER_VEHICLE;
  const deterministicMaxBid = calculateMaxBid(estimatedSalePrice, fxResult.rate, fixedCosts);

  // ─── Step 9: Margin calculation ───
  const grossMargin = estimatedSalePrice - landedCost.totalLandedCostEur;
  const grossMarginPct = estimatedSalePrice > 0 ? Number(((grossMargin / estimatedSalePrice) * 100).toFixed(1)) : 0;
  const p25 = marketResult?.price_statistics?.p25 || estimatedSalePrice;
  const p75 = marketResult?.price_statistics?.p75 || estimatedSalePrice;

  // Pessimistic: sell at P25, costs 10% higher
  const pessimisticCost = Math.round(landedCost.totalLandedCostEur * 1.10);
  const pessimisticMargin = p25 - pessimisticCost;
  // Optimistic: sell at P75
  const optimisticMargin = p75 - landedCost.totalLandedCostEur;

  const holdDays = 42 + 5 + 7 + (marketResult?.avg_days_on_market || 30);
  const annualizedRoi = landedCost.totalCashOutlayEur > 0
    ? Number(((grossMargin / landedCost.totalCashOutlayEur) * (365 / holdDays) * 100).toFixed(1))
    : 0;

  // Confidence: geometric mean of 3 sub-scores
  const comparableCount = marketResult?.comparable_count || 0;
  const marketDataConf = marketResult?.confidence || 0.5;
  const conditionConf = condition.conditionConfidence;
  const fxConf = fxResult.live ? (fxResult.volatility?.volatilityScore != null ? (1 - fxResult.volatility.volatilityScore * 0.3) : 0.90) : 0.70;
  const confidence = Number(Math.pow(marketDataConf * conditionConf * fxConf, 1 / 3).toFixed(2));

  // Condition grade string
  const avgCondScore = (condition.exteriorScore + condition.interiorScore) / 2;
  const conditionGrade = avgCondScore >= 8.5 ? "EXCELLENT" : avgCondScore >= 7.0 ? "VERY_GOOD" : avgCondScore >= 5.5 ? "GOOD" : avgCondScore >= 4.0 ? "FAIR" : "POOR";

  // ─── Step 10: History comparison (parallel-safe, non-blocking) ───
  let historicalComparison = null;
  try {
    historicalComparison = await getHistoricalComparison(validatedInput.make, validatedInput.model, validatedInput.year);
  } catch { /* non-critical */ }

  // ─── Step 11: Risk + Recommendation (Claude Sonnet) ───
  let riskRecommendation = null;
  if (isAIAvailable()) {
    riskRecommendation = await assessRiskAndRecommend({
      make: validatedInput.make,
      model: validatedInput.model,
      year: validatedInput.year,
      mileageKm: validatedInput.mileageKm,
      driveSide: validatedInput.driveSide,
      exteriorColor: validatedInput.exteriorColor,
      serviceHistory: validatedInput.serviceHistory,
      serviceBookPresent: condition.serviceBookPresent,
      auctionGrade: validatedInput.auctionGrade,
      interiorGrade: sheetResult?.interior_grade || null,
      accidentHistory: validatedInput.accidentHistory,
      accidentContradiction: condition.accidentContradiction,
      conditionExterior: condition.exteriorScore,
      conditionInterior: condition.interiorScore,
      interiorOriginality: condition.interiorOriginality,
      conditionNotes: photoResult?.overall_impression || sheetResult?.overall_assessment || "No condition data available",
      tuvRiskFlags: condition.tuvRiskFlags,
      visibleDamage: condition.visibleDamage,
      modifications: condition.modifications,
      panelConditions: condition.panelConditions,
      damageCodes: condition.damageCodes,
      askingPriceJpy: validatedInput.askingPriceJpy,
      purchaseEur: landedCost.purchasePriceEur,
      totalLandedCost: landedCost.totalLandedCostEur,
      estimatedSalePrice,
      grossMargin,
      grossMarginPct,
      pessimisticMargin,
      optimisticMargin,
      cashOutlay: landedCost.totalCashOutlayEur,
      fxRate: fxResult.rate,
      fxVolatilityAlert: fxResult.volatility?.alert || false,
      fxVolatilityAlertReason: fxResult.volatility?.alertReason || null,
      deterministicMaxBid: deterministicMaxBid,
      comparableCount,
      avgDaysOnMarket: marketResult?.avg_days_on_market || 30,
      marketLiquidity: marketResult?.market_liquidity || "MEDIUM",
      trendDirection: marketResult?.trend_direction || "STABLE",
      historicalComparison: historicalComparison?.summary || null,
    });
  }

  // ─── Step 12: Assemble report ───
  const processingTime = Number(((Date.now() - startTime) / 1000).toFixed(1));

  return {
    valuationId: `val-${Date.now()}`,
    timestamp: new Date().toISOString(),
    aiPowered: isAIAvailable(),
    fxLive: fxResult.live,

    vehicleSummary: {
      make: validatedInput.make,
      model: validatedInput.model,
      year: validatedInput.year,
      mileageKm: validatedInput.mileageKm,
      driveSide: validatedInput.driveSide,
      exteriorColor: validatedInput.exteriorColor,
      interiorColor: validatedInput.interiorColor || "Not specified",
      serviceHistory: condition.serviceHistoryIndicator || validatedInput.serviceHistory || "UNKNOWN",
      auctionGrade: validatedInput.auctionGrade || null,
      accidentHistory: validatedInput.accidentHistory || false,
      segment: enrichment?.full_model_name ? "ENRICHED" : "STANDARD",
      specNotes: validatedInput.specificationNotes || "",
      transmission: validatedInput.transmission || enrichment?.transmission_type || null,
      fuelType: validatedInput.fuelType || enrichment?.fuel_type || null,
      engineSpec: enrichment?.engine_spec || null,
      originalMsrp: enrichment?.original_msrp_eur || null,
      productionYears: enrichment?.production_years || null,
      fullModelName: enrichment?.full_model_name || null,
      knownIssues: enrichment?.known_issues || [],
      depreciationProfile: enrichment?.depreciation_profile || null,
    },

    conditionAssessment: {
      overallGrade: conditionGrade,
      overallGradeNumeric: Number(avgCondScore.toFixed(1)),
      exteriorScore: condition.exteriorScore,
      exteriorNotes: condition.exteriorNotes,
      interiorScore: condition.interiorScore,
      interiorNotes: condition.interiorNotes,
      interiorOriginality: condition.interiorOriginality,
      mechanicalNotes: condition.mechanicalNotes,
      modificationNotes: condition.modifications.length ? condition.modifications : ["No modifications detected"],
      visibleDamage: condition.visibleDamage,
      tuvRiskFlags: condition.tuvRiskFlags,
      panelConditions: condition.panelConditions,
      damageCodes: condition.damageCodes,
      accidentContradiction: condition.accidentContradiction,
      serviceBookPresent: condition.serviceBookPresent,
      photoAnalysisSummary: photoResult?.overall_impression || null,
      auctionSheetSummary: sheetResult?.overall_assessment || null,
      conditionConfidence: condition.conditionConfidence,
      photoCount: input.images?.length || 0,
      auctionSheetParsed: sheetResult || null,
    },

    marketAnalysis: {
      totalComparables: comparableCount,
      priceStatistics: marketResult?.price_statistics || { median: estimatedSalePrice, mean: estimatedSalePrice, p25, p75, min: p25, max: p75 },
      estimatedSalePrice,
      priceAdjustments: marketResult?.price_adjustments || [],
      searchCriteria: {
        make: validatedInput.make,
        model: validatedInput.model,
        yearRange: [validatedInput.year - 2, validatedInput.year + 2],
        mileageRange: [Math.max(0, validatedInput.mileageKm - 20000), validatedInput.mileageKm + 20000],
        driveSide: validatedInput.driveSide,
        searchWidened: marketResult?.search_widened || false,
      },
      outliersRemoved: marketResult?.outliers_removed || 0,
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
      pessimisticMargin,
      baseMargin: grossMargin,
      optimisticMargin,
      capitalRequired: landedCost.totalCashOutlayEur,
      returnOnCapital: landedCost.totalCashOutlayEur > 0 ? Number(((grossMargin / landedCost.totalCashOutlayEur) * 100).toFixed(1)) : 0,
      estimatedHoldDays: holdDays,
      annualizedRoi,
      marginConfidence: confidence,
      deterministicMaxBidJpy: deterministicMaxBid,
      confidenceBreakdown: {
        marketDataConfidence: Number(marketDataConf.toFixed(2)),
        conditionConfidence: Number(conditionConf.toFixed(2)),
        fxConfidence: Number(fxConf.toFixed(2)),
      },
    },

    fxAnalysis: {
      rate: fxResult.rate,
      source: fxResult.source,
      live: fxResult.live,
      volatility: fxResult.volatility || null,
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
      maxBidJpy: riskRecommendation.max_bid_jpy || deterministicMaxBid,
      maxBidReasoning: riskRecommendation.max_bid_reasoning || `Deterministic calculation based on minimum ${MIN_MARGIN_PCT}% / €${MIN_MARGIN_EUR.toLocaleString()} margin threshold`,
      keyStrengths: riskRecommendation.key_strengths || [],
      keyConcerns: riskRecommendation.key_concerns || [],
      actionItems: riskRecommendation.action_items || [],
    } : null,

    historicalComparison: historicalComparison || null,

    reasoning: riskRecommendation?.verdict_reasoning
      ? `${riskRecommendation.verdict_reasoning} The vehicle's total landed cost of €${landedCost.totalLandedCostEur.toLocaleString()} against an estimated German market value of €${estimatedSalePrice.toLocaleString()} yields a ${grossMarginPct}% gross margin (€${grossMargin.toLocaleString()}). Margin scenarios: pessimistic €${pessimisticMargin.toLocaleString()}, base €${grossMargin.toLocaleString()}, optimistic €${optimisticMargin.toLocaleString()}. Confidence in this estimate is ${(confidence * 100).toFixed(0)}% based on ${comparableCount} comparable listings, ${conditionConf >= 0.8 ? "strong" : conditionConf >= 0.5 ? "moderate" : "limited"} condition data, and ${fxResult.live ? "live" : "cached"} FX rate of ¥${fxResult.rate}/€.${fxResult.volatility?.alert ? ` ⚠ FX volatility alert: ${fxResult.volatility.alertReason}` : ""}${historicalComparison ? ` Historical context: ${historicalComparison.summary}` : ""}`
      : null,

    comparableListings: marketResult?.comparable_listings?.map((c, i) => ({
      id: `comp-${i + 1}`,
      title: c.title,
      price: c.price,
      mileage: c.mileage,
      location: c.location,
      platform: c.platform,
      url: c.url,
      daysOnMarket: c.days_on_market,
    })) || [],

    processingTimeSeconds: processingTime,
  };
}
