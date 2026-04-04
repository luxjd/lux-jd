import { opportunities } from "@/lib/mock-data";

export default function OpportunitiesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant text-sm">{opportunities.length} opportunities from JP Sourcing Agent</p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high/50 border border-outline-variant/10">
          <span className="material-symbols-outlined text-amber-400 text-sm animate-pulse">radar</span>
          <span className="text-xs text-on-surface-variant">Live scanning</span>
        </div>
      </div>

      <div className="grid gap-4">
        {opportunities.map((opp) => (
          <div key={opp.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 hover:border-primary/30 transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Vehicle info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-headline text-lg font-bold">{opp.make} {opp.model}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    opp.recommendation === "STRONG_BUY" ? "bg-emerald-400/15 text-emerald-400" :
                    opp.recommendation === "BUY" ? "bg-primary/15 text-primary" :
                    "bg-amber-400/15 text-amber-400"
                  }`}>
                    {opp.recommendation.replace("_", " ")}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    opp.riskLevel === "LOW" ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"
                  }`}>
                    {opp.riskLevel} RISK
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  {opp.year} &middot; {opp.mileage.toLocaleString()} km &middot; {opp.color} &middot; Grade {opp.grade}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  {opp.auctionHouse} &middot; Auction {opp.auctionDate}
                </p>
              </div>

              {/* Financials */}
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">JP Price</p>
                  <p className="font-headline font-bold">€{opp.jpPriceEur.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">DE Value</p>
                  <p className="font-headline font-bold">€{opp.estimatedDeValue.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase text-primary tracking-wider">Spread</p>
                  <p className="font-headline font-bold text-primary text-lg">{opp.spreadPct}%</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Confidence</p>
                  <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center">
                    <span className="font-headline font-bold text-sm text-primary">{(opp.confidence * 100).toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0">
                <button className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:shadow-[0_0_15px_rgba(173,198,255,0.3)] transition-all">
                  Approve
                </button>
                <button className="px-4 py-2 border border-outline-variant/20 text-on-surface-variant rounded-xl text-sm font-bold hover:bg-surface-container-high transition-all">
                  Review
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
