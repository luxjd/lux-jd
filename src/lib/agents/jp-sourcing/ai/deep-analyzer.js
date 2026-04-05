/**
 * Deep Analyzer — performs AI-powered deep analysis on promising candidates.
 *
 * Only called for vehicles that pass initial screening (BUY or STRONG_BUY).
 * Asks Claude to reason holistically about the opportunity.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a senior Japanese-to-European luxury vehicle arbitrage analyst. You evaluate acquisition opportunities with rigorous financial discipline. Your recommendations directly influence purchasing decisions on vehicles worth €50,000-€400,000.

You understand Japanese auction grades, European TUV requirements, currency risks, and the German luxury car market deeply.`;

const ANALYSIS_PROMPT = (opp) => `Perform a deep analysis on this acquisition opportunity.

VEHICLE:
${opp.vehicle.make} ${opp.vehicle.model} ${opp.vehicle.year}
${opp.vehicle.mileageKm?.toLocaleString()} km | ${opp.vehicle.driveSide} | ${opp.vehicle.exteriorColor}
Grade: ${opp.vehicle.auctionGrade} | Service: ${opp.vehicle.serviceHistory}
Accident: ${opp.vehicle.accidentHistory ? "YES" : "No"}
Source: ${opp.source.auctionHouse} Lot ${opp.source.lotNumber}
Spec: ${opp.vehicle.specNotes || "Standard"}
Condition: ${opp.vehicle.conditionNotes || "N/A"}
Auction Sheet: ${opp.vehicle.auctionSheetNotes || "N/A"}

FINANCIALS:
JP Ask: ¥${opp.pricing.askingPriceJpy?.toLocaleString()} (€${opp.pricing.askingPriceEur?.toLocaleString()})
DE Median: €${opp.pricing.deMarketMedian?.toLocaleString()}
Landed Cost: €${opp.landedCost.totalLandedCostEur?.toLocaleString()}
Gross Margin: €${opp.margin.grossMarginEur?.toLocaleString()} (${opp.margin.grossMarginPct}%)
Risk Score: ${opp.risk.compositeScore}/3.0 (${opp.risk.compositeLevel})
Confidence: ${opp.confidence}

Return ONLY valid JSON:
{
  "deep_assessment": {
    "overall_quality": "EXCELLENT" or "GOOD" or "FAIR" or "POOR",
    "investment_thesis": "2-3 sentence thesis on why this is/isn't a good acquisition",
    "specification_analysis": "How desirable is this exact spec in Germany? Color, options, history impact.",
    "condition_concerns": ["concern 1", "concern 2"] or [],
    "tuv_assessment": "Expected TUV outcome and any preparation needed",
    "market_timing": "Is now a good time to buy this model? Seasonal/trend factors.",
    "exit_strategy": "How and where would we sell this? Which platforms? Expected timeline.",
    "comparable_recent_sales": "Any recent similar sales that validate our pricing?"
  },
  "refined_recommendation": "STRONG_BUY" or "BUY" or "REVIEW" or "PASS",
  "refined_reasoning": "1-2 paragraph detailed reasoning",
  "suggested_bid_jpy": <integer — what we should actually bid>,
  "bid_strategy": "Open with X, willing to go to Y, walk away at Z",
  "key_action_items": ["action 1 before bidding", "action 2"],
  "hold_period_estimate_days": <integer>,
  "probability_of_sale_30d": <float 0-1>,
  "probability_of_sale_60d": <float 0-1>
}`;

/**
 * Run deep AI analysis on a promising opportunity.
 * @param {object} opportunity — evaluated opportunity from evaluator
 * @returns {object|null} Deep analysis result
 */
export async function deepAnalyze(opportunity) {
  if (!isAIAvailable()) return null;
  if (!opportunity || opportunity.recommendation === "PASS") return null;

  const result = await callClaude({
    prompt: ANALYSIS_PROMPT(opportunity),
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  return result;
}

/**
 * Run deep analysis on all qualifying opportunities.
 * Only analyzes STRONG_BUY and BUY candidates to save API costs.
 */
export async function deepAnalyzeAll(opportunities) {
  const qualifying = opportunities.filter(
    (o) => o.recommendation === "STRONG_BUY" || o.recommendation === "BUY"
  );

  const results = [];
  for (const opp of qualifying) {
    try {
      const analysis = await deepAnalyze(opp);
      if (analysis) {
        results.push({ opportunityId: opp.id, ...analysis });
      }
      // Rate limit
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Deep analysis failed for ${opp.id}:`, error.message);
    }
  }

  return results;
}
