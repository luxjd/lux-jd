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
import { formatEur } from "@/lib/format";
import { analyzePhotos } from "./photo-analyzer";
import { parseAuctionSheet } from "./sheet-parser";
import { estimateMarketValue } from "./market-estimator";
import { buildMobileDeSearchUrl, buildAutoScout24SearchUrl } from "./scrapers/search-urls";
import { assessRiskAndRecommend } from "./risk-recommender";
import { fetchFxRate } from "./fx-fetcher";
import { validateInput } from "./validation";
import { db } from "@/lib/db-storage";
import { getSettings } from "@/lib/settings";

const OPEX_PER_VEHICLE = 500;

// ══════════════════════════════════════════
// MSRP DEPRECIATION SANITY CHECK
// ══════════════════════════════════════════
// When the market estimator returns a number that's implausibly low relative
// to MSRP + vehicle age + brand tier, the estimate is probably contaminated
// (web-search fallback grabbed wrong-variant snippets, base-trim aggregator
// page used as anchor, etc.). Flag so downstream forces REVIEW.

function plausibleMarketFloor(msrpEur, vehicleYear, make) {
  if (!msrpEur || msrpEur <= 0 || !vehicleYear) return null;
  const ageYears = Math.max(0, new Date().getFullYear() - vehicleYear);
  const makeLc = String(make || "").toLowerCase();

  // Brand-tier retention curves (minimum residual % of MSRP by age)
  const isExotic = /ferrari|lamborghini|mclaren|bugatti|bentley|rolls/i.test(makeLc);
  const isPerformance = /amg|bmw\s*m|rs\b|porsche|aston|maserati/i.test(makeLc);

  let retentionFloor;
  if (isExotic) {
    retentionFloor = ageYears <= 3 ? 0.75 : ageYears <= 7 ? 0.60 : 0.45;
  } else if (isPerformance) {
    retentionFloor = ageYears <= 3 ? 0.55 : ageYears <= 7 ? 0.38 : 0.22;
  } else {
    retentionFloor = ageYears <= 3 ? 0.50 : ageYears <= 7 ? 0.32 : 0.18;
  }

  return Math.round(msrpEur * retentionFloor);
}

function checkMarketPriceSanity(estimatedSalePrice, enrichment, year, make) {
  const msrp = enrichment?.original_msrp_eur;
  if (!msrp || !estimatedSalePrice) {
    return { passed: true, reason: null, floor: null };
  }
  const floor = plausibleMarketFloor(msrp, year, make);
  if (!floor) return { passed: true, reason: null, floor: null };

  if (estimatedSalePrice < floor) {
    return {
      passed: false,
      floor,
      msrp,
      reason: `Estimated sale price €${estimatedSalePrice.toLocaleString()} is below plausible floor €${floor.toLocaleString()} (${Math.round((estimatedSalePrice / msrp) * 100)}% of €${msrp.toLocaleString()} MSRP for a ${new Date().getFullYear() - year}-year-old ${make}). Likely contaminated by wrong-variant comparables.`,
    };
  }
  return { passed: true, floor, msrp, reason: null };
}

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

function calculateLandedCost(purchasePriceJpy, fxRate, estimatedValueEur, make, driveSide, hasModifications, tuvRiskFlags, fxBufferPct = 0.03) {
  const bufferedRate = fxRate * (1 - fxBufferPct);
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
    fxBufferApplied: fxBufferPct * 100,
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

function calculateMaxBid(estimatedSalePrice, fxRate, fixedCostsEur, { minMarginEur = 15000, minMarginPct = 20, fxBufferPct = 0.03 } = {}) {
  const variableCostPct = 0.04 + 0.02 + 0.10;
  const minMargin = Math.max(minMarginEur, estimatedSalePrice * (minMarginPct / 100));
  const maxPurchaseEur = estimatedSalePrice - minMargin - fixedCostsEur;

  if (maxPurchaseEur <= 0) return null;

  const maxPurchaseBeforeVariables = maxPurchaseEur / (1 + variableCostPct);
  const bufferedRate = fxRate * (1 - fxBufferPct);
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
// Enhanced: leverages multi-pass sheet data (damage severity, structural analysis, anomalies)
// ══════════════════════════════════════════

function mergeConditionData(photoResult, sheetResult, auctionGrade) {
  const photoExt = photoResult?.exterior_score;
  const photoInt = photoResult?.interior_score;
  const gradeExt = gradeToScore(auctionGrade);
  const gradeInt = gradeToScore(auctionGrade);

  // ── Exterior score: photo > damage severity > grade ──
  let exteriorScore;
  const damageSeverity = sheetResult?._damage_severity_score;
  if (photoExt && gradeExt) {
    exteriorScore = photoExt * 0.7 + gradeExt * 0.3;
    // Penalize if sheet damage analysis reveals significant damage not caught by photo
    if (damageSeverity != null && damageSeverity > 5) {
      exteriorScore = Math.min(exteriorScore, 10 - damageSeverity * 0.5);
    }
  } else {
    exteriorScore = photoExt || gradeExt || 5.0;
  }

  // ── Interior score: photo > interior grade letter > overall grade ──
  let interiorScore;
  if (photoInt && gradeInt) {
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

  // ── Mechanical notes: sheet takes precedence ──
  const mechanicalNotes = sheetResult?.mechanical_notes?.length
    ? sheetResult.mechanical_notes
    : (auctionGrade && auctionGrade >= 4.0 ? ["No mechanical issues noted on auction sheet"] : ["Mechanical condition unknown — no auction sheet"]);

  // ── Modifications: merge both sources, deduplicate ──
  const mods = new Set([
    ...(photoResult?.visible_modifications || []),
    ...(sheetResult?.modification_notes || []),
  ]);

  // ── Damage: merge photo damage + enriched sheet damage codes ──
  const visibleDamage = [
    ...(photoResult?.visible_damage || []),
    ...(sheetResult?.damage_codes?.map((d) => `${d.location}: ${d.meaning} [${d.severity}]${d.tuvRelevant ? " ⚠ TUV" : ""}`) || []),
  ];

  // ── TUV risk flags: merge photo TUV flags + sheet TUV-relevant damage ──
  const tuvRiskFlags = [...(photoResult?.tuv_risk_flags || [])];
  if (sheetResult?._tuv_relevant_damage?.length) {
    for (const d of sheetResult._tuv_relevant_damage) {
      tuvRiskFlags.push(`${d.location}: ${d.meaning} (${d.code}) — may affect TUV inspection`);
    }
  }
  if (sheetResult?._structural_concern) {
    tuvRiskFlags.push(`Structural damage concern: ${sheetResult._structural_reasoning}`);
  }
  if (sheetResult?._respray_detected) {
    tuvRiskFlags.push(`Respray detected on panels: ${sheetResult._respray_panels?.join(", ") || "unknown panels"}`);
  }

  // ── Confidence: weighted by per-field confidence when available ──
  const photoConf = photoResult?.confidence || 0;
  const sheetConf = sheetResult?.confidence || 0;
  const fieldConf = sheetResult?._field_confidence || {};
  let conditionConf;
  if (photoConf && sheetConf) {
    // Use per-field confidence from multi-pass if available
    const avgFieldConf = Object.values(fieldConf).length
      ? Object.values(fieldConf).reduce((a, b) => a + b, 0) / Object.values(fieldConf).length
      : sheetConf;
    conditionConf = (photoConf * 0.5 + avgFieldConf * 0.5);
  } else if (photoConf) {
    conditionConf = photoConf * 0.85;
  } else if (sheetConf) {
    conditionConf = sheetConf * 0.80;
  } else if (auctionGrade) {
    conditionConf = auctionGrade >= 4.5 ? 0.65 : 0.50;
  } else {
    conditionConf = 0.30;
  }

  // Merge the per-module estimation labels from sheet + photo sources,
  // and add labels for fields this merge computes (blended scores, grade
  // averages, TÜV-risk flags derived from multiple signals).
  const sheetLabels = sheetResult?._estimation_labels || {};
  const photoLabels = photoResult?._estimation_labels || {};
  const mergedLabels = {
    ...sheetLabels,
    ...photoLabels,
    // Fields computed by this merge function itself — all estimates.
    exteriorScore: "Estimated",
    interiorScore: "Estimated",
    conditionConfidence: "Estimated",
    tuvRiskFlags: "Estimated",
    visibleDamage: "Estimated",
    modifications: "Estimated",
    mechanicalNotes: sheetLabels.mechanical_notes || "Translated",
  };

  return {
    exteriorScore: Number(exteriorScore.toFixed(1)),
    interiorScore: Number(interiorScore.toFixed(1)),
    mechanicalNotes,
    modifications: Array.from(mods),
    visibleDamage,
    tuvRiskFlags,
    conditionConfidence: Number(conditionConf.toFixed(2)),
    _estimation_labels: mergedLabels,
    exteriorNotes: photoResult?.exterior_notes || (auctionGrade >= 4.5 ? ["Paint in excellent condition based on grade"] : ["Exterior assessment based on grade only"]),
    interiorNotes: photoResult?.interior_notes || ["Interior assessment based on grade only"],
    interiorOriginality: photoResult?.interior_originality || "UNKNOWN",
    driveSideObserved: photoResult?.drive_side_observed || sheetResult?.drive_side || null,
    panelConditions: sheetResult?.panel_conditions || null,
    damageCodes: sheetResult?.damage_codes || [],
    accidentContradiction: sheetResult?.accident_contradiction || null,
    serviceBookPresent: sheetResult?.service_book_present ?? null,
    serviceHistoryIndicator: sheetResult?.service_history_indicator || null,
    // New enriched fields from multi-pass analysis
    damageSeverityScore: sheetResult?._damage_severity_score ?? null,
    damageDistribution: sheetResult?._damage_distribution || null,
    structuralConcern: sheetResult?._structural_concern || false,
    structuralReasoning: sheetResult?._structural_reasoning || null,
    resprayDetected: sheetResult?._respray_detected || false,
    repairCostCategory: sheetResult?._repair_cost_category || null,
    anomalies: sheetResult?._anomalies || [],
    fieldConfidence: sheetResult?._field_confidence || null,
    extractionMode: sheetResult?._extraction_mode || null,
    passesCompleted: sheetResult?._passes_completed || null,
    auctionHouse: sheetResult?.auction_house || null,
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
    if (avgMargin != null) summary += ` Average margin was ${formatEur(avgMargin)}.`;
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

  // ─── Load app settings from DB ───
  const settings = await getSettings();
  const FX_BUFFER_PCT = settings.fxBufferPct / 100;
  const MIN_MARGIN_EUR = settings.minMarginEur;
  const MIN_MARGIN_PCT = settings.minMarginPct;

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
  const pricingGuidanceMode = validatedInput.askingPriceJpy == null;

  // In guidance mode, back-calculate a max-bid ceiling BEFORE the landed-cost breakdown,
  // using provisional fixed costs (none depend on purchase price — TUV, freight, transport, OPEX).
  // The detailed landed cost is then rendered AT that ceiling so the user sees a realistic breakdown.
  let effectiveAskingPriceJpy = validatedInput.askingPriceJpy;
  let guidanceMaxBid = null;
  if (pricingGuidanceMode) {
    const provisionalTuv = getTuvCost(validatedInput.make, validatedInput.driveSide, hasModifications, condition.tuvRiskFlags);
    const provisionalInsurance = Math.round(estimatedSalePrice * 0.7 * 0.02);
    const provisionalFixed = 400 + 175 + 2800 + provisionalInsurance + 600 + provisionalTuv.cost + 150 + 450 + 1200 + 500 + OPEX_PER_VEHICLE;
    guidanceMaxBid = calculateMaxBid(estimatedSalePrice, fxResult.rate, provisionalFixed, { minMarginEur: MIN_MARGIN_EUR, minMarginPct: MIN_MARGIN_PCT, fxBufferPct: FX_BUFFER_PCT });
    effectiveAskingPriceJpy = guidanceMaxBid || Math.round(estimatedSalePrice * 0.35 * fxResult.rate);
  }

  const landedCost = calculateLandedCost(
    effectiveAskingPriceJpy, fxResult.rate, estimatedSalePrice,
    validatedInput.make, validatedInput.driveSide, hasModifications, condition.tuvRiskFlags, FX_BUFFER_PCT
  );

  // Check max purchase price limit from settings
  const exceedsMaxPurchase = settings.maxPurchaseEur && landedCost.totalLandedCostEur > settings.maxPurchaseEur;

  // ─── Step 8: Deterministic max bid ───
  const fixedCosts = landedCost.jpTransportEur + landedCost.exportDocsEur + landedCost.freightEur +
    landedCost.portHandlingEur + landedCost.tuvEstimatedEur + landedCost.registrationEur +
    landedCost.deTransportEur + landedCost.detailingEur + landedCost.photographyEur + OPEX_PER_VEHICLE;
  const deterministicMaxBid = calculateMaxBid(estimatedSalePrice, fxResult.rate, fixedCosts, { minMarginEur: MIN_MARGIN_EUR, minMarginPct: MIN_MARGIN_PCT, fxBufferPct: FX_BUFFER_PCT });

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
      askingPriceJpy: effectiveAskingPriceJpy,
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
      // Pass threshold settings so the AI prompt uses the user's configured values
      minMarginEur: MIN_MARGIN_EUR,
      minMarginPct: MIN_MARGIN_PCT,
      maxPurchaseEur: settings.maxPurchaseEur,
      // Data-quality flags (for the AI's context; deterministic override below)
      webSearchFallback: !!marketResult?.web_search_fallback,
      webSearchFilterStats: marketResult?.web_search_filter_stats || null,
    });
  }

  // ─── Step 11b: Data-quality guardrails (force REVIEW on bad inputs) ───
  // Five triggers that downgrade any BUY verdict to REVIEW:
  //   1. Scrapers were blocked → web-search fallback fired
  //   2. MSRP sanity floor breached (estimate implausibly low for age/brand)
  //   3. Accepted comparables span multiple sub-variants (high CV)
  //   4. User's model input was generic (no variant code)
  //   5. Confidence extremely low after all caps
  // Any one of these fires → verdict forced to REVIEW so a human verifies
  // the comparables before committing capital.
  const webSearchFallback = !!marketResult?.web_search_fallback;
  const disparateVariants = !!marketResult?.disparate_variants_detected;
  const genericModel = !!marketResult?.generic_model_input;
  const msrpSanity = checkMarketPriceSanity(
    estimatedSalePrice,
    enrichment,
    validatedInput.year,
    validatedInput.make
  );
  const dataQualityWarnings = [];
  if (webSearchFallback) {
    dataQualityWarnings.push(
      `Direct scrapers (mobile.de, AutoScout24) were blocked. Market estimate is based on Google snippet parsing — fewer details available and wrong-variant risk. Confidence capped at ${Math.round((marketResult?.confidence || 0.55) * 100)}%.`
    );
  }
  if (disparateVariants && marketResult?.price_variance_warning) {
    dataQualityWarnings.push(marketResult.price_variance_warning);
  }
  if (genericModel && marketResult?.generic_model_warning) {
    dataQualityWarnings.push(marketResult.generic_model_warning);
  }
  if (!msrpSanity.passed) {
    dataQualityWarnings.push(msrpSanity.reason);
  }

  const forceReview = webSearchFallback || !msrpSanity.passed || disparateVariants || genericModel;
  if (forceReview && riskRecommendation) {
    const originalVerdict = riskRecommendation.verdict;
    if (originalVerdict === "BUY") {
      riskRecommendation.verdict = "REVIEW";
      const triggers = [];
      if (webSearchFallback) triggers.push("web-search fallback active");
      if (disparateVariants) triggers.push("comparables span disparate sub-variants");
      if (genericModel) triggers.push("model input is generic (no variant code)");
      if (!msrpSanity.passed) triggers.push("MSRP sanity floor breached");
      const reason = `Data quality issues: ${triggers.join(" + ")}. Market comparables need human verification before BUY.`;
      riskRecommendation.verdict_reasoning = `${reason} ${riskRecommendation.verdict_reasoning || ""}`.trim();
      riskRecommendation.key_concerns = [
        `Data quality override: verdict downgraded from ${originalVerdict} to REVIEW`,
        ...dataQualityWarnings,
        ...(riskRecommendation.key_concerns || []),
      ].slice(0, 6);
      riskRecommendation.action_items = [
        "Verify comparables on mobile.de / AutoScout24 directly (scrapers were blocked)",
        msrpSanity.floor ? `Confirm the DE market value is at least €${msrpSanity.floor.toLocaleString()} (MSRP-derived floor) — currently estimated at €${estimatedSalePrice.toLocaleString()}` : null,
        ...(riskRecommendation.action_items || []),
      ].filter(Boolean).slice(0, 6);
    }
  }

  // ─── Step 12: Assemble report ───
  const processingTime = Number(((Date.now() - startTime) / 1000).toFixed(1));

  return {
    valuationId: `val-${Date.now()}`,
    timestamp: new Date().toISOString(),
    aiPowered: isAIAvailable(),
    fxLive: fxResult.live,
    pricingGuidanceMode,
    suggestedMaxBidJpy: pricingGuidanceMode ? (guidanceMaxBid || deterministicMaxBid) : null,
    askingPriceJpyProvided: validatedInput.askingPriceJpy,

    // Top-level data-quality banner so the UI can flag the whole report
    // when scrapers failed or the price anchor is suspicious. The UI should
    // render a clear warning + refuse to auto-send-to-pipeline when this
    // is non-empty.
    dataQuality: {
      webSearchFallback,
      msrpSanityPassed: msrpSanity.passed,
      msrpFloorEur: msrpSanity.floor,
      disparateVariants,
      genericModel,
      priceSpreadPct: marketResult?.price_statistics?.coefficientOfVariation != null
        ? Math.round(marketResult.price_statistics.coefficientOfVariation * 100)
        : null,
      warnings: dataQualityWarnings,
      verdictForced: forceReview,
    },

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
      _estimation_labels: {
        ...(condition._estimation_labels || {}),
        // These top-level aggregates are computed from photo + sheet; not
        // literal values on the sheet.
        overallGrade: "Estimated",
        overallGradeNumeric: "Estimated",
        exteriorScore: "Estimated",
        interiorScore: "Estimated",
        photoAnalysisSummary: "Estimated",
        conditionConfidence: "Estimated",
      },
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
      // Enriched multi-pass analysis data
      damageSeverityScore: condition.damageSeverityScore,
      damageDistribution: condition.damageDistribution,
      structuralConcern: condition.structuralConcern,
      structuralReasoning: condition.structuralReasoning,
      resprayDetected: condition.resprayDetected,
      repairCostCategory: condition.repairCostCategory,
      anomalies: condition.anomalies,
      fieldConfidence: condition.fieldConfidence,
      extractionMode: condition.extractionMode,
      passesCompleted: condition.passesCompleted,
      auctionHouse: condition.auctionHouse,
    },

    marketAnalysis: {
      totalComparables: comparableCount,
      priceStatistics: marketResult?.price_statistics || { median: estimatedSalePrice, mean: estimatedSalePrice, p25, p75, min: p25, max: p75 },
      estimatedSalePrice,
      priceAdjustments: marketResult?.price_adjustments || [],
      _estimation_labels: {
        // priceStatistics comes from real scraped comparables — extracted.
        // Everything else is AI-derived from that raw data.
        estimatedSalePrice: "Estimated",
        priceAdjustments: "Estimated",
        marketLiquidity: "Estimated",
        trendDirection: "Estimated",
        avgDaysOnMarket: "Estimated",
        outliersRemoved: "Computed",
      },
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
      webSearchFallback,
      webSearchFilterStats: marketResult?.web_search_filter_stats || null,
      msrpSanityCheck: msrpSanity,
      dataQualityWarnings,
      searchUrls: marketResult?.search_urls || {
        mobile_de: buildMobileDeSearchUrl({
          make: validatedInput.make,
          model: validatedInput.model,
          yearFrom: validatedInput.year - 2,
          yearTo: validatedInput.year + 2,
          maxMileage: validatedInput.mileageKm + 30000,
        }),
        autoscout24: buildAutoScout24SearchUrl({
          make: validatedInput.make,
          model: validatedInput.model,
          yearFrom: validatedInput.year - 2,
          yearTo: validatedInput.year + 2,
          maxMileage: validatedInput.mileageKm + 30000,
        }),
      },
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
      _estimation_labels: {
        // Margin fields are all Computed (deterministic math) but the
        // INPUT `estimatedSalePrice` is Estimated — so downstream margin
        // numbers inherit that uncertainty. Labelled "Estimated" because
        // the operator should treat them as such.
        estimatedSalePrice: "Estimated",
        grossMarginEur: "Estimated",
        grossMarginPct: "Estimated",
        marginAfterOpex: "Estimated",
        pessimisticMargin: "Estimated",
        baseMargin: "Estimated",
        optimisticMargin: "Estimated",
        returnOnCapital: "Estimated",
        estimatedHoldDays: "Estimated",
        annualizedRoi: "Estimated",
        marginConfidence: "Computed",
        // `totalLandedCost` and `capitalRequired` are deterministic arithmetic
        // over known inputs (purchase price, tax rates) — treat as Computed.
        totalLandedCost: "Computed",
        capitalRequired: "Computed",
        deterministicMaxBidJpy: "Computed",
      },
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
      maxBidReasoning: riskRecommendation.max_bid_reasoning || `Deterministic calculation based on minimum ${MIN_MARGIN_PCT}% / ${formatEur(MIN_MARGIN_EUR)} margin threshold`,
      keyStrengths: riskRecommendation.key_strengths || [],
      keyConcerns: riskRecommendation.key_concerns || [],
      actionItems: riskRecommendation.action_items || [],
    } : null,

    historicalComparison: historicalComparison || null,

    reasoning: riskRecommendation?.verdict_reasoning
      ? `${riskRecommendation.verdict_reasoning} The vehicle's total landed cost of ${formatEur(landedCost.totalLandedCostEur)} against an estimated German market value of ${formatEur(estimatedSalePrice)} yields a ${grossMarginPct}% gross margin (${formatEur(grossMargin)}). Margin scenarios: pessimistic ${formatEur(pessimisticMargin)}, base ${formatEur(grossMargin)}, optimistic ${formatEur(optimisticMargin)}. Confidence in this estimate is ${(confidence * 100).toFixed(0)}% based on ${comparableCount} comparable listings, ${conditionConf >= 0.8 ? "strong" : conditionConf >= 0.5 ? "moderate" : "limited"} condition data, and ${fxResult.live ? "live" : "cached"} FX rate of ¥${fxResult.rate}/€.${fxResult.volatility?.alert ? ` ⚠ FX volatility alert: ${fxResult.volatility.alertReason}` : ""}${historicalComparison ? ` Historical context: ${historicalComparison.summary}` : ""}`
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

    // Settings used for this valuation (for transparency in report)
    settingsUsed: {
      minMarginPct: MIN_MARGIN_PCT,
      minMarginEur: MIN_MARGIN_EUR,
      fxBufferPct: FX_BUFFER_PCT * 100,
      maxPurchaseEur: settings.maxPurchaseEur,
      exceedsMaxPurchase,
    },
  };
}
