/**
 * Opportunity Evaluator — runs each auction candidate through the Valuation Engine.
 *
 * For each vehicle discovered by the auction scanner:
 * 1. Pulls the matching TVR from DE Market Agent
 * 2. Calculates full landed cost
 * 3. Computes margin against DE market value
 * 4. Assesses risk across 5 dimensions
 * 5. Generates BUY/REVIEW/PASS recommendation
 *
 * Reuses components from the Valuation Agent (no code duplication).
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatEur } from "@/lib/format";
import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";

const MIN_MARGIN_EUR = parseInt(process.env.MIN_MARGIN_EUR || "15000");
const MIN_MARGIN_PCT = parseInt(process.env.MIN_MARGIN_PCT || "20");

// ─── TVR matching ───

function normalizeMake(s) {
  return (s || "")
    .toLowerCase()
    .replace(/mercedes[-\s]?(?:amg|benz)/g, "mercedes")
    .replace(/bmw[-\s]?m\b/g, "bmw")
    .replace(/land\s*rover|range\s*rover/g, "landrover")
    .replace(/[-\s]+/g, "");
}

function normalizeModel(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/berlinetta|coupe|convertible|cabriolet|spider|spyder|roadster/g, "")
    .replace(/[\s\-().]+/g, "");
}

/**
 * Find the Target Vehicle Report for a given auction vehicle.
 * Primary path: exact link via `tvr_model_id` stamped by the scanner.
 * Fallback: normalized AND-of-make-and-model fuzzy match (both sides must match).
 */
export function findMatchingTvr(vehicle, tvrs) {
  if (!vehicle || !Array.isArray(tvrs) || tvrs.length === 0) return null;

  const tvrId = vehicle.tvr_model_id || vehicle.tvrModelId;
  if (tvrId) {
    const byId = tvrs.find((t) => t.modelId === tvrId);
    if (byId) return byId;
  }

  const vMake = normalizeMake(vehicle.make);
  const vModel = normalizeModel(vehicle.model);
  if (!vMake || !vModel) return null;

  return tvrs.find((t) => {
    const tvrMake = normalizeMake(t.vehicleSpec?.make);
    const tvrModel = normalizeModel(t.vehicleSpec?.model);
    if (!tvrMake || !tvrModel) return false;
    const makeMatches = vMake.includes(tvrMake) || tvrMake.includes(vMake);
    const modelMatches = vModel.includes(tvrModel) || tvrModel.includes(vModel);
    return makeMatches && modelMatches;
  }) || null;
}

// ─── Landed cost calculation (reused from Valuation Engine) ───

function getTuvCost(make, driveSide) {
  const euBrands = ["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "BMW M", "Maserati", "BMW"];
  const isEuSpec = euBrands.some((b) => make.includes(b) || make.startsWith(b));
  if (isEuSpec && driveSide === "LHD") return { cost: 400, complexity: "LOW" };
  if (isEuSpec) return { cost: 800, complexity: "MEDIUM" };
  return { cost: 1500, complexity: "HIGH" };
}

// Docx §6.2.3: "pre-sale preparation costs based on condition grade".
// A pristine grade-5+ car needs a light detail; a grade-3 car needs significant
// reconditioning + re-shoot. Photography scales too — higher-grade cars photograph
// well on one session; lower-grade needs touch-ups and re-shoots.
function gradePrepMultiplier(grade) {
  if (grade == null) return 1.2; // small uncertainty premium when grade unknown
  if (grade >= 5.0) return 0.8;
  if (grade >= 4.5) return 1.0;
  if (grade >= 4.0) return 1.3;
  if (grade >= 3.5) return 1.7;
  return 2.2;
}

function calculateLandedCost(askingPriceJpy, fxRate, estimatedValueEur, make, driveSide, auctionGrade) {
  const bufferPct = parseFloat(process.env.FX_BUFFER_PCT || "3") / 100;
  const bufferedRate = fxRate * (1 - bufferPct);
  const purchaseEur = Math.round(askingPriceJpy / bufferedRate);
  const auctionFees = Math.round(purchaseEur * 0.04);
  const jpTransport = 400;
  const exportDocs = 175;
  const freight = 2800;
  const insurance = Math.round(Math.max(purchaseEur, (estimatedValueEur || purchaseEur) * 0.7) * 0.02);
  const cifValue = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance;
  // Spec §3.1 / §4.3: EU customs duty on passenger vehicle imports = 10% of CIF.
  // Matches Logistics customs-engine.js to prevent duty drift between landed-cost
  // estimate at bid time and actual customs declaration at port.
  const customsDuty = Math.round(cifValue * 0.10);
  const importVat = Math.round((cifValue + customsDuty) * 0.19);
  const tuv = getTuvCost(make, driveSide);
  const portHandling = 600;
  const registration = 150;
  const deTransport = 450;
  // Grade-scaled pre-sale prep (docx §6.2.3)
  const prepMultiplier = gradePrepMultiplier(auctionGrade);
  const detailing = Math.round(1200 * prepMultiplier);
  const photography = Math.round(500 * prepMultiplier);
  const totalLanded = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance + customsDuty + portHandling + tuv.cost + registration + deTransport + detailing + photography;
  const totalWithVat = totalLanded + importVat;

  return {
    purchasePriceJpy: askingPriceJpy,
    purchasePriceEur: purchaseEur,
    auctionFeesEur: auctionFees,
    jpTransportEur: jpTransport,
    exportDocsEur: exportDocs,
    freightEur: freight,
    insuranceEur: insurance,
    cifValueEur: cifValue,
    customsDutyEur: customsDuty,
    importVatEur: importVat,
    tuvEstimatedEur: tuv.cost,
    tuvComplexity: tuv.complexity,
    portHandlingEur: portHandling,
    registrationEur: registration,
    deTransportEur: deTransport,
    detailingEur: detailing,
    photographyEur: photography,
    prepMultiplier,
    totalLandedCostEur: totalLanded,
    totalCashOutlayEur: totalWithVat,
    reclaimableVatEur: importVat,
    fxRateUsed: fxRate,
    fxBufferPct: bufferPct * 100,
  };
}

// ─── Risk scoring (docx §6.2.4 5-dimension matrix) ───

// Per-dimension level label. Fixed from previous impl which mapped score 3 → "MEDIUM"
// (bug: a grade-<4 vehicle should be HIGH condition risk per the matrix).
function dimLevel(score) {
  if (score <= 1) return "LOW";
  if (score <= 2) return "MEDIUM";
  return "HIGH";
}

function scoreRisk(vehicle, tvr, landedCost, margin, fxVolatility) {
  // ── Condition (docx: Grade 4.5+ / 4.0-4.5 / <4.0) ──
  const grade = vehicle.auction_grade || 3.5;
  const conditionRisk = grade >= 4.5 ? 1 : grade >= 4.0 ? 2 : 3;

  // ── Provenance (docx: Full+matching / Partial / Gaps) ──
  const history = vehicle.service_history;
  const provenanceBase = history === "FULL_DEALER" ? 1 : history === "PARTIAL_DEALER" ? 2 : 3;
  const provenanceRiskFinal = vehicle.accident_history ? Math.min(provenanceBase + 1, 3) : provenanceBase;

  // ── TÜV (docx: EU-spec+LHD+no mods / minor mods clear / significant mods uncertain) ──
  // Mods are populated by photo analyzer + sheet parser during the enrichment steps,
  // so on the FIRST pass this is just drive-side + EU-spec. After enrichment the
  // scan-engine re-runs scoreRisk with the full mod/damage/tuv-flag data.
  const euBrands = ["Ferrari", "Mercedes-AMG", "Mercedes-Benz", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "BMW M", "BMW", "Maserati"];
  const isEuSpec = euBrands.some((b) => vehicle.make?.includes(b) || b.includes(vehicle.make || ""));
  let tuvRisk = isEuSpec && vehicle.drive_side === "LHD" ? 1 : 2;

  const modCount = Array.isArray(vehicle.modifications) ? vehicle.modifications.length : 0;
  const damageCount = Array.isArray(vehicle.visible_damage) ? vehicle.visible_damage.length : 0;
  const tuvFlagCount = Array.isArray(vehicle.tuv_risk_flags) ? vehicle.tuv_risk_flags.length : 0;
  const hasRespray = !!vehicle.respray_detected;

  if (modCount >= 3 || tuvFlagCount >= 2 || damageCount >= 4) {
    tuvRisk = 3; // significant mods / multiple flags → HIGH
  } else if (modCount > 0 || tuvFlagCount > 0 || hasRespray || damageCount >= 2) {
    tuvRisk = Math.max(tuvRisk, 2); // minor mods / single flag → at least MEDIUM
  }
  tuvRisk = Math.min(tuvRisk, 3);

  // ── Market liquidity (docx: <21 days / 21-45 / >45 days) ──
  // Uses the TVR's days-on-market signal directly. Falls back to velocity score
  // only when days-on-market is unavailable (older TVRs).
  const avgDays = tvr?.demand?.avgDaysOnMarket;
  let marketRisk;
  let marketRiskSource;
  if (typeof avgDays === "number" && avgDays > 0) {
    marketRisk = avgDays < 21 ? 1 : avgDays <= 45 ? 2 : 3;
    marketRiskSource = "avg_days_on_market";
  } else {
    const velocity = tvr?.demand?.velocityScore || 50;
    marketRisk = velocity >= 70 ? 1 : velocity >= 50 ? 2 : 3;
    marketRiskSource = "velocity_score_fallback";
  }

  // ── Currency exposure (docx: within 2% of 90-day avg / 2-5% / >5%) ──
  // Primary signal: deviation of current rate from 90-day moving average.
  // Falls back to 30-day deviation when 90-day isn't yet populated.
  let currencyRisk = 2;
  let currencyRiskSource = "default_medium";
  let currencyDeviation = null;
  if (fxVolatility?.deviationFromMa90d != null) {
    const absDev = Math.abs(fxVolatility.deviationFromMa90d);
    currencyRisk = absDev <= 2 ? 1 : absDev <= 5 ? 2 : 3;
    currencyRiskSource = "fx_ma90d_deviation";
    currencyDeviation = Number(fxVolatility.deviationFromMa90d.toFixed(2));
  } else if (fxVolatility?.deviationFromMa30d != null) {
    const absDev = Math.abs(fxVolatility.deviationFromMa30d);
    currencyRisk = absDev <= 2 ? 1 : absDev <= 5 ? 2 : 3;
    currencyRiskSource = "fx_ma30d_deviation_fallback";
    currencyDeviation = Number(fxVolatility.deviationFromMa30d.toFixed(2));
  }

  // ── Weighted composite (unchanged weights) ──
  const composite = Number((
    conditionRisk * 0.25 +
    provenanceRiskFinal * 0.20 +
    tuvRisk * 0.20 +
    marketRisk * 0.20 +
    currencyRisk * 0.15
  ).toFixed(1));

  const level = composite <= 1.5 ? "LOW" : composite <= 2.5 ? "MEDIUM" : "HIGH";

  return {
    conditionRisk: { score: conditionRisk, level: dimLevel(conditionRisk), grade },
    provenanceRisk: { score: provenanceRiskFinal, level: dimLevel(provenanceRiskFinal), serviceHistory: history || "UNKNOWN" },
    tuvRisk: {
      score: tuvRisk,
      level: dimLevel(tuvRisk),
      modCount,
      damageCount,
      tuvFlagCount,
      resprayDetected: hasRespray,
      isEuSpec,
    },
    marketRisk: {
      score: marketRisk,
      level: dimLevel(marketRisk),
      avgDaysOnMarket: avgDays ?? null,
      source: marketRiskSource,
    },
    currencyRisk: {
      score: currencyRisk,
      level: dimLevel(currencyRisk),
      deviationPct: currencyDeviation,
      source: currencyRiskSource,
    },
    compositeScore: composite,
    compositeLevel: level,
  };
}

// ─── Recommendation logic (per PRD) ───

function generateRecommendation(margin, marginPct, confidence, risk, vehicle) {
  // Per spec: HIGH risk = score >= 4 (not 3). Score 3 is MEDIUM.
  const highRisks = Object.values(risk)
    .filter((r) => typeof r === "object" && r.score)
    .filter((r) => r.score >= 4).length;

  // Per spec: BUY when margin >= €15k AND >= 20% AND confidence >= 0.70
  // AND composite risk <= 3.0 AND no HIGH (>=4) individual risks
  if (margin >= MIN_MARGIN_EUR && marginPct >= MIN_MARGIN_PCT && confidence >= 0.70 && risk.compositeScore <= 3.0 && highRisks === 0) {
    return margin >= MIN_MARGIN_EUR * 2 ? "STRONG_BUY" : "BUY";
  }

  if (margin >= MIN_MARGIN_EUR * 0.8 && marginPct >= 15) {
    return "REVIEW";
  }

  return "PASS";
}

/**
 * Evaluate a single auction vehicle against its matching TVR.
 * @param {object} vehicle — from auction scanner
 * @param {object} tvr — matching Target Vehicle Report from DE Market Agent
 * @param {object|number} fxDataOrRate — full FX object {rate, volatility, live,...} or plain rate
 * @returns {object} Full opportunity evaluation
 */
export function evaluateOpportunity(vehicle, tvr, fxDataOrRate) {
  // Accept either the full fx object (preferred — lets us compute currency_risk
  // from 90-day deviation) or a plain rate number (backward compat).
  const fxData = fxDataOrRate && typeof fxDataOrRate === "object" ? fxDataOrRate : null;
  const fxRate = fxData ? fxData.rate : fxDataOrRate;
  const fxVolatility = fxData?.volatility || null;

  const rawMedian = tvr?.marketValue?.medianEur || 100000;
  const rawP25 = tvr?.marketValue?.p25Eur || Math.round(rawMedian * 0.90);
  const rawP75 = tvr?.marketValue?.p75Eur || Math.round(rawMedian * 1.12);

  // RHD penalty: right-hand drive vehicles sell at ~15% discount in Germany
  const isRHD = vehicle.drive_side === "RHD";
  const rhdDiscount = isRHD ? 0.85 : 1.0;
  const deMedian = Math.round(rawMedian * rhdDiscount);
  const deP25 = Math.round(rawP25 * rhdDiscount);
  const deP75 = Math.round(rawP75 * rhdDiscount);
  const maxLanded = tvr?.financialThresholds?.recommendedMaxLandedCostEur
    ? Math.round(tvr.financialThresholds.recommendedMaxLandedCostEur * rhdDiscount)
    : Math.round(deMedian * 0.75);

  // Calculate landed cost (now grade-scaled for detailing + photography)
  const landed = calculateLandedCost(
    vehicle.asking_price_jpy,
    fxRate,
    deMedian,
    vehicle.make,
    vehicle.drive_side,
    vehicle.auction_grade
  );

  // Margin
  const grossMargin = deMedian - landed.totalLandedCostEur;
  const grossMarginPct = deMedian > 0 ? Number(((grossMargin / deMedian) * 100).toFixed(1)) : 0;
  const spreadPct = vehicle.asking_price_eur > 0 ? Number((((deMedian - vehicle.asking_price_eur) / vehicle.asking_price_eur) * 100).toFixed(1)) : 0;

  // Confidence
  const sampleSize = tvr?.marketValue?.sampleSize || tvr?.sampleSize || 10;
  const marketConf = sampleSize > 20 ? 0.92 : sampleSize > 10 ? 0.82 : 0.65;
  const conditionConf = vehicle.auction_grade >= 4.5 ? 0.93 : vehicle.auction_grade >= 4.0 ? 0.82 : 0.65;
  const fxConf = vehicle.fx_live ? 0.90 : 0.70;
  const confidence = Number(Math.pow(marketConf * conditionConf * fxConf, 1 / 3).toFixed(2));

  // Risk (now with real currency risk + mods-aware TUV + days-on-market liquidity)
  const risk = scoreRisk(vehicle, tvr, landed, grossMargin, fxVolatility);

  // Recommendation
  const recommendation = generateRecommendation(grossMargin, grossMarginPct, confidence, risk, vehicle);

  // Max bid
  const maxBidEur = deMedian - MIN_MARGIN_EUR;
  const bufferedRate = fxRate * (1 - 0.03);
  const maxBidJpy = Math.round(maxBidEur * bufferedRate);

  // Risk-adjusted margin (for ranking)
  const riskAdjustedMargin = Math.round(grossMargin * confidence * (1 - (risk.compositeScore - 1) * 0.15));

  return {
    id: vehicle.id,
    tvrModelId: vehicle.tvr_model_id || null,
    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      mileageKm: vehicle.mileage_km,
      driveSide: vehicle.drive_side,
      driveSideAssumed: Boolean(vehicle.drive_side_assumed),
      auctionGrade: vehicle.auction_grade,
      exteriorColor: vehicle.exterior_color,
      interiorColor: vehicle.interior_color,
      transmission: vehicle.transmission,
      engineSpec: vehicle.engine_spec,
      serviceHistory: vehicle.service_history,
      accidentHistory: vehicle.accident_history,
      specNotes: vehicle.specification_notes,
      conditionNotes: vehicle.condition_notes,
      auctionSheetNotes: vehicle.auction_sheet_notes,
      photoSummary: vehicle.photo_summary,
      photoUrls: Array.isArray(vehicle.photo_urls) ? vehicle.photo_urls : [],
    },
    source: {
      auctionHouse: vehicle.auction_source,
      lotNumber: vehicle.lot_number,
      auctionDate: vehicle.auction_date || null,
    },
    pricing: {
      askingPriceJpy: vehicle.asking_price_jpy,
      askingPriceEur: vehicle.asking_price_eur || landed.purchasePriceEur,
      deMarketMedianRaw: rawMedian,
      deMarketMedian: deMedian,
      deMarketP25: deP25,
      deMarketP75: deP75,
      maxRecommendedLanded: maxLanded,
      rhdPenaltyApplied: isRHD,
      rhdDiscountPct: isRHD ? 15 : 0,
    },
    landedCost: landed,
    margin: {
      grossMarginEur: grossMargin,
      grossMarginPct,
      spreadPct,
      pessimisticMargin: deP25 - landed.totalLandedCostEur,
      optimisticMargin: deP75 - landed.totalLandedCostEur,
      riskAdjustedMargin,
      meetsMinThreshold: grossMargin >= MIN_MARGIN_EUR && grossMarginPct >= MIN_MARGIN_PCT,
      withinMaxLanded: landed.totalLandedCostEur <= maxLanded,
    },
    confidence,
    risk,
    recommendation,
    maxBidJpy,
    maxBidReasoning: `Median DE value ${formatEur(deMedian)} - min margin ${formatEur(MIN_MARGIN_EUR)} = max landed ${formatEur(maxBidEur)}, converted at buffered FX ¥${bufferedRate.toFixed(2)}/€`,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluate ALL discovered vehicles against their matching TVRs.
 * @param {Array} vehicles — from auction scanner
 * @param {Array} tvrs — from DE Market Agent
 * @param {object|number} fxDataOrRate — full FX object (preferred) or rate number
 * @returns {Array} Evaluated opportunities, sorted by risk-adjusted margin
 */
export function evaluateAllOpportunities(vehicles, tvrs, fxDataOrRate) {
  const results = [];

  for (const vehicle of vehicles) {
    const tvr = findMatchingTvr(vehicle, tvrs);

    if (!tvr) {
      // No matching TVR — skip or evaluate with defaults
      results.push({
        id: vehicle.id,
        vehicle: { make: vehicle.make, model: vehicle.model, year: vehicle.year },
        recommendation: "PASS",
        passReason: "No matching Target Vehicle Report from DE Market Agent",
        evaluatedAt: new Date().toISOString(),
      });
      continue;
    }

    const evaluation = evaluateOpportunity(vehicle, tvr, fxDataOrRate);
    results.push(evaluation);
  }

  // Sort by risk-adjusted margin (best first)
  results.sort((a, b) => (b.margin?.riskAdjustedMargin || -99999) - (a.margin?.riskAdjustedMargin || -99999));

  return results;
}
