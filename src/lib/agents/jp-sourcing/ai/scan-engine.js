/**
 * JP Sourcing Agent — Full Scan Engine with pause/resume support.
 *
 * Pipeline:
 * 1. Load Target Vehicle Reports from DE Market Agent
 * 2. Scrape Japanese marketplaces (goo-net + carsensor + japan-auktion.de)
 * 3. Evaluate each candidate (landed cost, margin, risk, RHD penalty)
 * 4. Auction sheet OCR via Claude Vision (BUY/STRONG_BUY only) → re-evaluate
 * 5. Deep-analyze qualifying candidates via Claude Sonnet
 * 6. Persist everything
 */

import { isAIAvailable } from "@/lib/claude";
import { getLatestTVRs } from "@/lib/agents/de-market/storage";
import { scanAuctions } from "./auction-scanner";
import { evaluateAllOpportunities } from "./opportunity-evaluator";
import { analyzeAuctionSheets } from "./sheet-analyzer";
import { analyzeAllListingPhotos } from "./listing-photos";
import { deepAnalyzeAll } from "./deep-analyzer";
import { saveOpportunities, updateAgentStatus, getAgentStatus, saveScanProgress, getScanProgress } from "../storage";

/**
 * Run a full JP Sourcing scan with background progress tracking.
 */
export async function runFullScan({ deepAnalysis = true } = {}) {
  const startTime = Date.now();
  await updateAgentStatus({ status: "SCANNING" });

  const writeProgress = async (step, detail, extra = {}) => {
    const current = await getScanProgress();
    // Don't overwrite if stopped
    if (current?.state === "stopped") return;
    await saveScanProgress({
      ...current,
      state: current?.state === "paused" ? "paused" : "scanning",
      step,
      detail,
      startedAt: new Date(startTime).toISOString(),
      ...extra,
    });
  };

  const checkState = async () => (await getScanProgress())?.state;

  // ─── Step 1: Load TVRs ───
  await writeProgress("loading", "Loading Target Vehicle Reports from DE Market Agent...");

  const tvrData = await getLatestTVRs();
  if (!tvrData?.reports?.length) {
    await updateAgentStatus({ status: "ERROR", lastError: "No TVRs available" });
    await saveScanProgress({ state: "error", error: "No Target Vehicle Reports. Run DE Market Agent scan first." });
    return { error: "No Target Vehicle Reports available. Run DE Market Agent scan first.", aiPowered: true };
  }

  const tvrs = tvrData.reports;
  await writeProgress("loading", `Loaded ${tvrs.length} Target Vehicle Reports`, { totalModels: tvrs.length });

  // Check for stop before scraping
  if (await checkState() === "stopped") return { error: "Scan stopped by user" };

  // ─── Step 2: Scrape Japanese platforms (with pause/resume) ───
  await writeProgress("scraping", `Scraping goo-net + carsensor + japan-auktion for ${tvrs.length} models...`, {
    totalModels: tvrs.length,
    completedModels: 0,
    vehiclesFound: 0,
  });

  const auctionResult = await scanAuctions(tvrs, {
    onProgress: async (modelIdx, total, make, model, vehiclesSoFar) => {
      await writeProgress("scraping", `Scraping ${make} ${model} (${modelIdx + 1}/${total})...`, {
        totalModels: total,
        completedModels: modelIdx,
        currentModel: `${make} ${model}`,
        vehiclesFound: vehiclesSoFar,
      });
    },
    checkState,
  });

  if (!auctionResult || auctionResult.error) {
    await updateAgentStatus({ status: "ERROR", lastError: auctionResult?.error || "Scan failed" });
    await saveScanProgress({ state: "error", error: auctionResult?.error || "Scan failed" });
    return { error: auctionResult?.error || "Auction scan failed", aiPowered: true };
  }

  // Check if stopped during scraping
  if (await checkState() === "stopped") {
    await updateAgentStatus({ status: "ONLINE" });
    return { error: "Scan stopped by user" };
  }

  const vehicles = auctionResult.vehicles;
  await writeProgress("scraping", `Found ${vehicles.length} vehicles from Japanese platforms`, {
    totalModels: tvrs.length,
    completedModels: auctionResult.completedModels?.length || tvrs.length,
    vehiclesFound: vehicles.length,
  });

  if (vehicles.length === 0) {
    const elapsed = Date.now() - startTime;
    await updateAgentStatus({ status: "ONLINE", lastScanTimestamp: new Date().toISOString() });
    await saveScanProgress({ state: "done", detail: "No vehicles found matching target models", vehiclesFound: 0, completedAt: new Date().toISOString() });
    return { aiPowered: true, status: "COMPLETED", duration: elapsed, results: { total: 0 } };
  }

  // ─── Step 3: Evaluate ───
  await writeProgress("evaluating", `Evaluating ${vehicles.length} candidates against DE market data...`, { vehiclesFound: vehicles.length });

  // Pass the full fxData object so scoreRisk can compute currency_risk from
  // the 90-day moving-average deviation (docx §6.2.4). Falls back to the
  // rate number for older callers.
  const fxForEval = auctionResult.fxData || auctionResult.fxRate;
  const opportunities = evaluateAllOpportunities(vehicles, tvrs, fxForEval);

  const strongBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY");
  const buys = opportunities.filter((o) => o.recommendation === "BUY");
  const reviews = opportunities.filter((o) => o.recommendation === "REVIEW");
  const passes = opportunities.filter((o) => o.recommendation === "PASS");

  await writeProgress("evaluating", `${strongBuys.length} STRONG_BUY, ${buys.length} BUY, ${reviews.length} REVIEW, ${passes.length} PASS`, {
    vehiclesFound: vehicles.length,
    results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
  });

  // ─── Step 4: Auction sheet OCR (BUY/STRONG_BUY only) ───
  let sheetAnalysisResult = { analyzed: 0, enriched: 0, failed: 0 };
  const qualifyingCount = strongBuys.length + buys.length;
  if (qualifyingCount > 0 && isAIAvailable()) {
    if (await checkState() === "stopped") {
      await updateAgentStatus({ status: "ONLINE" });
      return { error: "Scan stopped by user" };
    }

    await writeProgress("sheets", `Analyzing auction sheets for ${qualifyingCount} qualifying candidates via Vision OCR...`, {
      vehiclesFound: vehicles.length,
      results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
    });

    sheetAnalysisResult = await analyzeAuctionSheets(opportunities, {
      onProgress: async (done, total) => {
        await writeProgress("sheets", `Analyzing auction sheet ${done + 1}/${total}...`, {
          vehiclesFound: vehicles.length,
          results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
        });
      },
      checkState,
    });

    // Sheet-enrichment re-eval is now deferred until after Step 4b so mods
    // detected by photo analysis also feed into the TUV risk.
  }

  // ─── Step 4b: Photo analysis for BUY/STRONG_BUY (Claude Vision on listing photos) ───
  // Spec §6.2.3.2 mandates Vision on auction photos for paint / interior / wheels / modifications.
  let photoAnalysisResult = { analyzed: 0 };
  if (qualifyingCount > 0 && isAIAvailable()) {
    if (await checkState() === "stopped") {
      await updateAgentStatus({ status: "ONLINE" });
      return { error: "Scan stopped by user" };
    }

    const eligibleCount = opportunities.filter(
      (o) => (o.recommendation === "BUY" || o.recommendation === "STRONG_BUY") && Array.isArray(o.vehicle?.photoUrls) && o.vehicle.photoUrls.length > 0
    ).length;

    if (eligibleCount > 0) {
      await writeProgress("photos", `Analyzing listing photos for ${eligibleCount} qualifying candidates via Claude Vision...`, {
        vehiclesFound: vehicles.length,
        results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
      });

      await analyzeAllListingPhotos(opportunities, {
        concurrency: 3,
        onProgress: async (done, total, make, model) => {
          await writeProgress("photos", `Vision pass ${done + 1}/${total}: ${make || ""} ${model || ""}`, {
            vehiclesFound: vehicles.length,
            results: { strongBuy: strongBuys.length, buy: buys.length, review: reviews.length, pass: passes.length },
          });
        },
      });

      photoAnalysisResult.analyzed = opportunities.filter((o) => o.photoAnalysis).length;
    }
  }

  // ─── Step 4c: Consolidated re-evaluation after sheet + photo enrichment ───
  // Runs ONCE after both enrichment passes so each re-eval sees the complete
  // set of derived signals: service_history / accident / grade (from sheets),
  // modifications / visible_damage / tuv_risk_flags / respray (from photos +
  // sheets). This is where spec §6.2.3 feedback loop closes — the enriched
  // vehicle data flows back into scoreRisk's TUV/condition dimensions.
  const enrichedOpps = opportunities.filter((o) => o.sheetAnalysis || o.photoAnalysis);
  if (enrichedOpps.length > 0) {
    const { evaluateOpportunity, findMatchingTvr } = await import("./opportunity-evaluator");

    for (const opp of enrichedOpps) {
      const vehicle = vehicles.find((v) => v.id === opp.id);
      if (!vehicle) continue;

      // Propagate sheet-derived fields
      if (opp.vehicle?.serviceHistory) vehicle.service_history = opp.vehicle.serviceHistory;
      if (opp.vehicle?.accidentHistory) vehicle.accident_history = true;
      if (opp.vehicle?.auctionGrade) vehicle.auction_grade = opp.vehicle.auctionGrade;

      // Propagate photo-derived fields (new — feeds docx §6.2.4 TUV risk)
      if (Array.isArray(opp.vehicle?.modifications)) {
        vehicle.modifications = opp.vehicle.modifications;
      }
      if (Array.isArray(opp.vehicle?.visibleDamage)) {
        vehicle.visible_damage = opp.vehicle.visibleDamage;
      }
      if (Array.isArray(opp.vehicle?.tuvRiskFlags)) {
        vehicle.tuv_risk_flags = opp.vehicle.tuvRiskFlags;
      }
      if (opp.photoAnalysis?.resprayDetected) {
        vehicle.respray_detected = true;
      }

      const tvr = findMatchingTvr(vehicle, tvrs);
      if (!tvr) continue;

      const reEval = evaluateOpportunity(vehicle, tvr, fxForEval);
      // Preserve enrichment attachments so downstream steps keep access to them
      Object.assign(opp, reEval, {
        sheetAnalysis: opp.sheetAnalysis,
        photoAnalysis: opp.photoAnalysis,
      });
    }

    // Re-sort after re-evaluation
    opportunities.sort((a, b) => (b.margin?.riskAdjustedMargin || -99999) - (a.margin?.riskAdjustedMargin || -99999));

    const newStrongBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY").length;
    const newBuys = opportunities.filter((o) => o.recommendation === "BUY").length;
    const newReviews = opportunities.filter((o) => o.recommendation === "REVIEW").length;
    const newPasses = opportunities.filter((o) => o.recommendation === "PASS").length;

    await writeProgress("enrichment_reeval", `Re-evaluated ${enrichedOpps.length} enriched opportunities. Updated: ${newStrongBuys} SB, ${newBuys} B, ${newReviews} R, ${newPasses} P`, {
      vehiclesFound: vehicles.length,
      results: { strongBuy: newStrongBuys, buy: newBuys, review: newReviews, pass: newPasses },
    });
  }

  // ─── Step 5: Deep analysis ───
  let deepAnalyses = [];
  if (deepAnalysis && qualifyingCount > 0 && isAIAvailable()) {
    if (await checkState() === "stopped") {
      await updateAgentStatus({ status: "ONLINE" });
      return { error: "Scan stopped by user" };
    }

    const currentBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY" || o.recommendation === "BUY");
    await writeProgress("analyzing", `Deep-analyzing ${currentBuys.length} qualifying candidates via AI...`, {
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

  // ─── Step 6: Persist ───
  const elapsed = Date.now() - startTime;

  // Final counts after all enrichment
  const finalStrongBuys = opportunities.filter((o) => o.recommendation === "STRONG_BUY").length;
  const finalBuys = opportunities.filter((o) => o.recommendation === "BUY").length;
  const finalReviews = opportunities.filter((o) => o.recommendation === "REVIEW").length;
  const finalPasses = opportunities.filter((o) => o.recommendation === "PASS").length;

  await saveOpportunities({
    opportunities,
    deepAnalyses,
    scanSummary: {
      auctionDate: auctionResult.auctionDate,
      totalLotsScanned: auctionResult.scanSummary?.total_lots_scanned || 0,
      matchingVehicles: vehicles.length,
      auctionHousesChecked: auctionResult.scanSummary?.auction_houses_checked || 0,
      vehiclesWithGrades: auctionResult.scanSummary?.vehicles_with_grades || 0,
      vehiclesWithSoldPrices: auctionResult.scanSummary?.vehicles_with_sold_prices || 0,
      strongBuyCount: finalStrongBuys,
      buyCount: finalBuys,
      reviewCount: finalReviews,
      passCount: finalPasses,
      deepAnalyzed: deepAnalyses.length,
      sheetsAnalyzed: sheetAnalysisResult.analyzed,
      sheetsEnriched: sheetAnalysisResult.enriched,
      listingPhotosAnalyzed: photoAnalysisResult.analyzed,
      fxRate: auctionResult.fxRate,
      fxLive: auctionResult.fxLive,
      scanNotes: auctionResult.scanSummary?.scan_notes || "",
      dataSources: auctionResult.scanSummary?.sources || {},
    },
    scannedAt: new Date().toISOString(),
  });

  const prevStatus = await getAgentStatus();
  await updateAgentStatus({
    status: "ONLINE",
    lastScanTimestamp: new Date().toISOString(),
    lastScanDuration: elapsed,
    scansConductedToday: (prevStatus.scansConductedToday || 0) + 1,
    vehiclesEvaluated: vehicles.length,
    opportunitiesFound: finalStrongBuys + finalBuys + finalReviews,
    strongBuyCount: finalStrongBuys,
    buyCount: finalBuys,
  });

  await saveScanProgress({
    state: "done",
    step: "complete",
    detail: `Scan complete. ${vehicles.length} vehicles found, ${finalStrongBuys + finalBuys} opportunities. ${sheetAnalysisResult.enriched} auction sheets analyzed.`,
    vehiclesFound: vehicles.length,
    results: { strongBuy: finalStrongBuys, buy: finalBuys, review: finalReviews, pass: finalPasses },
    completedAt: new Date().toISOString(),
  });

  return {
    aiPowered: true,
    status: "COMPLETED",
    duration: elapsed,
    fxRate: auctionResult.fxRate,
    fxLive: auctionResult.fxLive,
    results: { strongBuy: finalStrongBuys, buy: finalBuys, review: finalReviews, pass: finalPasses, deepAnalyzed: deepAnalyses.length, sheetsEnriched: sheetAnalysisResult.enriched, listingPhotosAnalyzed: photoAnalysisResult.analyzed },
    topOpportunities: opportunities.filter((o) => o.recommendation !== "PASS").slice(0, 5).map((o) => ({
      id: o.id,
      vehicle: `${o.vehicle?.make} ${o.vehicle?.model} ${o.vehicle?.year}`,
      margin: o.margin?.grossMarginEur,
      recommendation: o.refinedRecommendation || o.recommendation,
    })),
  };
}
