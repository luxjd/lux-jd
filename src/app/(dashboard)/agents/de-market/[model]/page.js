"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getVelocityStyle } from "@/lib/agents/de-market/constants";
import { formatEur, formatEurCompact } from "@/lib/format";

export default function ModelDetailPage({ params }) {
  const [modelId, setModelId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidJpy, setBidJpy] = useState("");

  useEffect(() => {
    params.then((p) => {
      setModelId(p.model);
      fetch(`/api/agents/de-market/reports/${p.model}`)
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [params]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  }

  if (!data || data.error) {
    return (
      <div className="text-center py-20">
        <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-4 block">info</span>
        <p className="text-on-surface-variant mb-2">No data available for this model</p>
        <p className="text-on-surface-variant text-sm mb-4">Run a market scan from the DE Market Agent to generate reports.</p>
        <Link href="/agents/de-market" className="text-primary text-sm font-bold">Back to DE Market Agent</Link>
      </div>
    );
  }

  const spec = data.vehicleSpec || {};
  const market = data.marketValue || {};
  const demand = data.demand || {};
  const thresholds = data.financialThresholds || {};
  const priceHistory = data.priceHistory || [];
  const vel = demand.velocityScore ? getVelocityStyle(demand.velocityScore) : null;
  const confidence = data.confidence || 0;
  const listings = data.comparableListings || data.scanData?.comparable_listings || [];
  const specPremiums = data.scanData?.spec_premiums || {};
  const bySpec = data.scanData?.comparables_by_spec || {};

  return (
    <div className="space-y-6">
      <Link href="/agents/de-market" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> DE Market Agent
      </Link>

      {/* Model Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-3xl font-bold">{spec.make} {spec.model}</h2>
            <p className="text-on-surface-variant mt-1">
              {spec.yearRange?.[0]}-{spec.yearRange?.[1]} &middot; {data.aiPowered ? "AI-powered" : ""}
            </p>
          </div>
          <span className="font-headline font-bold text-lg">{(confidence * 100).toFixed(0)}% confidence</span>
        </div>
      </div>

      {/* Price Overview + Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Price Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Median</p>
              <p className="font-headline text-2xl font-bold">{formatEur(market.medianEur)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">P25 - P75</p>
              <p className="font-headline text-lg font-bold">{formatEur(market.p25Eur)} - {formatEur(market.p75Eur)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Sample</p>
              <p className="font-headline text-lg font-bold">{market.sampleSize || "—"} listings</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-primary tracking-wider">Max Landed Cost</p>
              <p className="font-headline text-lg font-bold text-primary">{formatEur(thresholds.recommendedMaxLandedCostEur)}</p>
            </div>
          </div>

          {priceHistory.length > 0 && (() => {
            const prices = priceHistory.slice(-30).map((d) => d.median || d.price || 0).filter(Boolean);
            if (prices.length === 0) return null;
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            const range = maxP - minP || 1;
            return (
              <>
                <h4 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">Price History (last {prices.length} scans)</h4>
                <div className="flex items-end gap-[2px] h-32">
                  {prices.map((price, i) => {
                    const pct = ((price - minP) / range) * 80 + 15; // 15-95% height
                    return (
                      <div key={i} className="flex-1 relative h-full group">
                        <div className="absolute w-full bg-primary/30 hover:bg-primary/60 rounded-sm transition-colors" style={{ bottom: "0", height: `${pct}%` }} />
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap z-10">
                          {formatEur(price)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-on-surface-variant">{formatEur(minP)}</span>
                  <span className="text-[9px] text-on-surface-variant">{formatEur(maxP)}</span>
                </div>
              </>
            );
          })()}
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Demand Analysis</h3>
          <div className="space-y-5">
            {vel && (
              <div>
                <p className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-1">Velocity Score</p>
                <div className="flex items-center gap-3">
                  <p className="font-headline text-4xl font-bold">{demand.velocityScore}</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${vel.bg} ${vel.color}`}>{vel.label}</span>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {[
                { label: "Avg Days on Market", value: demand.avgDaysOnMarket ? `${demand.avgDaysOnMarket}d` : "—" },
                { label: "Inquiry Rate", value: demand.inquiryRate || "—" },
                { label: "Price Resilience", value: demand.priceResilience || "—" },
              ].map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-sm text-on-surface-variant">{d.label}</span>
                  <span className="text-sm font-bold">{d.value}</span>
                </div>
              ))}
            </div>

            {/* Trend Windows */}
            {(demand.trendDirection || demand.change7dPct != null) && (
              <div className="pt-3 border-t border-outline-variant/10">
                <p className="text-[10px] uppercase text-on-surface-variant tracking-wider mb-2">Price Trend</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`material-symbols-outlined text-sm ${demand.trendDirection === "APPRECIATING" ? "text-emerald-400" : demand.trendDirection === "DEPRECIATING" ? "text-red-400" : "text-on-surface-variant"}`}>
                    {demand.trendDirection === "APPRECIATING" ? "trending_up" : demand.trendDirection === "DEPRECIATING" ? "trending_down" : "trending_flat"}
                  </span>
                  <span className="text-sm font-bold">{demand.trendDirection || "—"}</span>
                  {demand.seasonalFactor && demand.seasonalFactor !== "NEUTRAL" && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${demand.seasonalFactor === "POSITIVE" ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400"}`}>{demand.seasonalFactor}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "7d", value: demand.change7dPct },
                    { label: "30d", value: demand.change30dPct },
                    { label: "90d", value: demand.change90dPct },
                  ].map((t) => (
                    <div key={t.label} className="bg-surface-container-high/30 rounded-lg p-2 text-center">
                      <p className="text-[9px] uppercase text-on-surface-variant">{t.label}</p>
                      <p className={`text-sm font-bold ${t.value > 0 ? "text-emerald-400" : t.value < 0 ? "text-red-400" : ""}`}>
                        {t.value != null ? `${t.value > 0 ? "+" : ""}${t.value}%` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Target Vehicle Report */}
      <div className="bg-surface-container rounded-2xl border border-primary/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">description</span>
          <h3 className="font-headline font-bold text-lg">Target Vehicle Report</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-container-high/30">
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Recommended Max Landed Cost</p>
            <p className="font-headline text-xl font-bold text-primary">{formatEur(thresholds.recommendedMaxLandedCostEur)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Minimum Acceptable Margin</p>
            <p className="font-headline text-xl font-bold text-secondary">{formatEur(thresholds.minimumAcceptableMarginEur)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-on-surface-variant tracking-wider">Confidence</p>
            <p className="font-headline text-xl font-bold">{(confidence * 100).toFixed(0)}%</p>
          </div>
        </div>
        {data.generatedAt && (
          <div className="flex items-center gap-2 mt-3 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm">schedule</span>
            Generated {new Date(data.generatedAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* P0: Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href={`/agents/valuation?make=${encodeURIComponent(spec.make || "")}&model=${encodeURIComponent(spec.model || "")}`} className="flex items-center gap-3 bg-surface-container rounded-xl border border-outline-variant/10 p-4 hover:border-primary/30 transition-colors">
          <span className="material-symbols-outlined text-primary">calculate</span>
          <div><p className="text-sm font-bold">Valuate a {spec.model}</p><p className="text-xs text-on-surface-variant">Open Valuation Agent</p></div>
        </Link>
        <Link href="/agents/jp-sourcing" className="flex items-center gap-3 bg-surface-container rounded-xl border border-outline-variant/10 p-4 hover:border-primary/30 transition-colors">
          <span className="material-symbols-outlined text-secondary">travel_explore</span>
          <div><p className="text-sm font-bold">Find in Japan</p><p className="text-xs text-on-surface-variant">JP Sourcing Agent</p></div>
        </Link>
        <button onClick={() => { fetch(`/api/agents/de-market/scan-model?id=${modelId}`); window.location.reload(); }} className="flex items-center gap-3 bg-surface-container rounded-xl border border-outline-variant/10 p-4 hover:border-primary/30 transition-colors text-left">
          <span className="material-symbols-outlined text-tertiary">refresh</span>
          <div><p className="text-sm font-bold">Rescan Now</p><p className="text-xs text-on-surface-variant">Refresh market data</p></div>
        </button>
        <div className="flex items-center gap-3 bg-surface-container rounded-xl border border-outline-variant/10 p-4">
          <span className="material-symbols-outlined text-on-surface-variant">schedule</span>
          <div><p className="text-sm font-bold">Last Scan</p><p className="text-xs text-on-surface-variant">{data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "Never"}</p></div>
        </div>
      </div>

      {/* P0: FX Margin Calculator */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">currency_exchange</span>
          <h3 className="font-headline font-bold text-lg">Margin Calculator</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs uppercase text-on-surface-variant tracking-wider block mb-2">Japanese Auction Price (JPY)</label>
            <input
              type="number"
              placeholder="e.g. 28000000"
              value={bidJpy}
              onChange={(e) => setBidJpy(e.target.value)}
              className="w-full bg-surface-container-high border border-outline-variant/20 rounded-xl px-4 py-3 text-lg font-mono focus:border-primary/50 focus:outline-none"
            />
            <p className="text-xs text-on-surface-variant mt-1">Enter the auction asking price or your max bid</p>
          </div>
          {bidJpy && Number(bidJpy) > 0 && (() => {
            const rate = 186.88;
            const purchaseEur = Math.round(Number(bidJpy) / rate);
            const landedCosts = Math.round(purchaseEur * 0.25);
            const totalLanded = purchaseEur + landedCosts;
            const salePrice = Math.round(market.medianEur || 0);
            const margin = salePrice - totalLanded;
            const marginPct = salePrice > 0 ? ((margin / salePrice) * 100).toFixed(1) : 0;
            const isBuy = margin >= 15000 && marginPct >= 20;
            return (
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-on-surface-variant">Purchase (at ¥{rate}/€)</span><span className="font-mono">{formatEur(purchaseEur)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-on-surface-variant">+ Estimated landed costs (~25%)</span><span className="font-mono">{formatEur(landedCosts)}</span></div>
                <div className="flex justify-between text-sm border-t border-outline-variant/10 pt-2"><span className="text-on-surface-variant font-bold">Total Landed</span><span className="font-mono font-bold">{formatEur(totalLanded)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-on-surface-variant">Est. Sale Price (median)</span><span className="font-mono">{formatEur(salePrice)}</span></div>
                <div className={`flex justify-between text-lg border-t border-outline-variant/10 pt-2 font-bold ${margin >= 15000 ? "text-emerald-400" : "text-red-400"}`}>
                  <span>Gross Margin</span>
                  <span>{formatEur(margin)} ({marginPct}%)</span>
                </div>
                <div className={`text-center py-2 rounded-lg text-sm font-bold ${isBuy ? "bg-emerald-400/15 text-emerald-400" : margin > 0 ? "bg-amber-400/15 text-amber-400" : "bg-red-400/15 text-red-400"}`}>
                  {isBuy ? "BUY — Meets margin thresholds" : margin > 0 ? "REVIEW — Margin below €15k or 20%" : "PASS — Negative margin"}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* P0: Color & Spec Premium Analysis */}
      {(Object.keys(specPremiums.colors || {}).length > 0 || Object.keys(specPremiums.options || {}).length > 0) && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-secondary">palette</span>
            <h3 className="font-headline font-bold text-lg">Specification Premiums</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.keys(specPremiums.colors || {}).length > 0 && (
              <div>
                <h4 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">Color Premiums</h4>
                <div className="space-y-1.5">
                  {Object.entries(specPremiums.colors)
                    .sort(([, a], [, b]) => (typeof b === "number" ? b : b?.modifier || 1) - (typeof a === "number" ? a : a?.modifier || 1))
                    .map(([color, val]) => {
                      const modifier = typeof val === "number" ? val : val?.modifier || 1;
                      const pct = ((modifier - 1) * 100).toFixed(0);
                      const isPositive = modifier > 1;
                      const isNeutral = modifier === 1;
                      return (
                        <div key={color} className="flex items-center justify-between text-sm py-1 px-2 rounded-lg hover:bg-surface-container-high/30">
                          <span>{color}</span>
                          <span className={`font-mono font-bold ${isPositive ? "text-emerald-400" : isNeutral ? "text-on-surface-variant" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}{pct}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            {Object.keys(specPremiums.options || {}).length > 0 && (
              <div>
                <h4 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">Option Premiums</h4>
                <div className="space-y-1.5">
                  {Object.entries(specPremiums.options)
                    .filter(([k]) => k !== "low_mileage" && k !== "scheckheftgepflegt")
                    .sort(([, a], [, b]) => (b?.premium_eur || 0) - (a?.premium_eur || 0))
                    .slice(0, 10)
                    .map(([option, val]) => (
                      <div key={option} className="flex items-center justify-between text-sm py-1 px-2 rounded-lg hover:bg-surface-container-high/30">
                        <span>{option}</span>
                        <span className="font-mono font-bold text-emerald-400">+{formatEur(val?.premium_eur || 0)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* P0: Comparable Listings Table */}
      {listings.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">list</span>
              <h3 className="font-headline font-bold text-lg">Comparable Listings ({listings.length})</h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                  <th className="text-left py-2 pr-4">Price</th>
                  <th className="text-left py-2 pr-4">Mileage</th>
                  <th className="text-left py-2 pr-4">Year</th>
                  <th className="text-left py-2 pr-4">Color</th>
                  <th className="text-left py-2 pr-4">Platform</th>
                  <th className="text-left py-2 pr-4">Dealer</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {listings
                  .sort((a, b) => (a.price_eur || 0) - (b.price_eur || 0))
                  .map((l, i) => (
                    <tr key={i} className="border-b border-outline-variant/5 hover:bg-surface-container-high/20">
                      <td className="py-2.5 pr-4 font-mono font-bold">{l.price_eur ? formatEur(l.price_eur) : "—"}</td>
                      <td className="py-2.5 pr-4 font-mono text-on-surface-variant">{l.mileage_km ? `${(l.mileage_km / 1000).toFixed(0)}k km` : "—"}</td>
                      <td className="py-2.5 pr-4">{l.year || "—"}</td>
                      <td className="py-2.5 pr-4 text-on-surface-variant">{l.color || "—"}</td>
                      <td className="py-2.5 pr-4"><span className="px-1.5 py-0.5 rounded text-xs bg-surface-container-high">{l.platform || "—"}</span></td>
                      <td className="py-2.5 pr-4 text-on-surface-variant text-xs">{l.dealer_name || "—"}</td>
                      <td className="py-2.5 text-right">
                        {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">View &rarr;</a>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* P1: Year Breakdown */}
      {bySpec?.byColor && Object.keys(bySpec.byColor).length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-tertiary">bar_chart</span>
            <h3 className="font-headline font-bold text-lg">Price by Color</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(bySpec.byColor)
              .sort(([, a], [, b]) => (b.median || 0) - (a.median || 0))
              .map(([color, stats]) => (
                <div key={color} className="bg-surface-container-high/30 rounded-xl p-3">
                  <p className="text-sm font-bold mb-1">{color}</p>
                  <p className="font-mono text-lg font-bold">{formatEurCompact(stats.median)}</p>
                  <p className="text-xs text-on-surface-variant">{stats.count} listing{stats.count !== 1 ? "s" : ""} &middot; {formatEurCompact(stats.min)}-{formatEurCompact(stats.max)}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
