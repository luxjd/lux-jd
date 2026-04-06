import Link from "next/link";
import { getLatestOpportunities, getAgentStatus, getScanHistory } from "@/lib/agents/jp-sourcing/storage";
import ScanButton from "./_components/ScanButton";

const REC_STYLES = {
  STRONG_BUY: "bg-emerald-400/15 text-emerald-400",
  BUY: "bg-primary/15 text-primary",
  REVIEW: "bg-amber-400/15 text-amber-400",
  PASS: "bg-slate-400/10 text-slate-400",
};
const RISK_STYLES = { LOW: "text-emerald-400", MEDIUM: "text-amber-400", HIGH: "text-red-400" };

export default function JpSourcingPage() {
  const status = getAgentStatus();
  const data = getLatestOpportunities();
  const history = getScanHistory();
  const opportunities = data?.opportunities || [];
  const hasData = opportunities.length > 0;

  const strongBuys = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "STRONG_BUY");
  const buys = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "BUY");
  const reviews = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "REVIEW");
  const passes = opportunities.filter((o) => (o.refinedRecommendation || o.recommendation) === "PASS");

  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "—";

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
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : status.status === "SCANNING" ? "bg-amber-400/15 text-amber-400" : "bg-slate-400/10 text-slate-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : status.status === "SCANNING" ? "bg-amber-400 animate-pulse" : "bg-slate-400"}`} />
                  {status.status || "IDLE"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Scans Japanese auctions → evaluates candidates → recommends BUY/REVIEW/PASS
                {status.lastScanTimestamp && ` · Last scan: ${new Date(status.lastScanTimestamp).toLocaleString()}`}
              </p>
            </div>
          </div>
          <ScanButton />
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
                  {/* Vehicle info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-headline text-base sm:text-lg font-bold">{opp.vehicle?.make} {opp.vehicle?.model}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${REC_STYLES[rec]}`}>{rec?.replace("_", " ")}</span>
                      <span className={`text-[10px] font-bold uppercase ${RISK_STYLES[opp.risk?.compositeLevel]}`}>{opp.risk?.compositeLevel} RISK ({opp.risk?.compositeScore})</span>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      {opp.vehicle?.year} · {opp.vehicle?.mileageKm?.toLocaleString()} km · {opp.vehicle?.driveSide} · {opp.vehicle?.exteriorColor} · Grade {opp.vehicle?.auctionGrade}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {opp.source?.auctionHouse} · Lot {opp.source?.lotNumber} · {opp.vehicle?.serviceHistory?.replace("_", " ")}
                      {opp.vehicle?.accidentHistory && <span className="text-red-400 ml-1">· ACCIDENT</span>}
                    </p>
                    {opp.vehicle?.conditionNotes && (
                      <p className="text-xs text-on-surface-variant mt-1 italic">&quot;{opp.vehicle.conditionNotes}&quot;</p>
                    )}
                    {da?.deep_assessment?.investment_thesis && (
                      <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-xs text-primary"><span className="font-bold">AI Thesis:</span> {da.deep_assessment.investment_thesis}</p>
                      </div>
                    )}
                  </div>

                  {/* Financials */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">JP Price</p>
                      <p className="font-headline font-bold text-sm">¥{opp.pricing?.askingPriceJpy?.toLocaleString()}</p>
                      <p className="text-[10px] text-on-surface-variant">{fmt(opp.pricing?.askingPriceEur)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">DE Value</p>
                      <p className="font-headline font-bold text-sm">{fmt(opp.pricing?.deMarketMedian)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Landed</p>
                      <p className="font-headline font-bold text-sm">{fmt(opp.landedCost?.totalLandedCostEur)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-primary tracking-wider">Margin</p>
                      <p className="font-headline font-bold text-lg text-primary">{fmt(opp.margin?.grossMarginEur)}</p>
                      <p className="text-[10px] text-primary">{opp.margin?.grossMarginPct}%</p>
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

                {/* Max bid + actions */}
                {opp.maxBidJpy && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-3 pt-3 border-t border-outline-variant/10 gap-2">
                    <p className="text-xs text-on-surface-variant">
                      Max bid: <span className="font-bold text-secondary">¥{opp.maxBidJpy.toLocaleString()}</span>
                      {da?.suggested_bid_jpy && <span className="ml-2">· AI suggests: <span className="font-bold text-primary">¥{da.suggested_bid_jpy.toLocaleString()}</span></span>}
                    </p>
                    <div className="flex gap-2">
                      <button className="px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:shadow-[0_0_10px_rgba(248,113,113,0.3)] transition-all">
                        Approve Bid
                      </button>
                      <button className="px-3 py-1.5 border border-outline-variant/20 text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-container-high transition-all">
                        Details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Passed vehicles (collapsed) */}
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
                      {opp.vehicle?.make} {opp.vehicle?.model} {opp.vehicle?.year} · {opp.vehicle?.driveSide} · Grade {opp.vehicle?.auctionGrade}
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
      {history.scans?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Scan History</h3>
          <div className="space-y-2">
            {history.scans.slice(-5).reverse().map((s, i) => (
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
