/**
 * Listing Pricing Engine — sets initial price and manages dynamic reductions.
 *
 * Initial price = DE Market Agent median + spec adjustments + condition + season
 * Dynamic reductions follow the PRD schedule (Section 6.3.2):
 *   Day 1-14:  Hold
 *   Day 15:    -3-5% if no inquiries
 *   Day 28:    -3-5% more
 *   Day 42:    Orchestrator review
 *   Day 56:    Wholesale trigger (-15%)
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a luxury vehicle pricing strategist for the German market. You set competitive but profitable listing prices based on market data, vehicle condition, specification, and seasonal demand.`;

const PRICING_PROMPT = (vehicle, tvr) => `Set the optimal initial listing price for this vehicle.

VEHICLE:
${vehicle.make} ${vehicle.model} ${vehicle.year}
${vehicle.mileageKm?.toLocaleString()} km | ${vehicle.driveSide} | ${vehicle.exteriorColor}
Condition: ${vehicle.conditionGrade || "GOOD"} | Service: ${vehicle.serviceHistory || "Unknown"}
Notable specs: ${vehicle.specNotes || "Standard"}

MARKET DATA (from DE Market Agent):
Median: €${tvr?.marketValue?.medianEur?.toLocaleString() || "N/A"}
P25: €${tvr?.marketValue?.p25Eur?.toLocaleString() || "N/A"}
P75: €${tvr?.marketValue?.p75Eur?.toLocaleString() || "N/A"}
Velocity: ${tvr?.demand?.velocityScore || "N/A"}/100
Avg Days on Market: ${tvr?.demand?.avgDaysOnMarket || "N/A"}
Trend: ${tvr?.demand?.trendDirection || "STABLE"}
Season: April (spring — good for convertibles)

OUR LANDED COST: €${vehicle.landedCostEur?.toLocaleString() || "N/A"}
MINIMUM MARGIN: €${vehicle.minimumMarginEur?.toLocaleString() || "15,000"} (20%)

Return ONLY valid JSON:
{
  "initial_price_eur": <integer — set between P60-P75 of market>,
  "pricing_strategy": "PREMIUM" or "COMPETITIVE" or "AGGRESSIVE",
  "price_justification": "2-3 sentence explanation of price positioning",
  "adjustments_applied": [
    {"factor": "<factor>", "adjustment_eur": <integer +/->, "reasoning": "<why>"}
  ],
  "floor_price_eur": <integer — absolute minimum before wholesale>,
  "wholesale_price_eur": <integer — dealer network price at -15%>,
  "reduction_schedule": [
    {"day": 15, "action": "REDUCE", "new_price_eur": <integer>, "reduction_pct": <float>},
    {"day": 28, "action": "REDUCE", "new_price_eur": <integer>, "reduction_pct": <float>},
    {"day": 42, "action": "REVIEW", "note": "Orchestrator strategic review"},
    {"day": 56, "action": "WHOLESALE", "new_price_eur": <integer>, "reduction_pct": <float>}
  ],
  "expected_days_to_sell": <integer>,
  "confidence": <float 0-1>
}`;

/**
 * Calculate initial listing price with AI-enhanced adjustments.
 */
export async function calculateListingPrice(vehicle, tvr) {
  if (!isAIAvailable()) {
    // Fallback: use TVR median with standard positioning
    const median = tvr?.marketValue?.medianEur || 100000;
    const initialPrice = Math.round(median * 1.05); // slightly above median
    return createFallbackPricing(initialPrice, vehicle.landedCostEur);
  }

  const result = await callClaude({
    prompt: PRICING_PROMPT(vehicle, tvr),
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  if (!result) {
    const median = tvr?.marketValue?.medianEur || 100000;
    return createFallbackPricing(Math.round(median * 1.05), vehicle.landedCostEur);
  }

  return {
    ...result,
    vehicleId: vehicle.id,
    tvrMedian: tvr?.marketValue?.medianEur,
    landedCost: vehicle.landedCostEur,
    expectedMargin: (result.initial_price_eur || 0) - (vehicle.landedCostEur || 0),
    calculatedAt: new Date().toISOString(),
  };
}

function createFallbackPricing(initialPrice, landedCost) {
  return {
    initial_price_eur: initialPrice,
    pricing_strategy: "COMPETITIVE",
    price_justification: "Priced at market median with standard positioning.",
    adjustments_applied: [],
    floor_price_eur: Math.round(initialPrice * 0.85),
    wholesale_price_eur: Math.round(initialPrice * 0.85),
    reduction_schedule: [
      { day: 15, action: "REDUCE", new_price_eur: Math.round(initialPrice * 0.96), reduction_pct: 4 },
      { day: 28, action: "REDUCE", new_price_eur: Math.round(initialPrice * 0.92), reduction_pct: 4 },
      { day: 42, action: "REVIEW", note: "Orchestrator strategic review" },
      { day: 56, action: "WHOLESALE", new_price_eur: Math.round(initialPrice * 0.85), reduction_pct: 15 },
    ],
    expected_days_to_sell: 30,
    confidence: 0.65,
    expectedMargin: initialPrice - (landedCost || 0),
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Check if a listing needs a price reduction based on days on market.
 */
export function checkPriceReduction(listing) {
  const daysOnMarket = listing.daysOnMarket || 0;
  const schedule = listing.pricing?.reduction_schedule || [];
  const currentPrice = listing.currentPrice || listing.pricing?.initial_price_eur;

  for (const step of schedule) {
    if (daysOnMarket >= step.day && step.action === "REDUCE" && currentPrice > step.new_price_eur) {
      return {
        shouldReduce: true,
        newPrice: step.new_price_eur,
        reductionPct: step.reduction_pct,
        reason: `Day ${daysOnMarket}: scheduled ${step.reduction_pct}% reduction per pricing policy`,
        action: step.action,
      };
    }
    if (daysOnMarket >= step.day && step.action === "WHOLESALE" && currentPrice > step.new_price_eur) {
      return {
        shouldReduce: true,
        newPrice: step.new_price_eur,
        reductionPct: step.reduction_pct,
        reason: `Day ${daysOnMarket}: wholesale trigger — offer to dealer network`,
        action: "WHOLESALE",
      };
    }
    if (daysOnMarket >= step.day && step.action === "REVIEW") {
      return {
        shouldReduce: false,
        action: "REVIEW",
        reason: `Day ${daysOnMarket}: Orchestrator strategic review required`,
      };
    }
  }

  return { shouldReduce: false, action: "HOLD", reason: "Within initial hold period" };
}
