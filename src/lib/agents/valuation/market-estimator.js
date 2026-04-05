import { callClaude } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a German luxury car market analyst with deep expertise in pricing Ferrari, Porsche, Mercedes-AMG, Lamborghini, Bentley, Aston Martin, Jaguar, Maserati, BMW M, and Range Rover vehicles. You have current knowledge of mobile.de and AutoScout24 pricing as of early 2026. Always provide realistic, data-backed estimates.`;

const USER_PROMPT = (input) => `Estimate the current German market value for this vehicle:

Make: ${input.make}
Model: ${input.model}
Year: ${input.year}
Mileage: ${input.mileageKm} km
Drive side: ${input.driveSide}
Exterior color: ${input.exteriorColor}
Interior color: ${input.interiorColor || "Not specified"}
Service history: ${input.serviceHistory || "Unknown"}
Accident history: ${input.accidentHistory ? "Yes" : "No"}
Auction grade: ${input.auctionGrade || "Not available"}
Specification notes: ${input.specificationNotes || "None"}

Return ONLY valid JSON with this exact structure:
{
  "estimated_sale_price_eur": <integer>,
  "price_statistics": {
    "median": <integer>,
    "mean": <integer>,
    "p25": <integer>,
    "p75": <integer>,
    "min": <integer>,
    "max": <integer>
  },
  "comparable_count": <integer estimate of how many similar listings exist in DE>,
  "price_adjustments": [
    {"factor": "Color premium", "adjustment_eur": <integer positive or negative>, "reasoning": "explanation"},
    {"factor": "Mileage adjustment", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Service history", "adjustment_eur": <integer>, "reasoning": "explanation"},
    {"factor": "Drive side", "adjustment_eur": <integer>, "reasoning": "explanation"}
  ],
  "avg_days_on_market": <integer>,
  "market_liquidity": "HIGH or MEDIUM or LOW",
  "trend_direction": "RISING or STABLE or DECLINING",
  "comparable_listings": [
    {"title": "description", "price": <integer>, "mileage": <integer>, "location": "German city", "platform": "mobile.de or AutoScout24", "days_on_market": <integer>}
  ],
  "original_msrp_eur": <integer estimate when new>,
  "engine_spec": "engine description",
  "confidence": <number 0.0-1.0>
}

Be realistic with pricing. Base estimates on actual German market conditions in early 2026. Include 5-8 plausible comparable listings.`;

/**
 * Estimate German market value using Claude's knowledge.
 * This is the v1 approach — in production, this would be augmented with
 * real scraping data from mobile.de and AutoScout24.
 *
 * @param {object} input - Vehicle details
 * @returns {object|null} Market analysis or null if AI unavailable
 */
export async function estimateMarketValue(input) {
  const result = await callClaude({
    prompt: USER_PROMPT(input),
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  return result;
}
