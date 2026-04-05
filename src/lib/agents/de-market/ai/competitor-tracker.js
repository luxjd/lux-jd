/**
 * Competitor Intelligence Tracker — analyzes German luxury dealer landscape.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are a competitive intelligence analyst specializing in the German luxury car dealer market. You have deep knowledge of major dealers including Hollmann International, Luft Auto, Saker Sportscars, Munich Auto Gallery, Stuttgart Elite Cars, Berlin Premium Motors, and others.`;

const PROMPT = `Analyze the current competitive landscape for luxury vehicle dealers in Germany who trade in Japanese-sourced imports or high-end exotics (Ferrari, Porsche, Mercedes-AMG, Lamborghini, Bentley, Aston Martin).

Return ONLY valid JSON — an array of 6-8 major competitors:

{
  "competitors": [
    {
      "name": "<dealer name>",
      "location": "<German city>",
      "website": "<domain>",
      "inventory_count": <integer — current estimated stock>,
      "avg_price_eur": <integer>,
      "avg_days_on_market": <integer>,
      "strategy": "PREMIUM" or "MID_RANGE" or "VOLUME" or "SPECIALIST" or "ULTRA_PREMIUM",
      "threat_level": "HIGH" or "MEDIUM" or "LOW",
      "focus_brands": ["brand1", "brand2"],
      "strengths": "1 sentence",
      "weaknesses": "1 sentence",
      "price_positioning": "ABOVE_MARKET" or "AT_MARKET" or "BELOW_MARKET",
      "turnover_rate": "FAST" or "MODERATE" or "SLOW"
    }
  ],
  "market_summary": "2-3 sentence overview of competitive landscape",
  "opportunities": ["gap 1 we can exploit", "gap 2"],
  "threats": ["threat 1", "threat 2"]
}

Be realistic with dealer names, locations, and inventory sizes.`;

export async function analyzeCompetitors() {
  if (!isAIAvailable()) return null;

  const result = await callClaude({
    prompt: PROMPT,
    system: SYSTEM_PROMPT,
    jsonMode: true,
  });

  if (!result) return null;

  return {
    ...result,
    analyzedAt: new Date().toISOString(),
  };
}
