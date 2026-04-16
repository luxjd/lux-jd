import Link from "next/link";
import { getLatestOpportunities } from "@/lib/agents/jp-sourcing/storage";

const REC_STYLES = {
  STRONG_BUY: "bg-emerald-400/15 text-emerald-400",
  BUY: "bg-primary/15 text-primary",
  REVIEW: "bg-amber-400/15 text-amber-400",
  PASS: "bg-slate-400/10 text-slate-400",
};
const RISK_STYLES = { LOW: "bg-emerald-400/10 text-emerald-400", MEDIUM: "bg-amber-400/10 text-amber-400", HIGH: "bg-red-400/10 text-red-400" };

export default async function OpportunitiesPage() {
  const realData = await getLatestOpportunities();
  const hasRealData = realData?.opportunities?.length > 0;

  // Use real data from JP Sourcing Agent
  const opportunities = hasRealData
    ? realData.opportunities.filter((o) => o.recommendation !== "PASS").map((o) => ({
        id: o.id,
        make: o.vehicle?.make,
        model: o.vehicle?.model,
        year: o.vehicle?.year,
        mileage: o.vehicle?.mileageKm,
        color: o.vehicle?.exteriorColor,
        grade: o.vehicle?.auctionGrade,
        driveSide: o.vehicle?.driveSide,
        auctionHouse: o.source?.auctionHouse,
        auctionDate: o.source?.auctionDate || realData.scanSummary?.auctionDate,
        jpPriceJpy: o.pricing?.askingPriceJpy,
        jpPriceEur: o.pricing?.askingPriceEur,
        estimatedDeValue: o.pricing?.deMarketMedian,
        landedCost: o.landedCost?.totalLandedCostEur,
        marginEur: o.margin?.grossMarginEur,
        spreadPct: o.margin?.spreadPct,
        confidence: o.confidence,
        recommendation: o.refinedRecommendation || o.recommendation,
        riskLevel: o.risk?.compositeLevel,
        riskScore: o.risk?.compositeScore,
        conditionNotes: o.vehicle?.conditionNotes,
        thesis: o.deepAnalysis?.deep_assessment?.investment_thesis,
      }))
    : [];

  const fmt = (n) => n != null ? `€${n.toLocaleString()}` : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-on-surface-variant text-sm">{opportunities.length} opportunities {hasRealData ? "from JP Sourcing Agent" : "— run a scan to find opportunities"}</p>
          {realData?.scannedAt && <p className="text-[10px] text-on-surface-variant">Last scan: {new Date(realData.scannedAt).toLocaleString()}</p>}
        </div>
        <div className="flex items-center gap-3">
          {hasRealData && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-xs font-bold">
              <span className="material-symbols-outlined text-sm">auto_awesome</span> AI-Powered
            </span>
          )}
          <Link href="/agents/jp-sourcing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary text-xs font-bold hover:bg-secondary/20 transition-all">
            <span className="material-symbols-outlined text-sm">travel_explore</span> Open Agent
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {opportunities.map((opp) => {
          const rec = opp.recommendation || "BUY";
          return (
            <div key={opp.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5 hover:border-primary/30 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-headline text-base sm:text-lg font-bold">{opp.make} {opp.model}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${REC_STYLES[rec]}`}>{rec.replace("_", " ")}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${RISK_STYLES[opp.riskLevel] || RISK_STYLES.MEDIUM}`}>{opp.riskLevel || "MEDIUM"} RISK</span>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {opp.year} · {(opp.mileage || opp.mileageKm || 0).toLocaleString()} km · {opp.driveSide || "LHD"} · {opp.color} · Grade {opp.grade || opp.auctionGrade || "N/A"}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">{opp.auctionHouse} · {opp.auctionDate || "Upcoming"}</p>
                  {opp.thesis && (
                    <p className="text-xs text-primary mt-1 italic">{opp.thesis}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">JP Price</p>
                    <p className="font-headline font-bold text-sm">{opp.jpPriceJpy ? `¥${opp.jpPriceJpy.toLocaleString()}` : fmt(opp.jpPriceEur)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">DE Value</p>
                    <p className="font-headline font-bold text-sm">{fmt(opp.estimatedDeValue)}</p>
                  </div>
                  {opp.landedCost && (
                    <div className="text-center">
                      <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Landed</p>
                      <p className="font-headline font-bold text-sm">{fmt(opp.landedCost)}</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className={`text-[10px] uppercase tracking-wider ${opp.marginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>Margin</p>
                    <p className={`font-headline font-bold text-lg ${opp.marginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(opp.marginEur)}</p>
                    <p className={`text-[10px] ${opp.marginEur >= 0 ? "text-emerald-400" : "text-red-400"}`}>{opp.spreadPct}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Conf</p>
                    <div className="w-10 h-10 mx-auto">
                      <svg viewBox="0 0 36 36" className="-rotate-90">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(65,71,84,0.3)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke={(opp.confidence || 0) >= 0.80 ? "#34d399" : "#fbbf24"} strokeWidth="3" strokeDasharray={`${(opp.confidence || 0.8) * 88} 88`} strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-[10px] font-bold">{((opp.confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:shadow-[0_0_15px_rgba(248,113,113,0.3)] transition-all">Approve</button>
                  <button className="px-4 py-2 border border-outline-variant/20 text-on-surface-variant rounded-xl text-sm font-bold hover:bg-surface-container-high transition-all">Review</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
