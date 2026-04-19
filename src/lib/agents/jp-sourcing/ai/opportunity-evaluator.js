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

function calculateLandedCost(askingPriceJpy, fxRate, estimatedValueEur, make, driveSide) {
  const bufferPct = parseFloat(process.env.FX_BUFFER_PCT || "3") / 100;
  const bufferedRate = fxRate * (1 - bufferPct);
  const purchaseEur = Math.round(askingPriceJpy / bufferedRate);
  const auctionFees = Math.round(purchaseEur * 0.04);
  const jpTransport = 400;
  const exportDocs = 175;
  const freight = 2800;
  const insurance = Math.round(Math.max(purchaseEur, (estimatedValueEur || purchaseEur) * 0.7) * 0.02);
  const cifValue = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance;
  const customsDuty = Math.round(cifValue * 0.065);
  const importVat = Math.round((cifValue + customsDuty) * 0.19);
  const tuv = getTuvCost(make, driveSide);
  const portHandling = 600;
  const registration = 150;
  const deTransport = 450;
  const detailing = 1200;
  const photography = 500;
  const totalLanded = purchaseEur + auctionFees + jpTransport + exportDocs + freight + insurance + customsDuty + portHandling + tuv.cost + registration + deTransport + detailing + photography;
  const totalWithVat = totalLanded + importVat;

  return {
    purchasePriceJpy: askingPriceJpy,
    purchasePriceEur: purchaseEur,
    auctionFeesEur: auctionFees,
    freightEur: freight,
    insuranceEur: insurance,
    cifValueEur: cifValue,
    customsDutyEur: customsDuty,
    importVatEur: importVat,
    tuvEstimatedEur: tuv.cost,
    tuvComplexity: tuv.complexity,
    totalLandedCostEur: totalLanded,
    totalCashOutlayEur: totalWithVat,
    reclaimableVatEur: importVat,
    fxRateUsed: fxRate,
    fxBufferPct: bufferPct * 100,
  };
}

// ─── Risk scoring ───

function scoreRisk(vehicle, tvr, landedCost, margin) {
  const grade = vehicle.auction_grade || 3.5;
  const conditionRisk = grade >= 4.5 ? 1 : grade >= 4.0 ? 2 : 3;

  const history = vehicle.service_history;
  const provenanceRisk = history === "FULL_DEALER" ? 1 : history === "PARTIAL_DEALER" ? 2 : 3;
  const provenanceRiskFinal = vehicle.accident_history ? Math.min(provenanceRisk + 1, 3) : provenanceRisk;

  const tuvRisk = vehicle.drive_side === "LHD" ? 1 : 2;

  const velocity = tvr?.demand?.velocityScore || 50;
  const marketRisk = velocity >= 70 ? 1 : velocity >= 50 ? 2 : 3;

  const currencyRisk = 2; // Base — would use FX volatility in production

  // Weighted composite
  const composite = Number((
    conditionRisk * 0.25 +
    provenanceRiskFinal * 0.20 +
    tuvRisk * 0.20 +
    marketRisk * 0.20 +
    currencyRisk * 0.15
  ).toFixed(1));

  const level = composite <= 1.5 ? "LOW" : composite <= 2.5 ? "MEDIUM" : "HIGH";

  return {
    conditionRisk: { score: conditionRisk, level: conditionRisk <= 2 ? "LOW" : "MEDIUM" },
    provenanceRisk: { score: provenanceRiskFinal, level: provenanceRiskFinal <= 2 ? "LOW" : "MEDIUM" },
    tuvRisk: { score: tuvRisk, level: tuvRisk <= 1 ? "LOW" : "MEDIUM" },
    marketRisk: { score: marketRisk, level: marketRisk <= 2 ? "LOW" : "MEDIUM" },
    currencyRisk: { score: currencyRisk, level: "LOW" },
    compositeScore: composite,
    compositeLevel: level,
  };
}

// ─── Recommendation logic (per PRD) ───

function generateRecommendation(margin, marginPct, confidence, risk, vehicle) {
  const highRisks = Object.values(risk)
    .filter((r) => typeof r === "object" && r.score)
    .filter((r) => r.score >= 3).length;

  if (margin >= MIN_MARGIN_EUR && marginPct >= MIN_MARGIN_PCT && confidence >= 0.70 && risk.compositeScore <= 2.0 && highRisks === 0) {
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
 * @param {number} fxRate — current JPY/EUR rate
 * @returns {object} Full opportunity evaluation
 */
export function evaluateOpportunity(vehicle, tvr, fxRate) {
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

  // Calculate landed cost
  const landed = calculateLandedCost(vehicle.asking_price_jpy, fxRate, deMedian, vehicle.make, vehicle.drive_side);

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

  // Risk
  const risk = scoreRisk(vehicle, tvr, landed, grossMargin);

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
 * @param {number} fxRate
 * @returns {Array} Evaluated opportunities, sorted by risk-adjusted margin
 */
export function evaluateAllOpportunities(vehicles, tvrs, fxRate) {
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

    const evaluation = evaluateOpportunity(vehicle, tvr, fxRate);
    results.push(evaluation);
  }

  // Sort by risk-adjusted margin (best first)
  results.sort((a, b) => (b.margin?.riskAdjustedMargin || -99999) - (a.margin?.riskAdjustedMargin || -99999));

  return results;
}
