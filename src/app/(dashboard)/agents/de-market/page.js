"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getVelocityStyle, getFreshnessStatus } from "@/lib/agents/de-market/constants";
import AgentStatusHeader from "./_components/AgentStatusHeader";

const formatEur = (n) => n != null ? `€${Math.round(n).toLocaleString()}` : "—";

export default function DeMarketAgentPage() {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [reports, setReports] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchData = () => {
    Promise.all([
      fetch("/api/agents/de-market/status").then((r) => r.json()).catch(() => null),
      fetch("/api/agents/de-market/models").then((r) => r.json()).catch(() => ({ models: [] })),
      fetch("/api/agents/de-market/reports").then((r) => r.json()).catch(() => ({ reports: [] })),
      fetch("/api/agents/de-market/competitors").then((r) => r.json()).catch(() => ({ competitors: [] })),
    ]).then(([s, m, r, c]) => {
      setStatus(s);
      setModels(m.models || []);
      setReports(r.reports || []);
      setCompetitors(c.competitors || []);
      setLoading(false);
    });
  };

  useEffect(() => { fetchData(); }, []);

  const triggerScan = async (type = "full") => {
    setScanning(true);
    try {
      await fetch("/api/agents/de-market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      // Refresh data after scan
      setTimeout(fetchData, 2000);
    } catch (e) {
      console.error("Scan failed:", e);
    }
    setScanning(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  }

  // Merge models config with report data
  const enrichedModels = models.map((m) => {
    const report = reports.find((r) => r.modelId === m.id);
    return { ...m, report };
  });

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Status Header */}
      {status && <AgentStatusHeader status={status} />}

      {/* Scan Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => triggerScan("full")}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">{scanning ? "progress_activity" : "radar"}</span>
          {scanning ? "Scanning..." : "Run Full Scan"}
        </button>
        <button
          onClick={() => triggerScan("quick")}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 rounded-xl text-sm hover:border-primary/50 transition-all disabled:opacity-50"
        >
          Quick Scan
        </button>
        {reports.length === 0 && (
          <span className="text-xs text-amber-400">No scan data yet — run a scan to get market intelligence</span>
        )}
      </div>

      {/* Tracked Models Grid */}
      <div>
        <h3 className="font-headline font-bold text-lg mb-4">Tracked Models ({models.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enrichedModels.map((m) => {
            const report = m.report;
            const hasData = !!report;
            const median = report?.marketValue?.medianEur || m.medianPrice;
            const velocity = report?.demand?.velocityScore || m.velocityScore;
            const confidence = report?.confidence || m.confidence;

            return (
              <Link
                key={m.id}
                href={`/agents/de-market/${m.id}`}
                className="bg-surface-container rounded-2xl border border-outline-variant/10 p-5 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-headline font-bold group-hover:text-primary transition-colors">{m.make} {m.model}</h4>
                    <p className="text-[10px] text-on-surface-variant">{m.yearRange[0]}-{m.yearRange[1]} &middot; {m.segment}</p>
                  </div>
                  {hasData ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">LIVE</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-400/10 text-slate-400 text-[10px] font-bold">NO DATA</span>
                  )}
                </div>

                {median ? (
                  <div className="mb-3">
                    <p className="font-headline text-2xl font-bold">{formatEur(median)}</p>
                    {report?.marketValue && (
                      <span className="text-xs text-on-surface-variant">
                        {formatEur(report.marketValue.p25Eur)} - {formatEur(report.marketValue.p75Eur)}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-on-surface-variant text-sm mb-3">Run a scan to get pricing data</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                  {velocity != null && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${getVelocityStyle(velocity).bg}`}>
                      <span className={`text-[10px] font-bold ${getVelocityStyle(velocity).color}`}>
                        {velocity} — {getVelocityStyle(velocity).label}
                      </span>
                    </div>
                  )}
                  {confidence != null && (
                    <span className="text-[10px] font-bold">{(confidence * 100).toFixed(0)}% conf</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Competitors */}
      {competitors.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Competitor Intelligence</h3>
          <div className="space-y-3">
            {competitors.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30">
                <div>
                  <p className="text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-on-surface-variant">{c.location} &middot; {c.focus}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="font-bold">{c.inventory}</p>
                    <p className="text-on-surface-variant">vehicles</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    c.threatLevel === "HIGH" ? "bg-red-400/15 text-red-400" :
                    c.threatLevel === "MEDIUM" ? "bg-amber-400/15 text-amber-400" :
                    "bg-emerald-400/15 text-emerald-400"
                  }`}>{c.threatLevel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
