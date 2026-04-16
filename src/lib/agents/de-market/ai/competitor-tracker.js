/**
 * DE Market Agent — Competitive Intelligence.
 * Per spec Section 6.1.3: "Track competing importers and dealers—their inventory,
 * pricing strategy, turnover rates, and market positioning."
 *
 * v2: Uses Google search to find REAL competitor data instead of hallucinating.
 * Searches for known luxury importers' current inventory and pricing.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

// Known major German luxury importers (per spec Section 6.1.2)
const KNOWN_COMPETITORS = [
  { name: "Hollmann International", domain: "hollmann.com", specialty: "Japanese imports, exotics" },
  { name: "Luft Auto", domain: "luftauto.de", specialty: "Japanese luxury imports" },
  { name: "Saker Sportscars", domain: "saker-sportscars.de", specialty: "Performance vehicles" },
  { name: "Exclusive Cars", domain: "exclusive-cars.de", specialty: "Premium luxury" },
  { name: "Auto Seredin", domain: "autoseredin.de", specialty: "Exotics, limited editions" },
  { name: "Semco Autovertriebs", domain: "semco.de", specialty: "Japanese luxury imports" },
];

/**
 * Analyze the competitive landscape using real web search data.
 * Searches for competitor inventory and pricing, then uses Claude to structure the analysis.
 */
export async function analyzeCompetitors() {
  if (!isAIAvailable()) return null;

  // ── Step 1: Search Google for competitor inventory data ──
  const competitorData = [];

  if (process.env.APIFY_API_KEY) {
    for (const comp of KNOWN_COMPETITORS.slice(0, 4)) {
      try {
        const query = `site:${comp.domain} OR "${comp.name}" luxury car inventory ${new Date().getFullYear()}`;
        console.log(`Competitor search: ${comp.name}`);

        const items = await runActorAndGetItems("apify~google-search-scraper", {
          queries: query,
          maxPagesPerQuery: 1,
          resultsPerPage: 5,
          languageCode: "de",
          countryCode: "de",
        });

        const results = items?.[0]?.organicResults || [];
        const snippets = results.map((r) => `${r.title}: ${r.description || r.snippet || ""}`).join(" | ");

        competitorData.push({
          name: comp.name,
          domain: comp.domain,
          specialty: comp.specialty,
          webData: snippets || "No data found",
          resultCount: results.length,
        });
      } catch (err) {
        console.log(`Competitor search failed for ${comp.name}: ${err.message}`);
        competitorData.push({
          name: comp.name,
          domain: comp.domain,
          specialty: comp.specialty,
          webData: "Search failed",
          resultCount: 0,
        });
      }
    }
  }

  // ── Step 2: Claude analyzes the real data into structured intelligence ──
  const hasRealData = competitorData.some((c) => c.resultCount > 0);

  const result = await callClaude({
    prompt: `Analyze these German luxury car competitors based on ${hasRealData ? "REAL web search data" : "known market information"}.

${competitorData.length > 0 ? `COMPETITOR DATA FROM WEB SEARCH:
${competitorData.map((c) => `${c.name} (${c.domain}) — ${c.specialty}
  Web data: ${c.webData}`).join("\n\n")}` : `KNOWN COMPETITORS (no web search data available):
${KNOWN_COMPETITORS.map((c) => `${c.name} (${c.domain}) — ${c.specialty}`).join("\n")}`}

Return ONLY valid JSON:
{
  "competitors": [
    {
      "name": "<dealer name>",
      "website": "<url>",
      "focus": ["<brand 1>", "<brand 2>"],
      "threatLevel": "LOW" or "MEDIUM" or "HIGH",
      "estimatedInventory": <number or null>,
      "pricePositioning": "PREMIUM" or "COMPETITIVE" or "AGGRESSIVE",
      "notes": "<1-2 sentence analysis based on data>"
    }
  ],
  "marketSummary": "2-3 sentence overview of competitive landscape",
  "opportunities": ["<gap or opportunity 1>"],
  "threats": ["<competitive threat 1>"],
  "dataSource": "${hasRealData ? "web_search" : "ai_knowledge"}"
}`,
    system: "You are a competitive intelligence analyst for a German luxury car import business. Only state facts you can verify from the data provided. If no data is available for a competitor, say so honestly.",
    jsonMode: true,
  });

  if (!result) return null;

  return {
    ...result,
    analyzedAt: new Date().toISOString(),
    competitorsSearched: competitorData.length,
    hasRealData,
  };
}
