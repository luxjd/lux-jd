/**
 * Rule-based risk scoring (spec §3.7 + §6.5).
 *
 * Per spec §6.5:
 *   "Risk scoring should be primarily rule-based (not LLM) for determinism.
 *    Use LLM only for nuanced condition/provenance assessment."
 *
 * This module computes the 6 risk dimensions from spec §3.7 deterministically
 * from prior pipeline outputs (condition merge, market analysis, FX volatility,
 * landed cost, additional docs). The LLM-driven `risk-recommender.js` consumes
 * these scores as INPUTS and only produces:
 *   - qualitative nuance text for condition_risk and provenance_risk
 *   - the verdict bundle (verdict, max_bid, strengths, concerns, action items)
 *
 * Risk weights from spec §3.7 (overall = weighted average):
 *   condition 25%, market 25%, currency 20%, provenance 15%, tuv 10%, capital 5%
 *
 * Output shape matches the previous LLM-produced shape so it slots directly
 * into the existing report assembly without UI changes.
 */

const RISK_WEIGHTS = {
  condition: 0.25,
  market: 0.25,
  currency: 0.20,
  provenance: 0.15,
  tuv: 0.10,
  capital: 0.05,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function scoreToLevel(score) {
  if (score <= 2) return "LOW";
  if (score <= 3.5) return "MEDIUM";
  return "HIGH";
}

// ══════════════════════════════════════════
// CONDITION RISK
// Spec §3.7: "Based on auction grade, photo analysis, age vs mileage ratio"
// ══════════════════════════════════════════
function scoreCondition(data) {
  const ext = Number(data.conditionExterior ?? 5);
  const intr = Number(data.conditionInterior ?? 5);
  const avg = (ext + intr) / 2;

  let score;
  if (avg >= 8.5) score = 1;
  else if (avg >= 7.0) score = 2;
  else if (avg >= 5.5) score = 3;
  else if (avg >= 4.0) score = 4;
  else score = 5;

  const reasons = [`avg ext/int ${avg.toFixed(1)}/10 → base ${score}`];

  if (data.structuralConcern) {
    score += 1;
    reasons.push("structural concern on sheet (+1)");
  }

  if (data.damageSeverityScore != null && data.damageSeverityScore > 5) {
    score += 1;
    reasons.push(`damage severity ${data.damageSeverityScore}/10 (+1)`);
  } else if (data.damageSeverityScore != null && data.damageSeverityScore > 3) {
    score += 0.5;
    reasons.push(`damage severity ${data.damageSeverityScore}/10 (+0.5)`);
  }

  const dmgCount = Array.isArray(data.visibleDamage) ? data.visibleDamage.length : 0;
  if (dmgCount > 5) {
    score += 0.5;
    reasons.push(`${dmgCount} visible damage items (+0.5)`);
  }

  // Independent auction-grade signal — pulls score in either direction
  if (data.auctionGrade != null) {
    if (data.auctionGrade >= 5) {
      score -= 0.5;
      reasons.push(`auction grade ${data.auctionGrade} (-0.5)`);
    } else if (data.auctionGrade <= 3) {
      score += 1;
      reasons.push(`low auction grade ${data.auctionGrade} (+1)`);
    } else if (data.auctionGrade <= 3.5) {
      score += 0.5;
      reasons.push(`auction grade ${data.auctionGrade} (+0.5)`);
    }
  }

  // Age vs mileage — spec §3.7 explicitly requires this signal
  if (data.mileageKm && data.year) {
    const age = Math.max(1, new Date().getFullYear() - data.year);
    const kmPerYear = data.mileageKm / age;
    if (kmPerYear > 25000) {
      score += 0.5;
      reasons.push(`high usage ${Math.round(kmPerYear)} km/yr (+0.5)`);
    } else if (kmPerYear < 2000 && age >= 4) {
      score += 0.5;
      reasons.push(`storage queen risk: ${Math.round(kmPerYear)} km/yr over ${age}y (+0.5)`);
    }
  }

  if (data.accidentHistory) {
    score += 0.5;
    reasons.push("documented accident (+0.5)");
  }

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

// ══════════════════════════════════════════
// PROVENANCE RISK
// Spec §3.7: "Based on service_history, accident_history, documentation completeness"
// ══════════════════════════════════════════
function scoreProvenance(data) {
  let score;
  switch (data.serviceHistory) {
    case "FULL_DEALER": score = 1; break;
    case "PARTIAL_DEALER": score = 2; break;
    case "INDEPENDENT": score = 2.5; break;
    default: score = 3.5; // UNKNOWN
  }
  const reasons = [`service: ${data.serviceHistory || "UNKNOWN"} → base ${score}`];

  if (data.serviceBookPresent === true) {
    score -= 0.5;
    reasons.push("service book present (-0.5)");
  } else if (data.serviceBookPresent === false) {
    score += 0.5;
    reasons.push("service book NOT present (+0.5)");
  }

  if (data.accidentHistory) {
    score += 1;
    reasons.push("accident history (+1)");
  }

  if (data.accidentContradiction) {
    score += 1;
    reasons.push("accident flag contradicts damage codes — possible undisclosed repair (+1)");
  }

  // Additional documents (spec §2.1) lift provenance confidence
  const ad = data.additionalDocs;
  if (ad?.provenanceConfidence != null && ad.provenanceConfidence > 0.7) {
    score -= 0.5;
    reasons.push(`docs verify provenance (conf ${(ad.provenanceConfidence * 100).toFixed(0)}%, -0.5)`);
  }
  if (Array.isArray(ad?.documentTypes) && ad.documentTypes.length >= 2) {
    score -= 0.5;
    reasons.push(`${ad.documentTypes.length} document types verified (-0.5)`);
  }
  if (ad?.euTypeApproval === true) {
    score -= 0.5;
    reasons.push("EU type approval confirmed (-0.5)");
  }

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

// ══════════════════════════════════════════
// TUV RISK
// Spec §3.7: "Based on EU-spec vs JP-only, modifications detected, drive side"
// ══════════════════════════════════════════
function scoreTuv(data) {
  // Base off the existing getTuvCost() complexity classification
  // (LOW = EU-spec LHD, no mods; HIGH/VERY_HIGH = non-EU + RHD + mods/flags)
  const baseFromComplexity = { LOW: 1, MEDIUM: 2, HIGH: 4, VERY_HIGH: 5 };
  let score = baseFromComplexity[data.tuvComplexity] ?? 3;
  const reasons = [`TUV complexity: ${data.tuvComplexity || "MEDIUM"} → base ${score}`];

  const flagCount = Array.isArray(data.tuvRiskFlags) ? data.tuvRiskFlags.length : 0;
  if (flagCount > 0) {
    const add = Math.min(2, flagCount * 0.5);
    score += add;
    reasons.push(`${flagCount} TUV risk flag(s) (+${add})`);
  }

  if (data.structuralConcern) {
    score += 1;
    reasons.push("structural concern (+1)");
  }
  if (data.resprayDetected) {
    score += 0.5;
    reasons.push("respray detected (+0.5)");
  }

  const modCount = Array.isArray(data.modifications) ? data.modifications.length : 0;
  if (modCount > 0) {
    const add = Math.min(1, modCount * 0.5);
    score += add;
    reasons.push(`${modCount} modification(s) (+${add})`);
  }

  if (data.driveSide === "RHD") {
    score += 0.5;
    reasons.push("RHD vehicle (+0.5)");
  }

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

// ══════════════════════════════════════════
// MARKET RISK
// Spec §3.7: "Based on market_liquidity, trend_direction, comparable count"
// ══════════════════════════════════════════
function scoreMarket(data) {
  let score;
  switch (data.marketLiquidity) {
    case "HIGH": score = 1; break;
    case "MEDIUM": score = 2; break;
    case "LOW": score = 3; break;
    default: score = 2.5;
  }
  const reasons = [`liquidity: ${data.marketLiquidity || "MEDIUM"} → base ${score}`];

  switch (data.trendDirection) {
    case "RISING":
      score -= 0.5;
      reasons.push("rising trend (-0.5)");
      break;
    case "DECLINING":
      score += 1;
      reasons.push("declining trend (+1)");
      break;
  }

  const cc = Number(data.comparableCount ?? 0);
  if (cc < 5) {
    score += 1;
    reasons.push(`only ${cc} comparables (+1)`);
  } else if (cc < 10) {
    score += 0.5;
    reasons.push(`${cc} comparables (+0.5)`);
  } else if (cc >= 15) {
    score -= 0.5;
    reasons.push(`${cc} comparables (-0.5)`);
  }

  if (data.webSearchFallback) {
    score += 1;
    reasons.push("web-search fallback active (+1)");
  }
  if (data.disparateVariants) {
    score += 1;
    reasons.push("comparables span disparate sub-variants (+1)");
  }
  if (data.genericModel) {
    score += 0.5;
    reasons.push("generic model input (+0.5)");
  }

  // Floor: web-search fallback enforces market_risk ≥ MEDIUM (3)
  // (consistent with the prior LLM-prompt instruction)
  if (data.webSearchFallback) score = Math.max(score, 3);

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

// ══════════════════════════════════════════
// CURRENCY RISK
// Spec §3.7: "Based on FX volatility (30-day std dev of JPY/EUR)"
// ══════════════════════════════════════════
function scoreCurrency(data) {
  const v = data.fxVolatility?.volatilityScore;
  let score;
  let baseReason;

  if (v == null) {
    score = 3;
    baseReason = "no volatility data → MEDIUM default";
  } else if (v <= 0.1) {
    score = 1;
    baseReason = `stable FX (vol ${v.toFixed(2)})`;
  } else if (v <= 0.3) {
    score = 2;
    baseReason = `low FX volatility (${v.toFixed(2)})`;
  } else if (v <= 0.5) {
    score = 3;
    baseReason = `moderate FX volatility (${v.toFixed(2)})`;
  } else if (v <= 0.7) {
    score = 4;
    baseReason = `elevated FX volatility (${v.toFixed(2)})`;
  } else {
    score = 5;
    baseReason = `high FX volatility (${v.toFixed(2)})`;
  }

  const reasons = [baseReason];

  if (data.fxVolatility?.alert) {
    score += 0.5;
    reasons.push(`alert: ${data.fxVolatility.alertReason || "deviation"} (+0.5)`);
  }

  // FX buffer mitigates currency risk
  const buffer = Number(data.fxBufferPct ?? 3);
  if (buffer >= 5) {
    score -= 0.5;
    reasons.push(`FX buffer ${buffer}% applied (-0.5)`);
  }

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

// ══════════════════════════════════════════
// CAPITAL RISK
// Spec §3.7: "Based on capital_required relative to expected margin"
// ══════════════════════════════════════════
function scoreCapital(data) {
  if (data.exceedsMaxPurchase) {
    return {
      score: 5,
      level: "HIGH",
      reasoning: "Total landed cost exceeds max-purchase policy → forced HIGH",
    };
  }

  const cashOutlay = Number(data.cashOutlay) || 0;
  const grossMargin = Number(data.grossMargin) || 0;
  const roi = cashOutlay > 0 ? (grossMargin / cashOutlay) * 100 : 0;

  let score;
  if (roi >= 30) score = 1;
  else if (roi >= 20) score = 2;
  else if (roi >= 15) score = 3;
  else if (roi >= 10) score = 4;
  else score = 5;

  const reasons = [`ROI ${roi.toFixed(1)}% on €${Math.round(cashOutlay).toLocaleString()} → base ${score}`];

  const holdDays = Number(data.holdDays) || 0;
  if (holdDays > 180) {
    score += 0.5;
    reasons.push(`long hold ${holdDays}d (+0.5)`);
  }
  if (cashOutlay > 200000) {
    score += 0.5;
    reasons.push("large outlay (+0.5)");
  }
  if (cashOutlay > 400000) {
    score += 0.5;
    reasons.push("very large capital exposure (+0.5)");
  }

  score = clamp(Math.round(score), 1, 5);
  return { score, level: scoreToLevel(score), reasoning: reasons.join("; ") };
}

/**
 * Score all 6 risk dimensions deterministically from rules.
 * Output shape matches the previous LLM-produced result so it slots
 * directly into the existing report assembly.
 */
export function scoreRisksDeterministic(data) {
  const condition = scoreCondition(data);
  const provenance = scoreProvenance(data);
  const tuv = scoreTuv(data);
  const market = scoreMarket(data);
  const currency = scoreCurrency(data);
  const capital = scoreCapital(data);

  const overall =
    condition.score * RISK_WEIGHTS.condition +
    market.score * RISK_WEIGHTS.market +
    currency.score * RISK_WEIGHTS.currency +
    provenance.score * RISK_WEIGHTS.provenance +
    tuv.score * RISK_WEIGHTS.tuv +
    capital.score * RISK_WEIGHTS.capital;

  const overallRounded = Number(overall.toFixed(2));

  return {
    risk_scores: { condition, provenance, tuv, market, currency, capital },
    overall_risk_score: overallRounded,
    overall_risk_level: scoreToLevel(overallRounded),
    _rule_based: true,
  };
}

export { RISK_WEIGHTS };
