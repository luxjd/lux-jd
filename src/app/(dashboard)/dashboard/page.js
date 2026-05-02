"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/agents/logistics/pipeline";
import { formatEur, formatEurCompact, formatJpy, formatKm } from "@/lib/format";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents/orchestrator/portfolio").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/finance/pnl").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/logistics/vehicles").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/concierge/leads").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/orchestrator/agents").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/jp-sourcing/opportunities").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/finance/fx").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/logistics/events").then((r) => r.json()).catch(() => null),
    ]).then(([portfolio, finance, logistics, leads, agents, opportunities, fx, events]) => {
      setData({ portfolio, finance, logistics, leads, agents, opportunities, fx, events });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
      </div>
    );
  }

  const vehicles = data?.logistics?.vehicles || [];
  const stageCount = STAGES.map((s) => ({
    ...s,
    count: vehicles.filter((v) => v.currentStage === s.key).length,
  }));

  const portfolioValue = data?.portfolio?.totalCapitalDeployed || 0;
  const availableCapital = data?.portfolio?.totalAvailableCapital || 2500000;
  const deploymentPct = data?.portfolio?.deploymentPct || 0;
  const healthScore = data?.portfolio?.healthScore || 0;
  const healthLevel = data?.portfolio?.healthLevel || "—";
  const brandConcentration = data?.portfolio?.brandConcentration || {};

  const unrealizedPL = data?.finance?.portfolio?.unrealizedMargin || 0;
  const realizedPL = data?.finance?.portfolio?.realizedMargin || 0;
  const leadsCount = data?.leads?.leads?.length || 0;
  const activeLeads = data?.leads?.leads?.filter((l) => l.status === "NEW" || l.status === "QUALIFIED") || [];

  const fxRate = data?.fx?.live?.rate || data?.fx?.rate || 186.88;
  const fxChange = data?.fx?.live?.change24hPct || data?.fx?.change24hPct || 0;
  const fx30dAvg = data?.fx?.movingAverages?.ma30 || data?.fx?.ma30 || null;

  const allOpps = data?.opportunities?.opportunities || [];
  const topOpps = allOpps
    .filter((o) => o.recommendation === "STRONG_BUY" || o.recommendation === "BUY")
    .sort((a, b) => (b.margin?.grossMarginEur || 0) - (a.margin?.grossMarginEur || 0))
    .slice(0, 3);

  const recentEvents = (data?.events?.events || []).slice(-8).reverse();

  // Pending actions
  const pendingActions = [];
  const pendingReviews = allOpps.filter((o) => o.recommendation === "BUY" || o.recommendation === "STRONG_BUY").length;
  if (pendingReviews > 0) pendingActions.push({ icon: "gavel", color: "text-amber-400", text: `${pendingReviews} opportunities pending Orchestrator review`, href: "/agents/orchestrator" });

  const stuckVehicles = vehicles.filter((v) => {
    const days = Math.round((Date.now() - new Date(v.stageEnteredAt).getTime()) / 86400000);
    return days > 14;
  });
  if (stuckVehicles.length > 0) pendingActions.push({ icon: "warning", color: "text-red-400", text: `${stuckVehicles.length} vehicle(s) stuck in stage >14 days`, href: "/agents/logistics" });

  const escalatedLeads = (data?.leads?.leads || []).filter((l) => l.status === "ESCALATED");
  if (escalatedLeads.length > 0) pendingActions.push({ icon: "support_agent", color: "text-amber-400", text: `${escalatedLeads.length} lead(s) need escalation response`, href: "/leads" });

  for (const [brand, pct] of Object.entries(brandConcentration)) {
    if (pct > 0.30) pendingActions.push({ icon: "pie_chart", color: "text-red-400", text: `${brand} at ${(pct * 100).toFixed(0)}% concentration (>30% limit)`, href: "/agents/orchestrator" });
  }

  // Agent statuses
  const agentList = data?.agents?.agents || [];

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Pending Actions — THE most important section */}
      {pendingActions.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-amber-400/20 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-amber-400">notification_important</span>
            <h3 className="font-headline font-bold text-base">Pending Actions ({pendingActions.length})</h3>
          </div>
          <div className="space-y-2">
            {pendingActions.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-container-high/30 transition-colors">
                <span className={`material-symbols-outlined text-lg ${a.color}`}>{a.icon}</span>
                <span className="text-sm">{a.text}</span>
                <span className="material-symbols-outlined text-sm text-on-surface-variant ml-auto">arrow_forward</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="material-symbols-outlined text-primary text-xl">directions_car</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Active Vehicles</span>
          </div>
          <p className="font-headline text-2xl sm:text-3xl font-bold">{vehicles.length}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">
            {stageCount.filter((s) => s.count > 0).map((s) => `${s.count} ${s.label}`).join(" · ")}
          </p>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="material-symbols-outlined text-secondary text-xl">account_balance</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Capital Deployed</span>
          </div>
          <p className="font-headline text-2xl sm:text-3xl font-bold">{formatEurCompact(portfolioValue)}</p>
          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-on-surface-variant mb-0.5">
              <span>{deploymentPct}% of {formatEurCompact(availableCapital)}</span>
              <span>80% limit</span>
            </div>
            <div className="w-full h-1.5 bg-surface-container-high rounded-full">
              <div className={`h-full rounded-full ${deploymentPct > 80 ? "bg-red-400" : deploymentPct > 60 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(deploymentPct, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="material-symbols-outlined text-emerald-400 text-xl">trending_up</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">P&L</span>
          </div>
          <div className="flex items-baseline gap-3">
            <div>
              <p className="text-[9px] text-on-surface-variant uppercase">Realized</p>
              <p className={`font-headline text-lg font-bold ${realizedPL > 0 ? "text-emerald-400" : realizedPL < 0 ? "text-red-400" : ""}`}>
                {realizedPL !== 0 ? formatEurCompact(realizedPL) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-on-surface-variant uppercase">Unrealized</p>
              <p className="font-headline text-lg font-bold">{unrealizedPL !== 0 ? formatEurCompact(unrealizedPL) : "—"}</p>
            </div>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="material-symbols-outlined text-primary text-xl">people</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Leads</span>
          </div>
          <p className="font-headline text-2xl sm:text-3xl font-bold">{leadsCount}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">
            {activeLeads.length > 0 ? `${activeLeads.length} active` : "No active leads"}
            {escalatedLeads.length > 0 && ` · ${escalatedLeads.length} escalated`}
          </p>
        </div>
      </div>

      {/* FX Rate + Portfolio Health */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-on-surface-variant mb-1">EUR/JPY Exchange Rate</p>
              <div className="flex items-baseline gap-2">
                <p className="font-headline text-2xl font-bold">¥{fxRate.toFixed(2)}</p>
                <span className={`text-sm font-bold ${fxChange > 0 ? "text-emerald-400" : fxChange < 0 ? "text-red-400" : ""}`}>
                  {fxChange > 0 ? "▲" : fxChange < 0 ? "▼" : ""}  {fxChange > 0 ? "+" : ""}{fxChange.toFixed(2)}%
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1">
                30d avg: ¥{fx30dAvg ? fx30dAvg.toFixed(2) : "—"} · {fxRate > 180 ? "✓ Favorable for buying" : fxRate > 165 ? "Neutral" : "⚠ Unfavorable — Yen strengthening"}
              </p>
            </div>
            <span className="material-symbols-outlined text-3xl text-secondary">currency_exchange</span>
          </div>
        </div>

        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-on-surface-variant mb-1">Portfolio Health</p>
              <div className="flex items-baseline gap-2">
                <p className="font-headline text-2xl font-bold">{healthScore}/100</p>
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${healthLevel === "EXCELLENT" ? "bg-emerald-400/15 text-emerald-400" : healthLevel === "GOOD" ? "bg-emerald-400/15 text-emerald-400" : healthLevel === "FAIR" ? "bg-amber-400/15 text-amber-400" : "bg-red-400/15 text-red-400"}`}>
                  {healthLevel}
                </span>
              </div>
              {Object.entries(brandConcentration).length > 0 && (
                <p className="text-[10px] text-on-surface-variant mt-1">
                  {Object.entries(brandConcentration).map(([brand, pct]) => `${brand}: ${(pct * 100).toFixed(0)}%`).join(" · ")}
                </p>
              )}
            </div>
            <span className="material-symbols-outlined text-3xl text-emerald-400">health_and_safety</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { href: "/agents/de-market", icon: "query_stats", label: "Scan Market", sub: "DE Market Agent", color: "text-blue-400" },
          { href: "/agents/jp-sourcing", icon: "travel_explore", label: "Scan Japan", sub: "JP Sourcing Agent", color: "text-emerald-400" },
          { href: "/agents/valuation", icon: "auto_awesome", label: "Valuate", sub: "Valuation Agent", color: "text-secondary" },
          { href: "/agents/orchestrator", icon: "gavel", label: "Evaluate", sub: "Orchestrator", color: "text-amber-400" },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="flex items-center gap-3 bg-surface-container rounded-xl border border-outline-variant/10 p-3 sm:p-4 hover:border-primary/30 transition-colors">
            <span className={`material-symbols-outlined ${a.color}`}>{a.icon}</span>
            <div>
              <p className="text-sm font-bold">{a.label}</p>
              <p className="text-[10px] text-on-surface-variant">{a.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Pipeline Overview + Top Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Pipeline — ALL 10 stages */}
        <div className="lg:col-span-2 bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline font-bold text-base sm:text-lg">Pipeline Overview</h3>
            <Link href="/pipeline" className="text-xs text-primary hover:underline">View Kanban →</Link>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-on-surface-variant text-sm py-4 text-center">No vehicles in pipeline</p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 sm:gap-2">
              {stageCount.map((s) => (
                <div key={s.key} className="text-center">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${s.count > 0 ? (s.bg || "bg-primary/10") : "bg-surface-container-high/30"} flex items-center justify-center mx-auto mb-1`}>
                    <span className={`material-symbols-outlined text-sm sm:text-lg ${s.count > 0 ? (s.color || "text-primary") : "text-on-surface-variant/30"}`}>{s.icon || "circle"}</span>
                  </div>
                  <p className={`font-headline text-sm sm:text-lg font-bold ${s.count === 0 ? "text-on-surface-variant/30" : ""}`}>{s.count}</p>
                  <p className="text-[7px] sm:text-[9px] text-on-surface-variant uppercase leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Opportunities */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-headline font-bold text-base sm:text-lg">Top Opportunities</h3>
            <Link href="/agents/jp-sourcing" className="text-xs text-primary hover:underline">View All →</Link>
          </div>
          {topOpps.length > 0 ? (
            <div className="space-y-3">
              {topOpps.map((o, i) => (
                <div key={i} className="p-3 rounded-xl bg-surface-container-high/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold">{o.vehicle?.make} {o.vehicle?.model} {o.vehicle?.year}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${o.recommendation === "STRONG_BUY" ? "bg-emerald-400/15 text-emerald-400" : "bg-blue-400/15 text-blue-400"}`}>
                      {o.recommendation}
                    </span>
                  </div>
                  <p className="text-emerald-400 font-mono font-bold text-sm">{formatEur(o.margin?.grossMarginEur || 0)} ({o.margin?.grossMarginPct || 0}%)</p>
                  <p className="text-[10px] text-on-surface-variant">{o.vehicle?.mileageKm ? `${formatKm(o.vehicle.mileageKm)} km` : ""} · {o.vehicle?.driveSide} · Risk {o.risk?.compositeScore}/5</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm py-4 text-center">No BUY opportunities found. Run JP Sourcing scan.</p>
          )}
        </div>
      </div>

      {/* Agent Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Agent Status — Enhanced */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-base sm:text-lg mb-4">Agent Status</h3>
          <div className="space-y-2">
            {(agentList.length > 0 ? agentList : [
              { id: "de-market", name: "DE Market", icon: "query_stats" },
              { id: "jp-sourcing", name: "JP Sourcing", icon: "travel_explore" },
              { id: "orchestrator", name: "Orchestrator", icon: "hub" },
              { id: "logistics", name: "Logistics", icon: "local_shipping" },
              { id: "listing", name: "Listing", icon: "edit_note" },
              { id: "concierge", name: "Concierge", icon: "support_agent" },
              { id: "finance", name: "Finance", icon: "account_balance" },
            ]).map((a) => {
              const isOnline = a.health === "HEALTHY" || a.status === "ONLINE";
              const isIdle = a.health === "IDLE" || (!a.lastActionTimestamp && !a.status);
              const lastRun = a.hoursSinceAction ? `${a.hoursSinceAction}h ago` : a.lastActionTimestamp ? "Active" : "Never";
              return (
                <Link key={a.id} href={`/agents/${a.id}`} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-high/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <span className="material-symbols-outlined text-on-surface-variant text-lg">{a.icon}</span>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface-container ${isOnline ? "bg-emerald-400" : isIdle ? "bg-slate-500" : "bg-amber-400"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-[10px] text-on-surface-variant">{lastRun}</p>
                    </div>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isOnline ? "bg-emerald-400/15 text-emerald-400" : isIdle ? "bg-slate-400/10 text-slate-400" : "bg-amber-400/15 text-amber-400"}`}>
                    {isOnline ? "LIVE" : isIdle ? "IDLE" : a.health || "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-base sm:text-lg mb-4">Recent Activity</h3>
          {recentEvents.length > 0 ? (
            <div className="space-y-2">
              {recentEvents.map((evt) => (
                <div key={evt.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-container-high/30 transition-colors">
                  <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0">
                    {evt.type === "STAGE_TRANSITION" ? "arrow_forward" : evt.type === "VEHICLE_ADDED" ? "add_circle" : "info"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{evt.message}</p>
                    <p className="text-[10px] text-on-surface-variant">
                      {new Date(evt.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm py-4 text-center">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
