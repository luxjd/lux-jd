"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ScanButton from "./_components/ScanButton";

const REC_STYLES = {
  STRONG_BUY: "bg-emerald-400/15 text-emerald-400",
  BUY: "bg-primary/15 text-primary",
  REVIEW: "bg-amber-400/15 text-amber-400",
  PASS: "bg-slate-400/10 text-slate-400",
};
const RISK_STYLES = { LOW: "text-emerald-400", MEDIUM: "text-amber-400", HIGH: "text-red-400" };
const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "—";

export default function JpSourcingPage() {
  const [status, setStatus] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveResult, setApproveResult] = useState({});
  const [scanHistory, setScanHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, oppsRes, orchRes] = await Promise.all([
        fetch("/api/agents/jp-sourcing/status").then((r) => r.json()).catch(() => null),
        fetch("/api/agents/jp-sourcing/opportunities").then((r) => r.json()).catch(() => ({})),
        fetch("/api/agents/orchestrator/status").then((r) => r.json()).catch(() => ({})),
      ]);
      setStatus(statusRes);
      setOpportunities(oppsRes.opportunities || []);
      setScanHistory(oppsRes.scanHistory || []);

      // Pre-populate approve results from existing orchestrator decisions
      const decisions = orchRes.recentDecisions || [];
      if (decisions.length > 0) {
        const existing = {};
        for (const d of decisions) {
          if (d.opportunityId) {
            existing[d.opportunityId] = d;
          }
        }
        setApproveResult((prev) => ({ ...existing, ...prev }));
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApproveBid = async (opp) => {
    setApproving(opp.id);
    try {
      const res = await fetch("/api/agents/orchestrator/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity: opp }),
      });
      const data = await res.json();
      setApproveResult((prev) => ({ ...prev, [opp.id]: data }));
    } catch (err) {
      setApproveResult((prev) => ({ ...prev, [opp.id]: { error: err.message } }));
    } finally {
      setApproving(null);
    }
  };

  const toggleDetails = (id) => {
    setExpandedId((prev) => prev === id ? null : id);
  };

  const hasData = opportunities.length > 0;
  const strongBuys = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "STRONG_BUY");
  const buys = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "BUY");
  const reviews = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "REVIEW");
  const passes = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "PASS");

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-2xl">travel_explore</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-headline text-xl font-bold">JP Sourcing Agent</h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">jp_sourcing</span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status?.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : status?.status === "SCANNING" ? "bg-amber-400/15 text-amber-400" : "bg-slate-400/10 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status?.status === "ONLINE" ? "bg-emerald-400" : status?.status === "SCANNING" ? "bg-amber-400 animate-pulse" : "bg-slate-400"}`} />
                  {status?.status || "IDLE"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Scans Japanese auctions → evaluates candidates → recommends BUY/REVIEW/PASS
                {status?.lastScanTimestamp && ` · Last scan: ${new Date(status.lastScanTimestamp).toLocaleString()}`}
              </p>
            </div>
          </div>
          <ScanButton onScanComplete={fetchData} />
        </div>

        {/* Metrics */}
        {hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
              <span className="font-headline font-bold text-lg text-emerald-400">{strongBuys.length}</span>
              <span className="text-[10px] text-emerald-400 uppercase">Strong Buy</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
              <span className="font-headline font-bold text-lg text-primary">{buys.length}</span>
              <span className="text-[10px] text-primary uppercase">Buy</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400/5 border border-amber-400/10">
              <span className="font-headline font-bold text-lg text-amber-400">{reviews.length}</span>
              <span className="text-[10px] text-amber-400 uppercase">Review</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-400/5 border border-slate-400/10">
              <span className="font-headline font-bold text-lg text-slate-400">{passes.length}</span>
              <span className="text-[10px] text-slate-400 uppercase">Pass</span>
            </div>
          </div>
        )}
      </div>

      {/* Opportunities */}
      {!hasData ? (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">travel_explore</span>
          <h3 className="font-headline font-bold text-lg mb-2">No Opportunities Yet</h3>
          <p className="text-sm text-on-surface-variant mb-4">Click &quot;Scan Japanese Auctions&quot; to discover vehicles. Make sure DE Market Agent has been scanned first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="font-headline font-bold text-lg">Opportunities ({opportunities.filter((o) => o.recommendation !== "PASS").length} actionable)</h3>

          {opportunities.filter((o) => o.recommendation !== "PASS").map((opp) => {
            const rec = opp.refinedRecommendation || opp.recommendation;
            const da = opp.deepAnalysis;
            return (
              <div key={opp.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5 hover:border-primary/30 transition-all">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-headline text-base sm:text-lg font-bold">{opp.vehicle?.make} {opp.vehicle?.model}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${REC_STYLES[rec]}`}>{rec?.replace("_", " ")}</span>
                      <span className={`text-[10px] font-bold uppercase ${RISK_STYLES[opp.risk?.compositeLevel]}`}>{opp.risk?.compositeLevel} RISK ({opp.risk?.compositeScore})</span>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {opp.vehicle?.year} · {opp.vehicle?.mileageKm?.toLocaleString()} km · {opp.vehicle?.driveSide} · {opp.vehicle?.exteriorColor || "—"}
                      {opp.vehicle?.auctionGrade && ` · Grade ${opp.vehicle.auctionGrade}`}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {opp.source?.auctionHouse}
                      {opp.source?.lotNumber && ` · Lot ${opp.source.lotNumber}`}
                      {opp.vehicle?.serviceHistory && opp.vehicle.serviceHistory !== "UNKNOWN" && ` · ${opp.vehicle.serviceHistory.replace(/_/g, " ")}`}
                      {opp.vehicle?.accidentHistory && <span className="text-red-400 ml-1">· ACCIDENT</span>}
                      {opp.pricing?.rhdPenaltyApplied && <span className="text-amber-400 ml-1">· RHD -15%</span>}
                      {opp.sheetAnalysis && <span className="text-primary ml-1">· Sheet OCR ✓</span>}
                    </p>
                    {opp.vehicle?.listingUrl && (
                      <a href={opp.vehicle.listingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">View listing</a>
                    )}
                    {opp.vehicle?.conditionNotes && (
                      <p className="text-xs text-on-surface-variant mt-1 italic">&quot;{opp.vehicle.conditionNotes}&quot;</p>
                    )}
                    {opp.vehicle?.auctionSheetNotes && (
                      <div className="mt-1.5 p-1.5 rounded-lg bg-secondary/5 border border-secondary/10">
                        <p className="text-[10px] text-secondary"><span className="font-bold">Auction Sheet:</span> {opp.vehicle.auctionSheetNotes}</p>
                      </div>
                    )}
                    {da?.deep_assessment?.investment_thesis && (
                      <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-xs text-primary"><span className="font-bold">AI Thesis:</span> {da.deep_assessment.investment_thesis}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">JP Price</p>
                      <p className="font-headline font-bold text-sm">¥{opp.pricing?.askingPriceJpy?.toLocaleString()}</p>
                      <p className="text-[10px] text-on-surface-variant">{fmt(opp.pricing?.askingPriceEur)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">DE Value</p>
                      <p className="font-headline font-bold text-sm">{fmt(opp.pricing?.deMarketMedian)}</p>
                      {opp.pricing?.rhdPenaltyApplied && <p className="text-[9px] text-amber-400 line-through">{fmt(opp.pricing?.deMarketMedianRaw)}</p>}
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Landed</p>
                      <p className="font-headline font-bold text-sm">{fmt(opp.landedCost?.totalLandedCostEur)}</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] uppercase tracking-wider ${opp.margin?.grossMarginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>Margin</p>
                      <p className={`font-headline font-bold text-lg ${opp.margin?.grossMarginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(opp.margin?.grossMarginEur)}</p>
                      <p className={`text-[10px] ${opp.margin?.grossMarginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>{opp.margin?.grossMarginPct}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Confidence</p>
                      <div className="w-10 h-10 mx-auto">
                        <svg viewBox="0 0 36 36" className="-rotate-90">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(65,71,84,0.3)" strokeWidth="3" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={opp.confidence >= 0.80 ? "#34d399" : "#fbbf24"} strokeWidth="3" strokeDasharray={`${opp.confidence * 88} 88`} strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-[10px] font-bold">{(opp.confidence * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                </div>

                {opp.maxBidJpy && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-3 pt-3 border-t border-outline-variant/10 gap-2">
                    <p className="text-xs text-on-surface-variant">
                      Max bid: <span className="font-bold text-secondary">¥{opp.maxBidJpy.toLocaleString()}</span>
                      {da?.suggested_bid_jpy && <span className="ml-2">· AI suggests: <span className="font-bold text-primary">¥{da.suggested_bid_jpy.toLocaleString()}</span></span>}
                    </p>
                    <div className="flex gap-2">
                      {approveResult[opp.id] ? (
                        <span className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
                          approveResult[opp.id].decision === "AUTO_APPROVE" ? "bg-emerald-400/15 text-emerald-400" :
                          approveResult[opp.id].decision === "HUMAN_REVIEW" ? "bg-amber-400/15 text-amber-400" :
                          approveResult[opp.id].error ? "bg-red-400/15 text-red-400" :
                          "bg-red-400/15 text-red-400"
                        }`}>
                          <span className="material-symbols-outlined text-sm">
                            {approveResult[opp.id].decision === "AUTO_APPROVE" ? "check_circle" :
                             approveResult[opp.id].decision === "HUMAN_REVIEW" ? "pending" : "cancel"}
                          </span>
                          {approveResult[opp.id].error ? "Error" :
                           approveResult[opp.id].decision === "AUTO_APPROVE" ? "Approved → Pipeline" :
                           approveResult[opp.id].decision === "HUMAN_REVIEW" ? "Needs Review" :
                           approveResult[opp.id].decision || "Rejected"}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleApproveBid(opp)}
                          disabled={approving === opp.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:shadow-[0_0_10px_rgba(52,211,153,0.3)] transition-all disabled:opacity-50">
                          {approving === opp.id ? (
                            <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Evaluating...</>
                          ) : (
                            <><span className="material-symbols-outlined text-sm">gavel</span> Approve Bid</>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => toggleDetails(opp.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all ${
                          expandedId === opp.id ? "border-primary/30 text-primary bg-primary/5" : "border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high"
                        }`}>
                        <span className="material-symbols-outlined text-sm">{expandedId === opp.id ? "expand_less" : "expand_more"}</span>
                        Details
                      </button>
                    </div>
                  </div>
                )}

                {/* Expandable Details Panel */}
                <div className={`grid transition-all duration-300 ease-in-out ${expandedId === opp.id ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                {expandedId === opp.id && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/10 space-y-4 animate-[fadeSlideIn_0.3s_ease-out]">
                    {/* Landed Cost Breakdown */}
                    <div>
                      <h5 className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2 font-bold">Landed Cost Breakdown</h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {[
                          { label: "Purchase", value: opp.landedCost?.purchasePriceEur },
                          { label: "Auction Fees", value: opp.landedCost?.auctionFeesEur },
                          { label: "Freight", value: opp.landedCost?.freightEur },
                          { label: "Insurance", value: opp.landedCost?.insuranceEur },
                          { label: "CIF Value", value: opp.landedCost?.cifValueEur },
                          { label: "Customs Duty", value: opp.landedCost?.customsDutyEur },
                          { label: "Import VAT", value: opp.landedCost?.importVatEur },
                          { label: "TUV", value: opp.landedCost?.tuvEstimatedEur },
                          { label: "Total Landed", value: opp.landedCost?.totalLandedCostEur },
                          { label: "Cash Outlay", value: opp.landedCost?.totalCashOutlayEur },
                        ].map((item) => (
                          <div key={item.label} className="bg-surface-container-high/30 rounded-lg p-2">
                            <p className="text-[9px] uppercase text-on-surface-variant">{item.label}</p>
                            <p className="text-xs font-bold">{fmt(item.value)}</p>
                          </div>
                        ))}
                      </div>
                      {opp.landedCost?.reclaimableVatEur > 0 && (
                        <p className="text-[10px] text-emerald-400 mt-1">Reclaimable VAT: {fmt(opp.landedCost.reclaimableVatEur)}</p>
                      )}
                    </div>

                    {/* Risk Assessment */}
                    <div>
                      <h5 className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2 font-bold">Risk Assessment ({opp.risk?.compositeLevel})</h5>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { label: "Condition", data: opp.risk?.conditionRisk },
                          { label: "Provenance", data: opp.risk?.provenanceRisk },
                          { label: "TUV", data: opp.risk?.tuvRisk },
                          { label: "Market", data: opp.risk?.marketRisk },
                          { label: "Currency", data: opp.risk?.currencyRisk },
                        ].map((r) => (
                          <div key={r.label} className="bg-surface-container-high/30 rounded-lg p-2 text-center">
                            <p className="text-[9px] uppercase text-on-surface-variant">{r.label}</p>
                            <p className={`text-sm font-bold ${RISK_STYLES[r.data?.level] || ""}`}>{r.data?.score || "—"}/3</p>
                            <p className={`text-[9px] ${RISK_STYLES[r.data?.level] || "text-on-surface-variant"}`}>{r.data?.level || "—"}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Margin Scenarios */}
                    <div>
                      <h5 className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2 font-bold">Margin Scenarios</h5>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Pessimistic (P25)", value: opp.margin?.pessimisticMargin },
                          { label: "Base (Median)", value: opp.margin?.grossMarginEur },
                          { label: "Optimistic (P75)", value: opp.margin?.optimisticMargin },
                        ].map((s) => (
                          <div key={s.label} className="bg-surface-container-high/30 rounded-lg p-2 text-center">
                            <p className="text-[9px] uppercase text-on-surface-variant">{s.label}</p>
                            <p className={`text-sm font-bold ${s.value >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* AI Deep Analysis */}
                    {da?.deep_assessment && (
                      <div>
                        <h5 className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2 font-bold">AI Deep Analysis</h5>
                        <div className="space-y-2 text-xs">
                          {da.deep_assessment.specification_analysis && (
                            <div className="p-2 rounded-lg bg-surface-container-high/30">
                              <p className="text-[9px] uppercase text-on-surface-variant mb-0.5">Spec Analysis</p>
                              <p className="text-on-surface">{da.deep_assessment.specification_analysis}</p>
                            </div>
                          )}
                          {da.deep_assessment.tuv_assessment && (
                            <div className="p-2 rounded-lg bg-surface-container-high/30">
                              <p className="text-[9px] uppercase text-on-surface-variant mb-0.5">TUV Assessment</p>
                              <p className="text-on-surface">{da.deep_assessment.tuv_assessment}</p>
                            </div>
                          )}
                          {da.deep_assessment.exit_strategy && (
                            <div className="p-2 rounded-lg bg-surface-container-high/30">
                              <p className="text-[9px] uppercase text-on-surface-variant mb-0.5">Exit Strategy</p>
                              <p className="text-on-surface">{da.deep_assessment.exit_strategy}</p>
                            </div>
                          )}
                          {da.deep_assessment.market_timing && (
                            <div className="p-2 rounded-lg bg-surface-container-high/30">
                              <p className="text-[9px] uppercase text-on-surface-variant mb-0.5">Market Timing</p>
                              <p className="text-on-surface">{da.deep_assessment.market_timing}</p>
                            </div>
                          )}
                          {da.deep_assessment.condition_concerns?.length > 0 && (
                            <div className="p-2 rounded-lg bg-red-400/5 border border-red-400/10">
                              <p className="text-[9px] uppercase text-red-400 mb-0.5">Condition Concerns</p>
                              <ul className="list-disc list-inside text-on-surface-variant">
                                {da.deep_assessment.condition_concerns.map((c, i) => <li key={i}>{c}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="flex gap-4">
                            {da.probability_of_sale_30d != null && (
                              <p className="text-on-surface-variant">Sale probability: <span className="font-bold">{(da.probability_of_sale_30d * 100).toFixed(0)}%</span> (30d) · <span className="font-bold">{(da.probability_of_sale_60d * 100).toFixed(0)}%</span> (60d)</p>
                            )}
                            {da.hold_period_estimate_days && (
                              <p className="text-on-surface-variant">Est. hold: <span className="font-bold">{da.hold_period_estimate_days}d</span></p>
                            )}
                          </div>
                          {da.bid_strategy && (
                            <p className="text-on-surface-variant"><span className="font-bold">Bid strategy:</span> {da.bid_strategy}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Orchestrator Result (after Approve) */}
                    {approveResult[opp.id]?.steps && (
                      <div>
                        <h5 className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2 font-bold">Orchestrator Decision</h5>
                        <div className="flex flex-wrap gap-1.5">
                          {approveResult[opp.id].steps.map((step, i) => (
                            <div key={i} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                              step.result === "PASS" ? "bg-emerald-400/15 text-emerald-400" :
                              step.result === "FAIL" ? "bg-red-400/15 text-red-400" :
                              "bg-amber-400/15 text-amber-400"
                            }`}>
                              {step.name}: {step.result}
                            </div>
                          ))}
                        </div>
                        {approveResult[opp.id].decisionReason && (
                          <p className="text-xs text-on-surface-variant mt-2">{approveResult[opp.id].decisionReason}</p>
                        )}
                        {approveResult[opp.id].pipelineResult && (
                          <p className="text-xs text-emerald-400 mt-1 font-bold">Vehicle added to pipeline (Stage: {approveResult[opp.id].pipelineResult.status})</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                  </div>
                </div>
              </div>
            );
          })}

          {passes.length > 0 && (
            <details className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4">
              <summary className="cursor-pointer text-sm text-on-surface-variant flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">expand_more</span>
                {passes.length} vehicles did not pass filters
              </summary>
              <div className="mt-3 space-y-2">
                {passes.map((opp) => (
                  <div key={opp.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-container-high/30 text-sm">
                    <span className="text-on-surface-variant">
                      {opp.vehicle?.make} {opp.vehicle?.model} {opp.vehicle?.year} · {opp.vehicle?.driveSide}
                      {opp.vehicle?.auctionGrade && ` · Grade ${opp.vehicle.auctionGrade}`}
                    </span>
                    <span className="text-xs text-slate-400">{opp.passReason || `Margin ${fmt(opp.margin?.grossMarginEur)} (${opp.margin?.grossMarginPct}%)`}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Scan History</h3>
          <div className="space-y-2">
            {scanHistory.slice(-5).reverse().map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30 text-sm">
                <span className="text-on-surface-variant">{new Date(s.timestamp).toLocaleString()}</span>
                <div className="flex gap-3 text-xs">
                  <span>{s.vehiclesFound} found</span>
                  <span className="text-emerald-400">{s.strongBuy} SB</span>
                  <span className="text-primary">{s.buy} B</span>
                  <span className="text-amber-400">{s.review} R</span>
                  <span className="text-slate-400">{s.pass} P</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
