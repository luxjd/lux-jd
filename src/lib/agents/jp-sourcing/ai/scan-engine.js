/**
 * JP Sourcing Agent — Full Scan Engine.
 *
 * Pipeline:
 * 1. Load Target Vehicle Reports from DE Market Agent
 * 2. Scan Japanese auctions for matching vehicles
 * 3. Evaluate each candidate (landed cost, margin, risk)
 * 4. Deep-analyze STRONG_BUY and BUY candidates
 * 5. Rank by risk-adjusted margin
 * 6. Persist everything
 */

import { isAIAvailable } from "@/lib/claude";
import { getLatestTVRs } from "@/lib/agents/de-market/storage";
import { scanAuctions } from "./auction-scanner";
import { evaluateAllOpportunities } from "./opportunity-evaluator";
import { deepAnalyzeAll } from "./deep-analyzer";
import { saveOpportunities, updateAgentStatus, getAgentStatus } from "../storage";

/**
 * Run a full JP Sourcing scan.
 * @param {object} options
 * @param {boolean} options.deepAnalysis — run deep AI analysis on qualifying candidates
 * @param {function} options.onProgress — callback(step, detail)
 * @returns {object} Full scan result
 */
export async function runFullScan({ deepAnalysis = true, onProgress = null } = {}) {
  if (!isAIAvailable()) {
    return { error: "AI not available — add OPENROUTER_API_KEY to .env.local", aiPowered: false };
  }

  const startTime = Date.now();
  updateAgentStatus({ status: "SCANNING" });

  // ─── Step 1: Load TVRs from DE Market Agent ───
  onProgress?.("loading", "Loading Target Vehicle Reports from DE Market Agent...");

  const tvrData = getLatestTVRs();
  if (!tvrData?.reports?.length) {
    updateAgentStatus({ status: "ERROR", lastError: "No TVRs available" });
    return {
      error: "No Target Vehicle Reports available. Run DE Market Agent scan first.",
      aiPowered: true,
    };
  }

  const tvrs = tvrData.reports;
  onProgress?.("loading", `Loaded ${tvrs.length} Target Vehicle Reports`);

  // ─── Step 2: Scan Japanese auctions ───
  onProgress?.("scanning", `Scanning Japanese auctions for ${tvrs.length} target models...`);

  const auctionResult = await scanAuctions(tvrs);
  if (!auctionResult || auctionResult.error) {
    updateAgentStatus({ status: "ERROR", lastError: auctionResult?.error || "Scan failed" });
    return { error: auctionResult?.error || "Auction scan failed", aiPowered: true };
  }

  const vehicles = auctionResult.vehicles;
  onProgress?.("scanning", `Found ${vehicles.length} matching vehicles`);

  // ─── Step 3: Evaluate each candidate ───
  onProgress?.("evaluating", `Evaluating ${vehicles.length} candidates against DE market data...`);

  const opportunities = evaluateAllOpportunities(vehicles, tvrs, auctionResult.fxRate);

  const strongBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY");
  const buys = opportunities.filter((o) => o.recommendation === "BUY");
  const reviews = opportunities.filter((o) => o.recommendation === "REVIEW");
  const passes = opportunities.filter((o) => o.recommendation === "PASS");

  onProgress?.("evaluating", `Results: ${strongBuys.length} STRONG_BUY, ${buys.length} BUY, ${reviews.length} REVIEW, ${passes.length} PASS`);

  // ─── Step 4: Deep analysis on qualifying candidates ───
  let deepAnalyses = [];
  if (deepAnalysis && (strongBuys.length + buys.length) > 0) {
    onProgress?.("analyzing", `Deep-analyzing ${strongBuys.length + buys.length} qualifying candidates...`);

    deepAnalyses = await deepAnalyzeAll(opportunities);

    // Merge deep analyses back into opportunities
    for (const analysis of deepAnalyses) {
      const opp = opportunities.find((o) => o.id === analysis.opportunityId);
      if (opp) {
        opp.deepAnalysis = analysis;
        if (analysis.refined_recommendation) {
          opp.refinedRecommendation = analysis.refined_recommendation;
        }
      }
    }

    onProgress?.("analyzing", `Deep analysis complete for ${deepAnalyses.length} vehicles`);
  }

  // ─── Step 5: Persist ───
  const elapsed = Date.now() - startTime;

  saveOpportunities({
    opportunities,
    deepAnalyses,
    scanSummary: {
      auctionDate: auctionResult.auctionDate,
      totalLotsScanned: auctionResult.scanSummary?.total_lots_scanned || 0,
      matchingVehicles: vehicles.length,
      auctionHousesChecked: auctionResult.scanSummary?.auction_houses_checked || 0,
      strongBuyCount: strongBuys.length,
      buyCount: buys.length,
      reviewCount: reviews.length,
      passCount: passes.length,
      deepAnalyzed: deepAnalyses.length,
      fxRate: auctionResult.fxRate,
      fxLive: auctionResult.fxLive,
      scanNotes: auctionResult.scanSummary?.scan_notes || "",
    },
    scannedAt: new Date().toISOString(),
  });

  // Update status
  const prevStatus = getAgentStatus();
  updateAgentStatus({
    status: "ONLINE",
    lastScanTimestamp: new Date().toISOString(),
    lastScanDuration: elapsed,
    scansConductedToday: (prevStatus.scansConductedToday || 0) + 1,
    vehiclesEvaluated: vehicles.length,
    opportunitiesFound: strongBuys.length + buys.length + reviews.length,
    strongBuyCount: strongBuys.length,
    buyCount: buys.length,
  });

  onProgress?.("complete", "Scan complete!");

  return {
    aiPowered: true,
    status: "COMPLETED",
    duration: elapsed,
    fxRate: auctionResult.fxRate,
    fxLive: auctionResult.fxLive,
    scanSummary: {
      totalLotsScanned: auctionResult.scanSummary?.total_lots_scanned || 0,
      matchingVehicles: vehicles.length,
      tvrCount: tvrs.length,
    },
    results: {
      strongBuy: strongBuys.length,
      buy: buys.length,
      review: reviews.length,
      pass: passes.length,
      deepAnalyzed: deepAnalyses.length,
    },
    topOpportunities: opportunities
      .filter((o) => o.recommendation !== "PASS")
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        vehicle: `${o.vehicle?.make} ${o.vehicle?.model} ${o.vehicle?.year}`,
        margin: o.margin?.grossMarginEur,
        marginPct: o.margin?.grossMarginPct,
        recommendation: o.refinedRecommendation || o.recommendation,
        risk: o.risk?.compositeLevel,
      })),
  };
}
