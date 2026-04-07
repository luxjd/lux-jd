"use client";

import { useState, useEffect } from "react";
import { STAGES } from "@/lib/agents/logistics/pipeline";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents/orchestrator/portfolio").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/finance/pnl").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/logistics/vehicles").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/concierge/leads").then((r) => r.json()).catch(() => null),
    ]).then(([portfolio, finance, logistics, leads]) => {
      setData({ portfolio, finance, logistics, leads });
      setLoading(false);
    });
  }, []);

  const vehicles = data?.logistics?.vehicles || [];
  const stages = STAGES || [];
  const stageCount = stages.map((s) => ({
    ...s,
    count: vehicles.filter((v) => v.currentStage === s.key).length,
  }));

  const portfolioValue = data?.portfolio?.totalCapitalDeployed || 0;
  const unrealizedPL = data?.finance?.portfolio?.unrealizedMargin || 0;
  const leadsCount = data?.leads?.leads?.length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Active Vehicles", value: vehicles.length, icon: "directions_car", color: "text-primary" },
          { label: "Portfolio Value", value: portfolioValue > 0 ? `€${(portfolioValue / 1000).toFixed(0)}K` : "—", icon: "account_balance_wallet", color: "text-secondary" },
          { label: "Unrealized P&L", value: unrealizedPL > 0 ? `€${(unrealizedPL / 1000).toFixed(0)}K` : "—", icon: "trending_up", color: "text-emerald-400" },
          { label: "Active Leads", value: leadsCount, icon: "people", color: "text-primary" },
        ].map((m, i) => (
          <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-5">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className={`material-symbols-outlined ${m.color} text-xl sm:text-2xl`}>{m.icon}</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-on-surface-variant">{m.label}</span>
            </div>
            <p className="font-headline text-xl sm:text-3xl font-bold mb-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Summary */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-6">
        <h3 className="font-headline font-bold text-base sm:text-lg mb-3 sm:mb-4">Pipeline Overview</h3>
        {vehicles.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No vehicles in pipeline. Use the JP Sourcing Agent to find opportunities.</p>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 sm:gap-2">
            {stageCount.filter((s) => s.count > 0).map((s) => (
              <div key={s.key} className="text-center">
                <div className={`w-10 h-10 rounded-full ${s.bg || "bg-primary/10"} flex items-center justify-center mx-auto mb-1.5`}>
                  <span className={`material-symbols-outlined text-lg ${s.color || "text-primary"}`}>{s.icon || "circle"}</span>
                </div>
                <p className="font-headline text-lg font-bold">{s.count}</p>
                <p className="text-[9px] text-on-surface-variant uppercase tracking-wider leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Status */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
        <h3 className="font-headline font-bold text-lg mb-4">Agent Status</h3>
        <AgentStatusList />
      </div>
    </div>
  );
}

function AgentStatusList() {
  const [statuses, setStatuses] = useState([]);

  const agentDefs = [
    { id: "de-market", name: "DE Market Agent", icon: "query_stats" },
    { id: "jp-sourcing", name: "JP Sourcing Agent", icon: "location_searching" },
    { id: "orchestrator", name: "Orchestrator", icon: "hub" },
    { id: "logistics", name: "Logistics Agent", icon: "local_shipping" },
    { id: "listing", name: "Listing Agent", icon: "storefront" },
    { id: "finance", name: "Finance Agent", icon: "account_balance" },
    { id: "concierge", name: "Concierge Agent", icon: "support_agent" },
  ];

  useEffect(() => {
    Promise.all(
      agentDefs.map((a) =>
        fetch(`/api/agents/${a.id}/status`).then((r) => r.json()).catch(() => ({ aiPowered: false }))
      )
    ).then((results) => {
      setStatuses(agentDefs.map((a, i) => ({ ...a, ...results[i] })));
    });
  }, []);

  return (
    <div className="space-y-3">
      {statuses.map((a) => (
        <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined text-on-surface-variant">{a.icon}</span>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-container ${a.aiPowered ? "bg-emerald-400" : "bg-slate-500"}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-on-surface-variant">{a.aiPowered ? "Online" : "AI unavailable"}</p>
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.aiPowered ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
            {a.aiPowered ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      ))}
    </div>
  );
}
