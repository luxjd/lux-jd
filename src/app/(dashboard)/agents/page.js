"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const AGENT_DEFS = [
  { id: "de-market", name: "DE Market Agent", icon: "query_stats", description: "German market intelligence — pricing, trends, demand scoring" },
  { id: "jp-sourcing", name: "JP Sourcing Agent", icon: "location_searching", description: "Japanese auction scanning — candidates, margins, risk" },
  { id: "orchestrator", name: "Orchestrator", icon: "hub", description: "Purchase decisions — 7-step evaluation framework" },
  { id: "logistics", name: "Logistics Agent", icon: "local_shipping", description: "Pipeline management — shipping, customs, TUV" },
  { id: "listing", name: "Listing Agent", icon: "storefront", description: "Multi-platform listings — content, pricing, publication" },
  { id: "finance", name: "Finance Agent", icon: "account_balance", description: "P&L, FX monitoring, tax optimization" },
  { id: "concierge", name: "Concierge Agent", icon: "support_agent", description: "Customer interaction — lead scoring, responses" },
];

export default function AgentsHubPage() {
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    AGENT_DEFS.forEach((a) => {
      fetch(`/api/agents/${a.id}/status`)
        .then((r) => r.json())
        .then((data) => setStatuses((prev) => ({ ...prev, [a.id]: data })))
        .catch(() => setStatuses((prev) => ({ ...prev, [a.id]: { aiPowered: false } })));
    });
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-on-surface-variant text-sm">7 specialized AI agents powering the arbitrage pipeline</p>

      {/* Valuation Agent — standalone, always first */}
      <Link href="/agents/valuation" className="block bg-surface-container rounded-2xl border border-secondary/20 p-6 hover:border-secondary/40 transition-all mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-2xl">auto_awesome</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-lg">Valuation Agent</h3>
                <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">AGENT #0</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">STANDALONE</span>
              </div>
              <p className="text-sm text-on-surface-variant mt-0.5">Upload vehicle data → Get instant BUY/REVIEW/PASS recommendation with full market analysis</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-secondary text-2xl">arrow_forward</span>
        </div>
      </Link>

      <h3 className="font-headline font-bold text-lg mb-4">Pipeline Agents</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENT_DEFS.map((a) => {
          const status = statuses[a.id];
          const isOnline = status?.aiPowered;

          return (
            <Link
              key={a.id}
              href={`/agents/${a.id}`}
              className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 transition-all hover:border-primary/30 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">{a.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-sm">{a.name}</h3>
                    <p className="text-[10px] text-on-surface-variant font-mono">{a.id}</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isOnline ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {isOnline ? "LIVE" : "OFFLINE"}
                </span>
              </div>

              <p className="text-xs text-on-surface-variant mb-3">{a.description}</p>

              <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                <span className="text-[10px] text-on-surface-variant">{status?.hasData ? "Has scan data" : "No data yet"}</span>
                <span className="text-xs text-primary font-bold flex items-center gap-1">
                  Open <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
