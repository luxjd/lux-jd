import { callClaude } from "@/lib/claude";
import { validateRiskOutput } from "./validation";

const SYSTEM_PROMPT = `You are a senior automotive investment analyst specializing in Japanese-to-European luxury vehicle arbitrage. You evaluate acquisition opportunities with rigorous financial discipline. Your recommendations directly influence purchasing decisions on vehicles worth €50,000-€400,000. Be conservative — a missed deal costs nothing, a bad purchase costs everything.`;

const USER_PROMPT = (data) => `Evaluate this vehicle acquisition opportunity. All financial data has been pre-calculated with real market data.

VEHICLE:
${data.make} ${data.model} ${data.year}
${data.mileageKm?.toLocaleString()} km | ${data.driveSide} | ${data.exteriorColor}
Service History: ${data.serviceHistory || "Unknown"}
Service Book Present: ${data.serviceBookPresent != null ? (data.serviceBookPresent ? "Yes" : "No") : "Unknown"}
Auction Grade: ${data.auctionGrade || "N/A"}${data.interiorGrade ? ` (Interior: ${data.interiorGrade})` : ""}
Accident History: ${data.accidentHistory ? "YES — documented" : "No"}
${data.accidentContradiction ? `⚠ ACCIDENT FLAG CONTRADICTION: ${data.accidentContradiction}` : ""}

CONDITION ASSESSMENT (from AI photo/sheet analysis):
Exterior Score: ${data.conditionExterior}/10
Interior Score: ${data.conditionInterior}/10
Interior Originality: ${data.interiorOriginality || "Unknown"}
Condition Notes: ${data.conditionNotes || "None"}
${data.tuvRiskFlags?.length ? `TUV Risk Flags: ${data.tuvRiskFlags.join("; ")}` : "No TUV risk flags detected"}
${data.visibleDamage?.length ? `Visible Damage: ${data.visibleDamage.join("; ")}` : ""}
${data.modifications?.length ? `Modifications: ${data.modifications.join("; ")}` : "No modifications"}

PANEL CONDITION (from auction sheet):
${data.panelConditions ? Object.entries(data.panelConditions).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "Not available"}

DAMAGE CODES:
${data.damageCodes?.length ? data.damageCodes.map((d) => `  ${d.location}: ${d.code} — ${d.meaning} [${d.severity}]`).join("\n") : "None found"}

FINANCIALS:
Asking Price: ¥${data.askingPriceJpy?.toLocaleString()} (€${data.purchaseEur?.toLocaleString()})
Total Landed Cost: €${data.totalLandedCost?.toLocaleString()}
Estimated DE Sale Price: €${data.estimatedSalePrice?.toLocaleString()}
Gross Margin: €${data.grossMargin?.toLocaleString()} (${data.grossMarginPct}%)
Cash Outlay Required: €${data.cashOutlay?.toLocaleString()}
FX Rate: ¥${data.fxRate}/€
${data.fxVolatilityAlert ? `⚠ FX ALERT: ${data.fxVolatilityAlertReason}` : "FX Stability: Normal"}
Deterministic Max Bid: ¥${data.deterministicMaxBid?.toLocaleString()} (pre-calculated)
${data.maxPurchaseEur ? `Max Purchase Limit: €${data.maxPurchaseEur.toLocaleString()} (company policy)` : ""}

MARGIN SCENARIOS:
Pessimistic (P25 sale): €${data.pessimisticMargin?.toLocaleString()}
Base (median sale): €${data.grossMargin?.toLocaleString()}
Optimistic (P75 sale): €${data.optimisticMargin?.toLocaleString()}

MARKET:
Comparable Listings: ${data.comparableCount}
Avg Days on Market: ${data.avgDaysOnMarket}
Market Liquidity: ${data.marketLiquidity}
Trend: ${data.trendDirection}

${data.historicalComparison ? `HISTORICAL CONTEXT:\n${data.historicalComparison}` : ""}

RISK WEIGHTING (use these weights for overall_risk_score):
- condition: 25% (condition_risk)
- market: 25% (market_risk)
- currency: 20% (currency_risk)
- provenance: 15% (provenance_risk)
- tuv: 10% (tuv_risk)
- capital: 5% (capital_risk)

Return ONLY valid JSON:
{
  "risk_scores": {
    "condition": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "2-3 sentences with specific evidence from the data above"},
    "provenance": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "based on service history, accident record, documentation"},
    "tuv": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "based on TUV flags, modifications, drive side, EU compatibility"},
    "market": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "based on comparable count, liquidity, trend direction"},
    "currency": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "based on FX volatility data and buffer applied"},
    "capital": {"score": <1-5 integer>, "level": "LOW/MEDIUM/HIGH", "reasoning": "based on cash outlay vs expected margin and hold time"}
  },
  "overall_risk_score": <float — MUST be the weighted average using weights above>,
  "overall_risk_level": "LOW/MEDIUM/HIGH",
  "verdict": "BUY" or "REVIEW" or "PASS",
  "verdict_reasoning": "2-3 sentence explanation referencing specific numbers",
  "max_bid_jpy": <integer — use the deterministicMaxBid as baseline, adjust based on your risk assessment. If PASS, use null>,
  "max_bid_reasoning": "How you arrived at this bid — reference the deterministic calculation and any adjustments",
  "key_strengths": ["strength 1 with evidence", "strength 2", "strength 3"],
  "key_concerns": ["concern 1 with evidence", "concern 2"],
  "action_items": ["specific action for REVIEW verdicts — what info would change the verdict"]
}

VERDICT RULES (STRICT — you MUST follow these thresholds set by the user):
- BUY: Gross margin >= €${data.minMarginEur?.toLocaleString() || "15,000"} AND >= ${data.minMarginPct || 20}% AND overall_risk <= 3.0 AND no HIGH individual risks AND pessimistic margin > €0${data.maxPurchaseEur ? ` AND total landed cost <= €${data.maxPurchaseEur.toLocaleString()}` : ""}
- REVIEW: Margin meets BUY threshold but one or more: overall_risk 3.0-4.0, one HIGH risk, pessimistic margin < €0, FX alert active
- PASS: Margin < €${data.minMarginEur?.toLocaleString() || "15,000"} OR < ${data.minMarginPct || 20}% OR overall_risk > 4.0 OR multiple HIGH risks OR accident history with poor condition${data.maxPurchaseEur ? ` OR total landed cost > €${data.maxPurchaseEur.toLocaleString()}` : ""}`;

/**
 * Assess risks and generate final BUY/REVIEW/PASS recommendation.
 * Receives enriched data including thresholds from app settings.
 * @param {object} data - All prior analysis results + thresholds
 * @returns {object|null} Risk assessment + recommendation
 */
export async function assessRiskAndRecommend(data) {
  const result = await callClaude({
    prompt: USER_PROMPT(data),
    system: SYSTEM_PROMPT,
    jsonMode: true,
    maxTokens: 4096,
  });

  return validateRiskOutput(result);
}
