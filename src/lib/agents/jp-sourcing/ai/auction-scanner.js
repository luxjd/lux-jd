/**
 * JP Auction Scanner — discovers vehicles at Japanese auctions.
 *
 * Reads Target Vehicle Reports from DE Market Agent to know WHAT to look for,
 * then asks Claude to simulate Japanese auction inventory matching those targets.
 *
 * In production v2, this would integrate with:
 * - USS API (broker partner)
 * - BH Auction API
 * - Goo-net.com scraper
 * - carsensor.net scraper
 *
 * v1 uses Claude to generate realistic auction candidates based on
 * actual Japanese market conditions and pricing.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { fetchFxRate } from "@/lib/agents/valuation/fx-fetcher";

const SYSTEM_PROMPT = `You are a Japanese luxury vehicle auction specialist with deep knowledge of USS (Used Car System Solutions), BH Auction, TAA, Arai Auction, and dealer platforms like Goo-net.com.

You have real-time access to current Japanese auction inventory. You know:
- Typical Japanese auction grades (1.0-6.0, S=6.5)
- Japanese color naming conventions
- Realistic JPY pricing for luxury vehicles in Japan
- Which auction houses specialize in which brands
- Typical mileage ranges for Japanese-market luxury vehicles
- LHD vs RHD availability patterns
- Seasonal auction volume patterns

CRITICAL RULES:
- Prices MUST be in JPY
- Be REALISTIC with pricing — Japanese prices are 25-40% below European
- Auction grades must be realistic (most luxury vehicles are 3.5-4.5)
- Generate a MIX of good opportunities and marginal ones (not all winners)
- Include some RHD vehicles (they're more common in Japan)
- Mileage should reflect Japanese driving patterns (5,000-15,000 km/year)
- Include real auction house names and lot number formats`;

const SCAN_PROMPT = (tvrs, fxRate) => `Based on current demand signals from the German market, scan Japanese auctions for matching vehicles.

CURRENT FX RATE: ¥${fxRate}/€

TARGET VEHICLES (from DE Market Agent intelligence):
${tvrs.map((t) => `- ${t.vehicleSpec?.make} ${t.vehicleSpec?.model} (${t.vehicleSpec?.yearRange?.[0]}-${t.vehicleSpec?.yearRange?.[1]}): DE median €${t.marketValue?.medianEur?.toLocaleString()}, max landed €${t.financialThresholds?.recommendedMaxLandedCostEur?.toLocaleString()}, velocity ${t.demand?.velocityScore}/100`).join("\n")}

Scan USS Tokyo, USS Nagoya, USS Kobe, BH Auction, Arai Auction, and Goo-net for vehicles matching these targets.

Return ONLY valid JSON — an array of 8-15 discovered vehicles:

{
  "auction_date": "2026-04-08",
  "vehicles": [
    {
      "auction_source": "USS Tokyo" or "USS Nagoya" or "USS Kobe" or "BH Auction" or "Arai" or "Goo-net",
      "lot_number": "<realistic lot format e.g. T-2026-8847>",
      "make": "<brand>",
      "model": "<model>",
      "year": <integer>,
      "mileage_km": <integer>,
      "drive_side": "LHD" or "RHD",
      "auction_grade": <float 1.0-6.0>,
      "exterior_color": "<color name>",
      "interior_color": "<color name>",
      "transmission": "AUTOMATIC" or "MANUAL" or "DCT" or "PDK" or "SMG",
      "engine_spec": "<displacement + type>",
      "asking_price_jpy": <integer>,
      "specification_notes": "<notable options, packages>",
      "service_history": "FULL_DEALER" or "PARTIAL_DEALER" or "INDEPENDENT" or "UNKNOWN",
      "accident_history": <boolean>,
      "condition_notes": "1-2 sentence condition summary from auction sheet",
      "auction_sheet_notes": "key findings from inspection sheet in English",
      "photo_summary": "what the photos show — paint, interior, wheels condition"
    }
  ],
  "scan_summary": {
    "total_lots_scanned": <integer — realistic, hundreds>,
    "matching_vehicles": <integer — vehicles matching our targets>,
    "auction_houses_checked": <integer>,
    "scan_notes": "1-2 sentence summary of today's auction market"
  }
}

IMPORTANT:
- Include 60-70% LHD vehicles (our preference) and 30-40% RHD
- Include mostly Grade 4.0+ but a few Grade 3.5 (to show filtering works)
- Price realistically — Japan prices are 25-40% below DE market
- Mix of strong opportunities (high margin) and marginal ones (to test our filters)
- Include at least 2 vehicles that should be PASS (too expensive, RHD low-demand, bad condition)
- Use realistic lot numbers for each auction house`;

/**
 * Scan Japanese auctions for vehicles matching DE Market TVRs.
 * @param {Array} tvrs — Target Vehicle Reports from DE Market Agent
 * @returns {object|null} Discovered vehicles + scan summary
 */
export async function scanAuctions(tvrs) {
  if (!isAIAvailable()) return null;
  if (!tvrs || tvrs.length === 0) return { error: "No Target Vehicle Reports available. Run DE Market Agent scan first." };

  const fxData = await fetchFxRate();

  const result = await callClaude({
    prompt: SCAN_PROMPT(tvrs, fxData.rate),
    system: SYSTEM_PROMPT,
    maxTokens: 8192,
    jsonMode: true,
  });

  if (!result) return null;

  // Enrich each vehicle with FX conversion
  const vehicles = (result.vehicles || []).map((v, i) => ({
    id: `opp-${Date.now()}-${i}`,
    ...v,
    asking_price_eur: Math.round(v.asking_price_jpy / fxData.rate),
    fx_rate_used: fxData.rate,
    fx_live: fxData.live,
    discovered_at: new Date().toISOString(),
  }));

  return {
    auctionDate: result.auction_date,
    vehicles,
    scanSummary: result.scan_summary,
    fxRate: fxData.rate,
    fxLive: fxData.live,
    scannedAt: new Date().toISOString(),
  };
}
