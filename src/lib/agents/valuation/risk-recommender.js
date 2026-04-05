import { callClaude } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a senior automotive investment analyst specializing in Japanese-to-European luxury vehicle arbitrage. You evaluate acquisition opportunities with rigorous financial discipline. Your recommendations directly influence purchasing decisions on vehicles worth €50,000-€400,000.`;

const USER_PROMPT = (data) => `Evaluate this vehicle acquisition opportunity. All financial data has been pre-calculated.

VEHICLE:
${data.make} ${data.model} ${data.year}
${data.mileageKm} km | ${data.driveSide} | ${data.exteriorColor}
Service History: ${data.serviceHistory || "Unknown"}
Auction Grade: ${data.auctionGrade || "N/A"}
Accident History: ${data.accidentHistory ? "YES" : "No"}

CONDITION (from AI photo/sheet analysis):
Exterior Score: ${data.conditionExterior}/10
Interior Score: ${data.conditionInterior}/10
Condition Notes: ${data.conditionNotes || "None"}

FINANCIALS:
Asking Price: ¥${data.askingPriceJpy?.toLocaleString()} (€${data.purchaseEur?.toLocaleString()})
Total Landed Cost: €${data.totalLandedCost?.toLocaleString()}
Estimated DE Sale Price: €${data.estimatedSalePrice?.toLocaleString()}
Gross Margin: €${data.grossMargin?.toLocaleString()} (${data.grossMarginPct}%)
Cash Outlay Required: €${data.cashOutlay?.toLocaleString()}
FX Rate: ¥${data.fxRate}/€

MARKET:
Comparable Listings: ${data.comparableCount}
Avg Days on Market: ${data.avgDaysOnMarket}
Market Liquidity: ${data.marketLiquidity}
Trend: ${data.trendDirection}

Return ONLY valid JSON:
{
  "risk_scores": {
    "condition": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."},
    "provenance": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."},
    "tuv": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."},
    "market": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."},
    "currency": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."},
    "capital": {"score": <1-5>, "level": "LOW/MEDIUM/HIGH", "reasoning": "..."}
  },
  "overall_risk_score": <float weighted avg>,
  "overall_risk_level": "LOW/MEDIUM/HIGH",
  "verdict": "BUY or REVIEW or PASS",
  "verdict_reasoning": "2-3 sentence explanation",
  "max_bid_jpy": <integer or null if PASS>,
  "max_bid_reasoning": "how calculated",
  "key_strengths": ["strength 1", "strength 2", "strength 3"],
  "key_concerns": ["concern 1", "concern 2"],
  "action_items": ["if REVIEW, what additional info needed"]
}

VERDICT RULES (STRICT):
- BUY: Margin >= €15,000 AND >= 20% AND confidence >= 0.70 AND overall risk <= 3.0 AND no HIGH individual risks
- REVIEW: Margin meets threshold but confidence < 0.70, OR risk 3.0-4.0, OR one HIGH risk, OR margin borderline
- PASS: Margin below threshold, OR confidence < 0.50, OR risk > 4.0, OR multiple HIGH risks`;

/**
 * Assess risks and generate final BUY/REVIEW/PASS recommendation.
 * @param {object} data - All prior analysis results combined
 * @returns {object|null} Risk assessment + recommendation or null
 */
export async function assessRiskAndRecommend(data) {
  const result = await callClaude({
    prompt: USER_PROMPT(data),
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  return result;
}
