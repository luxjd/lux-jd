/**
 * Orchestrator Decision Engine — 7-step purchase evaluation.
 *
 * THE MOST RIGOROUS DECISION FRAMEWORK IN LUXURY AUTO ARBITRAGE.
 *
 * Every step produces a PASS/FAIL/FLAG with detailed reasoning.
 * The engine NEVER shortcuts — all 7 steps execute even if step 1 fails,
 * so the decision brief shows the full picture.
 *
 * Steps (per PRD Section 7.2):
 * 1. MARGIN CHECK: >= €15K AND >= 20%
 * 2. CONFIDENCE CHECK: >= 70%
 * 3. RISK CHECK: composite <= 2.0
 * 4. PORTFOLIO FIT: brand concentration, price segment diversification
 * 5. CAPITAL CHECK: within 80% deployment limit
 * 6. TIMING CHECK: seasonal favorability
 * 7. VALUE THRESHOLD: >€80K requires human approval regardless
 *
 * Results: AUTO_APPROVE | HUMAN_REVIEW | REJECT
 */

const MIN_MARGIN_EUR = parseInt(process.env.MIN_MARGIN_EUR || "15000");
const MIN_MARGIN_PCT = parseInt(process.env.MIN_MARGIN_PCT || "20");
const MAX_BRAND_CONCENTRATION = parseInt(process.env.MAX_BRAND_CONCENTRATION_PCT || "30") / 100;
const MAX_CAPITAL_DEPLOYMENT = parseInt(process.env.MAX_CAPITAL_DEPLOYMENT_PCT || "80") / 100;
const HUMAN_REVIEW_THRESHOLD = 80000; // €80K landed cost → always human review
const MAX_SINGLE_VEHICLE_PCT = 0.25; // 25% of total capital

/**
 * Execute the full 7-step decision evaluation.
 *
 * @param {object} opportunity — from JP Sourcing Agent
 * @param {object} portfolio — current portfolio state
 * @returns {object} Complete decision with all 7 step results
 */
export function evaluateOpportunity(opportunity, portfolio) {
  const margin = opportunity.margin?.grossMarginEur || 0;
  const marginPct = opportunity.margin?.grossMarginPct || 0;
  const confidence = opportunity.confidence || 0;
  const riskScore = opportunity.risk?.compositeScore || 3;
  const riskLevel = opportunity.risk?.compositeLevel || "HIGH";
  const landedCost = opportunity.landedCost?.totalLandedCostEur || 0;
  const cashOutlay = opportunity.landedCost?.totalCashOutlayEur || landedCost;
  const make = opportunity.vehicle?.make || "";
  const driveSide = opportunity.vehicle?.driveSide || "LHD";
  const month = new Date().getMonth() + 1; // 1-12
  const vehicleName = `${make} ${opportunity.vehicle?.model || ""} ${opportunity.vehicle?.year || ""}`;

  const steps = [];
  let hasReject = false;
  let hasFlag = false;
  let flagReasons = [];

  // ─── STEP 1: MARGIN CHECK ───
  const step1Pass = margin >= MIN_MARGIN_EUR && marginPct >= MIN_MARGIN_PCT;
  steps.push({
    step: 1,
    name: "MARGIN CHECK",
    icon: "payments",
    check: `Margin >= €${MIN_MARGIN_EUR.toLocaleString()} AND >= ${MIN_MARGIN_PCT}%`,
    actual: `€${margin.toLocaleString()} (${marginPct}%)`,
    result: step1Pass ? "PASS" : "FAIL",
    critical: true,
    reasoning: step1Pass
      ? `Margin of €${margin.toLocaleString()} (${marginPct}%) exceeds both thresholds.`
      : `Margin of €${margin.toLocaleString()} (${marginPct}%) ${margin < MIN_MARGIN_EUR ? `below €${MIN_MARGIN_EUR.toLocaleString()} absolute minimum` : `below ${MIN_MARGIN_PCT}% minimum percentage`}.`,
  });
  if (!step1Pass) hasReject = true;

  // ─── STEP 2: CONFIDENCE CHECK ───
  const step2Pass = confidence >= 0.70;
  steps.push({
    step: 2,
    name: "CONFIDENCE CHECK",
    icon: "verified",
    check: "Confidence >= 70%",
    actual: `${(confidence * 100).toFixed(0)}%`,
    result: step2Pass ? "PASS" : "FLAG",
    critical: false,
    reasoning: step2Pass
      ? `Confidence at ${(confidence * 100).toFixed(0)}% — data quality sufficient for automated decision.`
      : `Confidence at ${(confidence * 100).toFixed(0)}% — below 70% threshold. Human review needed to validate data quality.`,
  });
  if (!step2Pass) { hasFlag = true; flagReasons.push("Low confidence — margin estimate may be unreliable"); }

  // ─── STEP 3: RISK CHECK ───
  const highRiskDimensions = [];
  if (opportunity.risk) {
    for (const [key, val] of Object.entries(opportunity.risk)) {
      if (val?.score >= 3 && key !== "compositeScore" && key !== "compositeLevel") {
        highRiskDimensions.push(`${key}: ${val.score}/5 (${val.level})`);
      }
    }
  }
  const step3Pass = riskScore <= 2.0 && highRiskDimensions.length === 0;
  const step3Flag = riskScore <= 3.0;
  steps.push({
    step: 3,
    name: "RISK CHECK",
    icon: "shield",
    check: "Composite risk <= 2.0, no HIGH individual risks",
    actual: `${riskScore}/3.0 (${riskLevel})${highRiskDimensions.length > 0 ? ` — ${highRiskDimensions.length} HIGH dimensions` : ""}`,
    result: step3Pass ? "PASS" : step3Flag ? "FLAG" : "FAIL",
    critical: !step3Flag,
    reasoning: step3Pass
      ? `Risk score ${riskScore}/3.0 with no high-risk dimensions — acceptable risk profile.`
      : step3Flag
      ? `Risk score ${riskScore}/3.0 — elevated. ${highRiskDimensions.length > 0 ? `High dimensions: ${highRiskDimensions.join(", ")}` : "Requires human risk assessment."}`
      : `Risk score ${riskScore}/3.0 — unacceptable. ${highRiskDimensions.join(", ")}`,
  });
  if (!step3Pass && !step3Flag) hasReject = true;
  if (!step3Pass && step3Flag) { hasFlag = true; flagReasons.push(`Elevated risk: ${riskScore}/3.0`); }

  // ─── STEP 4: PORTFOLIO FIT ───
  const currentBrandPct = portfolio.brandConcentration?.[make] || 0;
  const newBrandPct = portfolio.totalCapital > 0
    ? ((portfolio.brandCapital?.[make] || 0) + cashOutlay) / (portfolio.totalCapital + cashOutlay)
    : 0;
  const brandFit = newBrandPct <= MAX_BRAND_CONCENTRATION;

  const priceSegment = landedCost > 200000 ? "ULTRA_PREMIUM" : landedCost > 100000 ? "PREMIUM" : "STANDARD";
  const segmentCount = portfolio.segmentCounts?.[priceSegment] || 0;
  const totalVehicles = portfolio.totalVehicles || 0;
  const segmentFit = totalVehicles === 0 || (segmentCount / (totalVehicles + 1)) <= 0.5;

  const step4Pass = brandFit && segmentFit;
  steps.push({
    step: 4,
    name: "PORTFOLIO FIT",
    icon: "pie_chart",
    check: `Brand concentration <= ${MAX_BRAND_CONCENTRATION * 100}%, segment diversification <= 50%`,
    actual: `${make}: ${(newBrandPct * 100).toFixed(1)}% (was ${(currentBrandPct * 100).toFixed(1)}%) | Segment ${priceSegment}: ${segmentCount}/${totalVehicles + 1}`,
    result: step4Pass ? "PASS" : "FLAG",
    critical: false,
    reasoning: step4Pass
      ? `Adding this ${make} keeps brand concentration at ${(newBrandPct * 100).toFixed(1)}% (within ${MAX_BRAND_CONCENTRATION * 100}% limit). Segment ${priceSegment} is balanced.`
      : `${!brandFit ? `${make} concentration would reach ${(newBrandPct * 100).toFixed(1)}% — exceeds ${MAX_BRAND_CONCENTRATION * 100}% limit.` : ""} ${!segmentFit ? `${priceSegment} segment already at ${segmentCount}/${totalVehicles} — overweight.` : ""}`,
  });
  if (!step4Pass) { hasFlag = true; flagReasons.push(!brandFit ? `${make} concentration limit exceeded` : "Price segment overweight"); }

  // ─── STEP 5: CAPITAL CHECK ───
  const newDeployment = (portfolio.capitalDeployed || 0) + cashOutlay;
  const maxCapital = portfolio.totalAvailableCapital || 2000000;
  const deploymentPct = newDeployment / maxCapital;
  const step5Pass = deploymentPct <= MAX_CAPITAL_DEPLOYMENT;
  steps.push({
    step: 5,
    name: "CAPITAL CHECK",
    icon: "account_balance",
    check: `Deployment <= ${MAX_CAPITAL_DEPLOYMENT * 100}% of available capital`,
    actual: `€${newDeployment.toLocaleString()} / €${maxCapital.toLocaleString()} = ${(deploymentPct * 100).toFixed(1)}%`,
    result: step5Pass ? "PASS" : "FAIL",
    critical: true,
    reasoning: step5Pass
      ? `Adding €${cashOutlay.toLocaleString()} keeps deployment at ${(deploymentPct * 100).toFixed(1)}% — within ${MAX_CAPITAL_DEPLOYMENT * 100}% limit.`
      : `Capital deployment would reach ${(deploymentPct * 100).toFixed(1)}% — exceeds ${MAX_CAPITAL_DEPLOYMENT * 100}% safety limit. Cannot commit more capital.`,
  });
  if (!step5Pass) hasReject = true;

  // ─── STEP 6: TIMING CHECK ───
  const isConvertible = /spider|cabrio|convert|roadster|spyder/i.test(opportunity.vehicle?.model || "");
  const isGT = /gt|gran|coupe|berlinetta/i.test(opportunity.vehicle?.model || "");
  const arrivalMonth = month + 3; // ~3 months to arrive
  const arrivalSeason = arrivalMonth <= 3 || arrivalMonth >= 11 ? "WINTER" : arrivalMonth <= 5 ? "SPRING" : arrivalMonth <= 8 ? "SUMMER" : "AUTUMN";

  let timingScore = "FAVORABLE";
  let timingReason = "Good timing for this vehicle type.";

  if (isConvertible && (arrivalSeason === "WINTER" || arrivalSeason === "AUTUMN")) {
    timingScore = "UNFAVORABLE";
    timingReason = `Convertible arriving in ${arrivalSeason} — low demand season. Will sit until spring.`;
  } else if (isGT && arrivalSeason === "SUMMER") {
    timingScore = "MODERATE";
    timingReason = `GT arriving in peak summer — moderate timing. Better as autumn approaches.`;
  } else if (isConvertible && (arrivalSeason === "SPRING" || arrivalSeason === "SUMMER")) {
    timingScore = "EXCELLENT";
    timingReason = `Convertible arriving in ${arrivalSeason} — peak demand season for open-top vehicles.`;
  }

  const step6Pass = timingScore !== "UNFAVORABLE";
  steps.push({
    step: 6,
    name: "TIMING CHECK",
    icon: "calendar_month",
    check: "Favorable sale window for vehicle type",
    actual: `${isConvertible ? "Convertible" : isGT ? "GT" : "Standard"} arriving ~${arrivalSeason} → ${timingScore}`,
    result: step6Pass ? "PASS" : "FLAG",
    critical: false,
    reasoning: timingReason,
  });
  if (!step6Pass) { hasFlag = true; flagReasons.push(`Unfavorable timing: ${timingReason}`); }

  // ─── STEP 7: VALUE THRESHOLD ───
  const aboveThreshold = landedCost > HUMAN_REVIEW_THRESHOLD;
  const aboveSingleVehicleLimit = portfolio.totalAvailableCapital > 0 && cashOutlay > portfolio.totalAvailableCapital * MAX_SINGLE_VEHICLE_PCT;
  const step7NeedsHuman = aboveThreshold || aboveSingleVehicleLimit;
  steps.push({
    step: 7,
    name: "VALUE THRESHOLD",
    icon: "gavel",
    check: `Landed cost <= €${HUMAN_REVIEW_THRESHOLD.toLocaleString()} for auto-approval; <= 25% of total capital`,
    actual: `€${landedCost.toLocaleString()} ${aboveThreshold ? "> threshold" : "<= threshold"}${aboveSingleVehicleLimit ? " | > 25% capital" : ""}`,
    result: step7NeedsHuman ? "FLAG" : "PASS",
    critical: false,
    reasoning: step7NeedsHuman
      ? `${aboveThreshold ? `Landed cost €${landedCost.toLocaleString()} exceeds €${HUMAN_REVIEW_THRESHOLD.toLocaleString()} auto-approval threshold.` : ""} ${aboveSingleVehicleLimit ? "Vehicle represents >25% of total available capital." : ""} MANDATORY human approval required.`
      : `Landed cost €${landedCost.toLocaleString()} within auto-approval threshold.`,
  });
  if (step7NeedsHuman) { hasFlag = true; flagReasons.push("Above value threshold — mandatory human approval"); }

  // ─── FINAL DECISION ───
  let decision, decisionReason;

  if (hasReject) {
    decision = "REJECT";
    const failedSteps = steps.filter((s) => s.result === "FAIL");
    decisionReason = `REJECTED — failed ${failedSteps.length} critical check(s): ${failedSteps.map((s) => s.name).join(", ")}. This vehicle does not meet LuxJD acquisition criteria.`;
  } else if (hasFlag) {
    decision = "HUMAN_REVIEW";
    decisionReason = `HUMAN REVIEW REQUIRED — ${flagReasons.length} flag(s): ${flagReasons.join("; ")}. All critical checks passed but requires operator judgment.`;
  } else {
    decision = "AUTO_APPROVE";
    decisionReason = `AUTO-APPROVED — all 7 checks passed. ${vehicleName} meets all acquisition criteria. Margin €${margin.toLocaleString()} (${marginPct}%), risk ${riskScore}/3.0, confidence ${(confidence * 100).toFixed(0)}%.`;
  }

  // Max bid calculation
  const maxBidEur = opportunity.pricing?.deMarketMedian
    ? opportunity.pricing.deMarketMedian - MIN_MARGIN_EUR
    : null;
  const fxRate = opportunity.landedCost?.fxRateUsed || 183;
  const maxBidJpy = maxBidEur ? Math.round(maxBidEur * fxRate * 0.97) : null;

  return {
    decision,
    decisionReason,
    vehicleName,
    vehicleId: opportunity.id,
    steps,
    summary: {
      passCount: steps.filter((s) => s.result === "PASS").length,
      failCount: steps.filter((s) => s.result === "FAIL").length,
      flagCount: steps.filter((s) => s.result === "FLAG").length,
      totalSteps: 7,
    },
    financials: {
      margin,
      marginPct,
      landedCost,
      cashOutlay,
      maxBidEur,
      maxBidJpy,
    },
    risk: {
      compositeScore: riskScore,
      compositeLevel: riskLevel,
      highDimensions: highRiskDimensions,
    },
    portfolio: {
      newBrandConcentration: Number((newBrandPct * 100).toFixed(1)),
      newDeploymentPct: Number((deploymentPct * 100).toFixed(1)),
      priceSegment,
    },
    timing: {
      score: timingScore,
      arrivalSeason,
      vehicleType: isConvertible ? "CONVERTIBLE" : isGT ? "GT" : "STANDARD",
    },
    flagReasons,
    evaluatedAt: new Date().toISOString(),
  };
}
