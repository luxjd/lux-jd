import Link from "next/link";
import { agentStatus, trackedModels, competitors, scanLog } from "@/lib/agents/de-market/mock-data";
import { getVelocityStyle, getFreshnessStatus } from "@/lib/agents/de-market/constants";
import { formatEur, hoursSince } from "@/lib/agents/de-market/utils";
import AgentStatusHeader from "./_components/AgentStatusHeader";

export default function DeMarketAgentPage() {
  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Status Header */}
      <AgentStatusHeader status={agentStatus} />

      {/* Tracked Models Grid */}
      <div>
        <h3 className="font-headline font-bold text-lg mb-4">Tracked Models ({trackedModels.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trackedModels.map((m) => {
            const vel = getVelocityStyle(m.demand.velocityScore);
            const freshness = getFreshnessStatus(m.pricing.dataFreshnessHours);
            const trendIcon = m.trend.direction === "APPRECIATING" ? "trending_up" : m.trend.direction === "DEPRECIATING" ? "trending_down" : "trending_flat";
            const trendColor = m.trend.direction === "APPRECIATING" ? "text-emerald-400" : m.trend.direction === "DEPRECIATING" ? "text-red-400" : "text-on-surface-variant";

            return (
              <Link
                key={m.id}
                href={`/agents/de-market/${m.id}`}
                className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 hover:border-primary/30 transition-all group"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-headline font-bold group-hover:text-primary transition-colors">{m.make} {m.model}</h4>
                    <p className="text-[10px] text-on-surface-variant">{m.yearRange[0]}-{m.yearRange[1]} &middot; {m.segment}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${freshness.dot}`} />
                    <span className={`text-[10px] ${freshness.color}`}>{freshness.label}</span>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-3">
                  <p className="font-headline text-2xl font-bold">{formatEur(m.pricing.medianEur)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-on-surface-variant">{formatEur(m.pricing.p25Eur)} - {formatEur(m.pricing.p75Eur)}</span>
                    <span className={`flex items-center gap-0.5 text-xs font-bold ${trendColor}`}>
                      <span className="material-symbols-outlined text-sm">{trendIcon}</span>
                      {m.trend.change30dPct > 0 ? "+" : ""}{m.trend.change30dPct}%
                    </span>
                  </div>
                </div>

                {/* Price range bar */}
                <div className="relative h-2 bg-surface-container-high rounded-full mb-4 overflow-hidden">
                  <div
                    className="absolute h-full bg-primary/30 rounded-full"
                    style={{
                      left: `${((m.pricing.p25Eur - m.pricing.minEur) / (m.pricing.maxEur - m.pricing.minEur)) * 100}%`,
                      width: `${((m.pricing.p75Eur - m.pricing.p25Eur) / (m.pricing.maxEur - m.pricing.minEur)) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute w-1.5 h-full bg-primary rounded-full"
                    style={{ left: `${((m.pricing.medianEur - m.pricing.minEur) / (m.pricing.maxEur - m.pricing.minEur)) * 100}%` }}
                  />
                </div>

                {/* Bottom metrics */}
                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${vel.bg}`}>
                    <span className={`text-[10px] font-bold ${vel.color}`}>
                      {m.demand.velocityScore} — {vel.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Confidence ring */}
                    <svg width="28" height="28" viewBox="0 0 36 36" className="-rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(65,71,84,0.3)" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="14" fill="none"
                        stroke={m.confidence >= 0.85 ? "#34d399" : m.confidence >= 0.7 ? "#fbbf24" : "#f87171"}
                        strokeWidth="3" strokeDasharray={`${m.confidence * 88} 88`} strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[10px] font-bold">{(m.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant">{m.pricing.sampleSize} listings</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom: Competitors + Scan Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Competitors */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Competitor Intelligence</h3>
          <div className="space-y-3">
            {competitors.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <div>
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-on-surface-variant">{c.location} &middot; {c.focus}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="font-bold">{c.inventory}</p>
                    <p className="text-on-surface-variant">vehicles</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">{formatEur(c.avgPrice)}</p>
                    <p className="text-on-surface-variant">avg</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    c.threatLevel === "HIGH" ? "bg-red-400/15 text-red-400" :
                    c.threatLevel === "MEDIUM" ? "bg-amber-400/15 text-amber-400" :
                    "bg-emerald-400/15 text-emerald-400"
                  }`}>
                    {c.threatLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scan Log */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Recent Scans</h3>
          <div className="space-y-2">
            {scanLog.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${s.status === "SUCCESS" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <div>
                    <p className="text-sm font-medium">{s.source}</p>
                    <p className="text-xs text-on-surface-variant">{new Date(s.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-on-surface-variant">
                  <span>{s.listingsScanned} scanned</span>
                  <span className="text-primary font-bold">+{s.newFound} new</span>
                  <span>{s.priceChanges} changes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
