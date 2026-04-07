/**
 * JP Sourcing Agent — Full Scan Engine with pause/resume support.
 *
 * Pipeline:
 * 1. Load Target Vehicle Reports from DE Market Agent
 * 2. Scrape Japanese marketplaces for matching vehicles (with pause/resume)
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
import { saveOpportunities, updateAgentStatus, getAgentStatus, saveScanProgress, getScanProgress } from "../storage";

/**
 * Run a full JP Sourcing scan with background progress tracking.
 */
export async function runFullScan({ deepAnalysis = true } = {}) {
  const startTime = Date.now();
  updateAgentStatus({ status: "SCANNING" });

  const writeProgress = (step, detail, extra = {}) => {
    const current = getScanProgress();
    // Don't overwrite if stopped
    if (current?.state === "stopped") return;
    saveScanProgress({
      ...current,
      state: current?.state === "paused" ? "paused" : "scanning",
      step,
      detail,
      startedAt: new Date(startTime).toISOString(),
      ...extra,
    });
  };

  const checkState = () => getScanProgress()?.state;

  // ─── Step 1: Load TVRs ───
  writeProgress("loading", "Loading Target Vehicle Reports from DE Market Agent...");

  const tvrData = getLatestTVRs();
  if (!tvrData?.reports?.length) {
    updateAgentStatus({ status: "ERROR", lastError: "No TVRs available" });
    saveScanProgress({ state: "error", error: "No Target Vehicle Reports. Run DE Market Agent scan first." });
    return { error: "No Target Vehicle Reports available. Run DE Market Agent scan first.", aiPowered: true };
  }

  const tvrs = tvrData.reports;
  writeProgress("loading", `Loaded ${tvrs.length} Target Vehicle Reports`, { totalModels: tvrs.length });

  // Check for stop before scraping
  if (checkState() === "stopped") return { error: "Scan stopped by user" };

  // ─── Step 2: Scrape Japanese platforms (with pause/resume) ───
  writeProgress("scraping", `Scraping goo-net + carsensor for ${tvrs.length} models...`, {
    totalModels: tvrs.length,
    completedModels: 0,
    vehiclesFound: 0,
  });

  const auctionResult = await scanAuctions(tvrs, {
    onProgress: (modelIdx, total, make, model, vehiclesSoFar) => {
      writeProgress("scraping", `Scraping ${make} ${model} (${modelIdx + 1}/${total})...`, {
        totalModels: total,
        completedModels: modelIdx,
        currentModel: `${make} ${model}`,
        vehiclesFound: vehiclesSoFar,
      });
    },
    checkState,
  });

  if (!auctionResult || auctionResult.error) {
    updateAgentStatus({ status: "ERROR", lastError: auctionResult?.error || "Scan failed" });
    saveScanProgress({ state: "error", error: auctionResult?.error || "Scan failed" });
    return { error: auctionResult?.error || "Auction scan failed", aiPowered: true };
  }

  // Check if stopped during scraping
  if (checkState() === "stopped") {
    updateAgentStatus({ status: "ONLINE" });
    return { error: "Scan stopped by user" };
  }

  const vehicles = auctionResult.vehicles;
  writeProgress("scraping", `Found ${vehicles.length} vehicles from Japanese platforms`, {
    totalModels: tvrs.length,
    completedModels: auctionResult.completedModels?.length || tvrs.length,
    vehiclesFound: vehicles.length,
  });

  if (vehicles.length === 0) {
    const elapsed = Date.now() - startTime;
    updateAgentStatus({ status: "ONLINE", lastScanTimestamp: new Date().toISOString() });
    saveScanProgress({ state: "done", detail: "No vehicles found matching target models", vehiclesFound: 0, completedAt: new Date().toISOString() });
    return { aiPowered: true, status: "COMPLETED", duration: elapsed, results: { total: 0 } };
  }

  // ─── Step 3: Evaluate ───
  writeProgress("evaluating", `Evaluating ${vehicles.length} candidates against DE market data...`, { vehiclesFound: vehicles.length });

  const opportunities = evaluateAllOpportunities(vehicles, tvrs, auctionResult.fxRate);

  const strongBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY");
  const buys = opportunities.filter((o) => o.recommendation === "BUY");
  const reviews = opportunities.filter((o) => o.recommendation === "REVIEW");
  const passes = opportunities.filter((o) => o.recommendation === "PASS");

  writeProgress("evaluating", `${strongBuys.length} STRONG_BUY, ${buys.length} BUY, ${reviews.length} REVIEW, ${passes.length} PASS`, {
    vehiclesFound: vehicles.length,
    results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
  });

  // ─── Step 4: Deep analysis ───
  let deepAnalyses = [];
  const qualifyingCount = strongBuys.length + buys.length;
  if (deepAnalysis && qualifyingCount > 0 && isAIAvailable()) {
    if (checkState() === "stopped") {
      updateAgentStatus({ status: "ONLINE" });
      return { error: "Scan stopped by user" };
    }

    writeProgress("analyzing", `Deep-analyzing ${qualifyingCount} qualifying candidates via AI...`, {
      vehiclesFound: vehicles.length,
      results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
    });

    deepAnalyses = await deepAnalyzeAll(opportunities);

    for (const analysis of deepAnalyses) {
      const opp = opportunities.find((o) => o.id === analysis.opportunityId);
      if (opp) {
        opp.deepAnalysis = analysis;
        if (analysis.refined_recommendation) opp.refinedRecommendation = analysis.refined_recommendation;
      }
    }
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
      dataSources: auctionResult.scanSummary?.sources || {},
    },
    scannedAt: new Date().toISOString(),
  });

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

  saveScanProgress({
    state: "done",
    step: "complete",
    detail: `Scan complete. ${vehicles.length} vehicles found, ${strongBuys.length + buys.length} opportunities.`,
    vehiclesFound: vehicles.length,
    results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
    completedAt: new Date().toISOString(),
  });

  return {
    aiPowered: true,
    status: "COMPLETED",
    duration: elapsed,
    fxRate: auctionResult.fxRate,
    fxLive: auctionResult.fxLive,
    results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length, deepAnalyzed: deepAnalyses.length },
    topOpportunities: opportunities.filter((o) => o.recommendation !== "PASS").slice(0, 5).map((o) => ({
      id: o.id,
      vehicle: `${o.vehicle?.make} ${o.vehicle?.model} ${o.vehicle?.year}`,
      margin: o.margin?.grossMarginEur,
      recommendation: o.refinedRecommendation || o.recommendation,
    })),
  };
}
