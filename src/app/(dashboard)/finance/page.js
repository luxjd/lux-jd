"use client";

import { useState, useEffect } from "react";

export default function FinancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents/finance/pnl").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/finance/fx").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/finance/tax").then((r) => r.json()).catch(() => null),
    ]).then(([pnl, fx, tax]) => {
      setData({ pnl, fx, tax });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  }

  const portfolio = data?.pnl?.portfolio || {};
  const fx = data?.fx || {};
  const soldVehicles = data?.pnl?.soldVehicles || [];
  const fmt = (n) => n != null ? `€${Math.round(n).toLocaleString()}` : "—";

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Total Revenue", value: portfolio.totalRevenue ? `€${(portfolio.totalRevenue / 1000).toFixed(0)}K` : "—", icon: "payments", color: "text-secondary" },
          { label: "Gross Margin", value: portfolio.avgMarginPct ? `${portfolio.avgMarginPct.toFixed(1)}%` : "—", icon: "trending_up", color: "text-emerald-400" },
          { label: "Capital Deployed", value: portfolio.totalCapitalDeployed ? `€${(portfolio.totalCapitalDeployed / 1000).toFixed(0)}K` : "—", icon: "account_balance", color: "text-primary" },
          { label: "Vehicles in Pipeline", value: portfolio.vehicleCount || 0, icon: "directions_car", color: "text-secondary" },
        ].map((m, i) => (
          <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className={`material-symbols-outlined ${m.color} text-2xl`}>{m.icon}</span>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{m.label}</span>
            </div>
            <p className="font-headline text-xl sm:text-3xl font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* FX Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">EUR/JPY Rate</h3>
          {fx.rate ? (
            <>
              <p className="font-headline text-4xl font-bold text-secondary mb-2">{fx.rate}</p>
              <p className="text-sm text-on-surface-variant">Source: {fx.source || "frankfurter.app"}</p>
              {fx.alerts?.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20">
                  <p className="text-xs text-amber-400 font-bold">{fx.alerts[0].message}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-on-surface-variant text-sm">FX data unavailable</p>
          )}
        </div>

        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Tax Status</h3>
          {data?.tax ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Recommended Treatment</span>
                <span className="font-headline font-bold text-primary text-sm">{data.tax.recommendedScheme || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Reclaimable VAT</span>
                <span className="font-headline font-bold">{fmt(data.tax.reclaimableVat)}</span>
              </div>
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">Run a financial check to generate tax report.</p>
          )}
        </div>
      </div>

      {/* Sold Vehicles P&L Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Per-Vehicle P&L (Sold)</h3>
        {soldVehicles.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No sold vehicles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  {["Vehicle", "Total Cost", "Sale Price", "Margin", "%", "Days"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs uppercase tracking-widest text-on-surface-variant font-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {soldVehicles.map((v, i) => (
                  <tr key={i} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-3 px-3"><span className="font-headline font-bold text-sm">{v.make} {v.model}</span></td>
                    <td className="py-3 px-3 text-sm">{fmt(v.totalCosts)}</td>
                    <td className="py-3 px-3 text-sm font-bold">{fmt(v.salePrice)}</td>
                    <td className="py-3 px-3 text-sm font-bold text-emerald-400">+{fmt(v.margin)}</td>
                    <td className="py-3 px-3 text-sm text-primary font-bold">{v.marginPct}%</td>
                    <td className="py-3 px-3 text-sm text-on-surface-variant">{v.daysToSell}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
