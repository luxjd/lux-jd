import Link from "next/link";
import { trackedModels, priceHistories, competitors } from "@/lib/agents/de-market/mock-data";
import { getVelocityStyle, getFreshnessStatus } from "@/lib/agents/de-market/constants";
import { formatEur } from "@/lib/agents/de-market/utils";

export default async function ModelDetailPage({ params }) {
  const { model: modelId } = await params;
  const m = trackedModels.find((t) => t.id === modelId);

  if (!m) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-variant">Model not found</p>
        <Link href="/agents/de-market" className="text-primary text-sm mt-2 inline-block">Back to DE Market Agent</Link>
      </div>
    );
  }

  const vel = getVelocityStyle(m.demand.velocityScore);
  const freshness = getFreshnessStatus(m.pricing.dataFreshnessHours);
  const history = priceHistories[modelId] || [];
  const last30 = history.slice(-30);
  const maxPrice = Math.max(...last30.map((d) => d.p75));
  const minPrice = Math.min(...last30.map((d) => d.p25));
  const range = maxPrice - minPrice || 1;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link href="/agents/de-market" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> DE Market Agent
      </Link>

      {/* Model Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-3xl font-bold">{m.make} {m.model}</h2>
            <p className="text-on-surface-variant mt-1">{m.yearRange[0]}-{m.yearRange[1]} &middot; {m.segment} &middot; LHD &middot; Max {formatEur(m.pricing.maxEur)}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${freshness.dot}`} />
              <span className={`text-sm font-bold ${freshness.color}`}>{freshness.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(65,71,84,0.3)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke={m.confidence >= 0.85 ? "#34d399" : m.confidence >= 0.7 ? "#fbbf24" : "#f87171"} strokeWidth="3" strokeDasharray={`${m.confidence * 88} 88`} strokeLinecap="round" />
              </svg>
              <span className="font-headline font-bold">{(m.confidence * 100).toFixed(0)}% conf</span>
            </div>
          </div>
        </div>
      </div>

      {/* Price Overview + Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Price Card */}
        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Price Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Median</p>
              <p className="font-headline text-2xl font-bold">{formatEur(m.pricing.medianEur)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">P25 - P75</p>
              <p className="font-headline text-lg font-bold">{formatEur(m.pricing.p25Eur)} - {formatEur(m.pricing.p75Eur)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Sample</p>
              <p className="font-headline text-lg font-bold">{m.pricing.sampleSize} listings</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-primary tracking-wider">Max Landed Cost</p>
              <p className="font-headline text-lg font-bold text-primary">{formatEur(m.recommendedMaxLandedCost)}</p>
            </div>
          </div>

          {/* 30-Day Price Chart (CSS bars) */}
          <h4 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">30-Day Price Trend</h4>
          <div className="flex items-end gap-[2px] h-32">
            {last30.map((d, i) => {
              const barBottom = ((d.p25 - minPrice) / range) * 100;
              const barHeight = ((d.p75 - d.p25) / range) * 100;
              const medianPos = ((d.median - minPrice) / range) * 100;
              return (
                <div key={i} className="flex-1 relative h-full group">
                  <div
                    className="absolute w-full bg-primary/20 rounded-sm transition-all group-hover:bg-primary/40"
                    style={{ bottom: `${barBottom}%`, height: `${Math.max(barHeight, 2)}%` }}
                  />
                  <div
                    className="absolute w-full h-[2px] bg-primary rounded"
                    style={{ bottom: `${medianPos}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Demand Card */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Demand Analysis</h3>
          <div className="space-y-5">
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-1">Velocity Score</p>
              <div className="flex items-center gap-3">
                <p className="font-headline text-4xl font-bold">{m.demand.velocityScore}</p>
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${vel.bg} ${vel.color}`}>{vel.label}</span>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Avg Days on Market", value: `${m.demand.avgDaysOnMarket}d` },
                { label: "Sales Last 30d", value: m.demand.salesLast30d },
                { label: "New Listings (7d)", value: m.demand.newListingsLast7d },
                { label: "Inquiry Rate", value: m.demand.inquiryRate },
                { label: "Price Resilience", value: m.demand.priceResilience },
              ].map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-sm text-on-surface-variant">{d.label}</span>
                  <span className="text-sm font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Spec Premiums */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Color Premiums */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Color Premiums</h3>
          <div className="space-y-2">
            {Object.entries(m.specPremiums.colors).map(([color, mod]) => (
              <div key={color} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <span className="text-sm">{color}</span>
                <span className={`text-sm font-bold ${mod >= 1.0 ? "text-emerald-400" : "text-red-400"}`}>
                  {mod >= 1.0 ? "+" : ""}{((mod - 1) * 100).toFixed(0)}%
                  <span className="text-on-surface-variant font-normal ml-1">
                    ({mod >= 1.0 ? "+" : ""}{formatEur(Math.round((mod - 1) * m.pricing.medianEur))})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Option Premiums */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Option Premiums</h3>
          <div className="space-y-2">
            {Object.entries(m.specPremiums.options).map(([opt, data]) => (
              <div key={opt} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <span className="text-sm">{opt}</span>
                <span className="text-sm font-bold text-emerald-400">
                  +{formatEur(data.eur)}
                  <span className="text-on-surface-variant font-normal ml-1">(+{((data.mod - 1) * 100).toFixed(0)}%)</span>
                </span>
              </div>
            ))}
          </div>
          {m.specPremiums.avoid.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-red-400/5 border border-red-400/10">
              <p className="text-xs font-bold text-red-400 mb-1">Avoid Specs</p>
              <p className="text-xs text-red-400/80">{m.specPremiums.avoid.join(" &middot; ")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Target Vehicle Report */}
      <div className="bg-surface-container rounded-2xl border border-primary/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">description</span>
          <h3 className="font-headline font-bold text-lg">Target Vehicle Report</h3>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">ACTIVE</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-container-high/30">
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Recommended Max Landed Cost</p>
            <p className="font-headline text-xl font-bold text-primary">{formatEur(m.recommendedMaxLandedCost)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Minimum Acceptable Margin</p>
            <p className="font-headline text-xl font-bold text-secondary">{formatEur(m.minimumMargin)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Confidence</p>
            <p className="font-headline text-xl font-bold">{(m.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-3">
          This report feeds into the JP Sourcing Agent. Vehicles matching this spec with landed cost below {formatEur(m.recommendedMaxLandedCost)} and margin above {formatEur(m.minimumMargin)} will be flagged as opportunities.
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-sm">schedule</span>
          Generated {new Date(m.lastUpdated).toLocaleString()} &middot; Valid for 12 hours
        </div>
      </div>

      {/* Data Sources */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Data Sources</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(m.dataSources).map(([source, count]) => (
            <div key={source} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
              <span className="text-sm">{source}</span>
              <span className="font-headline font-bold text-sm">{count} listings</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
