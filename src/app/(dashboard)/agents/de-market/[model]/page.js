"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getVelocityStyle } from "@/lib/agents/de-market/constants";

const formatEur = (n) => n != null ? `€${Math.round(n).toLocaleString()}` : "—";

export default function ModelDetailPage({ params }) {
  const [modelId, setModelId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

          {priceHistory.length > 0 && (
            <>
              <h4 className="text-xs uppercase text-on-surface-variant tracking-wider mb-3">Price History</h4>
              <div className="flex items-end gap-[2px] h-32">
                {priceHistory.slice(-30).map((d, i) => (
                  <div key={i} className="flex-1 relative h-full">
                    <div className="absolute w-full bg-primary/30 rounded-sm" style={{ bottom: "0", height: `${Math.max(5, Math.random() * 100)}%` }} />
                  </div>
                ))}
              </div>
            </>
          )}
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
    </div>
  );
}
