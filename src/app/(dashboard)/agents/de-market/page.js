"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getVelocityStyle } from "@/lib/agents/de-market/constants";
import AgentStatusHeader from "./_components/AgentStatusHeader";

const formatEur = (n) => n != null ? `€${Math.round(n).toLocaleString()}` : "—";

export default function DeMarketAgentPage() {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [reports, setReports] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null); // scan progress from backend
  const pollRef = useRef(null);

  const fetchData = useCallback(() => {
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
  }, []);

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/de-market/scan-model");
      const data = await res.json();
      setProgress(data.state === "idle" ? null : data);

      if (data.state === "done" || data.state === "stopped") {
        // Stop polling, refresh data
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        fetchData();
        // Clear progress after a moment
        setTimeout(() => setProgress(null), 4000);
      }
    } catch {
      // ignore
    }
  }, [fetchData]);

  // Start polling on mount — picks up any running scan
  useEffect(() => {
    fetchData();
    pollProgress();
  }, [fetchData, pollProgress]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollProgress, 2000);
  }, [pollProgress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleFullScan = async () => {
    try {
      const res = await fetch("/api/agents/de-market/scan-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === "started" || data.progress) {
        pollProgress();
        startPolling();
      }
    } catch (e) {
      console.error("Failed to start scan:", e);
    }
  };

  const handleControl = async (action) => {
    try {
      await fetch("/api/agents/de-market/scan-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      pollProgress();
    } catch (e) {
      console.error("Control failed:", e);
    }
  };

  // Auto-start polling if there's an active scan
  useEffect(() => {
    if (progress && (progress.state === "scanning" || progress.state === "paused")) {
      if (!pollRef.current) startPolling();
    }
  }, [progress, startPolling]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span></div>;
  }

  const isActive = progress?.state === "scanning" || progress?.state === "paused";
  const isDone = progress?.state === "done";
  const completedCount = progress?.completed?.length || 0;
  const totalCount = progress?.total || models.length;
  const scanResults = progress?.results || {};
  const currentModelId = progress?.currentModelId;

  // Merge models with report data + live scan results
  const enrichedModels = models.map((m) => {
    const report = reports.find((r) => r.modelId === m.id);
    const sr = scanResults[m.id] || null;
    return { ...m, report, scanResult: sr };
  });

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {status && <AgentStatusHeader status={status} />}

      {/* Scan Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isActive && !isDone && (
          <button onClick={handleFullScan}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-lg transition-all">
            <span className="material-symbols-outlined text-lg">radar</span>
            Run Full Scan
          </button>
        )}

        {progress?.state === "scanning" && (
          <>
            <button onClick={() => handleControl("pause")}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400/15 text-amber-400 border border-amber-400/30 rounded-xl font-bold text-sm hover:bg-amber-400/25 transition-all">
              <span className="material-symbols-outlined text-lg">pause</span>
              Pause
            </button>
            <button onClick={() => handleControl("stop")}
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 text-on-surface-variant rounded-xl text-sm hover:border-red-400/50 hover:text-red-400 transition-all">
              <span className="material-symbols-outlined text-lg">stop</span>
              Stop
            </button>
          </>
        )}

        {progress?.state === "paused" && (
          <>
            <button onClick={() => handleControl("resume")}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 rounded-xl font-bold text-sm hover:bg-emerald-400/25 transition-all">
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              Resume
            </button>
            <button onClick={() => handleControl("stop")}
              className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 text-on-surface-variant rounded-xl text-sm hover:border-red-400/50 hover:text-red-400 transition-all">
              <span className="material-symbols-outlined text-lg">stop</span>
              Stop
            </button>
          </>
        )}

        {isDone && (
          <span className="flex items-center gap-2 text-sm text-emerald-400 font-bold">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Scan complete — {completedCount} models processed
          </span>
        )}

        {isActive && (
          <span className="text-xs text-on-surface-variant ml-auto">
            {completedCount}/{totalCount} models &middot; {(progress?.queue?.length || 0)} remaining
          </span>
        )}

        {!isActive && !isDone && reports.length === 0 && (
          <span className="text-xs text-amber-400">No scan data yet — run a scan to get market intelligence</span>
        )}
      </div>

      {/* Scanning Banner */}
      {isActive && (
        <div className={`rounded-2xl p-4 flex items-center gap-4 ${
          progress.state === "paused"
            ? "bg-amber-400/10 border border-amber-400/20"
            : "bg-primary/10 border border-primary/20"
        }`}>
          <span className={`material-symbols-outlined text-2xl ${
            progress.state === "paused" ? "text-amber-400" : "text-primary animate-spin"
          }`}>{progress.state === "paused" ? "pause_circle" : "radar"}</span>
          <div className="flex-1">
            <p className={`text-sm font-bold ${progress.state === "paused" ? "text-amber-400" : "text-primary"}`}>
              {progress.state === "paused"
                ? `Paused — ${completedCount}/${totalCount} models done. Click Resume to continue.`
                : `Scanning ${currentModelId ? models.find((m) => m.id === currentModelId)?.make + " " + models.find((m) => m.id === currentModelId)?.model : "..."}...`
              }
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {progress.state === "paused"
                ? "Scan is paused. Navigate freely — progress is saved. Resume anytime."
                : "Runs in background — you can navigate to other pages and come back."
              }
            </p>
            <div className="mt-2 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progress.state === "paused" ? "bg-amber-400" : "bg-primary"}`}
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tracked Models Grid */}
      <div>
        <h3 className="font-headline font-bold text-lg mb-4">Tracked Models ({models.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enrichedModels.map((m) => {
            const report = m.report;
            const sr = m.scanResult;
            const isCurrent = currentModelId === m.id;
            const isQueued = isActive && !sr && !isCurrent;
            const hasData = !!report || (!!sr && !sr.error);
            const median = sr?.median || report?.marketValue?.medianEur || m.medianPrice;
            const velocity = sr?.velocity || report?.demand?.velocityScore || m.velocityScore;
            const confidence = sr?.confidence || report?.confidence || m.confidence;
            const sampleSize = sr?.sampleSize || report?.marketValue?.sampleSize;
            const hasError = sr?.error;

            return (
              <Link
                key={m.id}
                href={`/agents/de-market/${m.id}`}
                className={`bg-surface-container rounded-2xl border p-5 transition-all group ${
                  isCurrent ? "border-primary/40 shadow-[0_0_20px_rgba(248,113,113,0.1)]" :
                  sr && !sr.error ? "border-emerald-400/20" :
                  hasError ? "border-red-400/20" :
                  isQueued ? "border-outline-variant/10 opacity-60" :
                  "border-outline-variant/10 hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-headline font-bold group-hover:text-primary transition-colors">{m.make} {m.model}</h4>
                    <p className="text-[10px] text-on-surface-variant">{m.yearRange[0]}-{m.yearRange[1]} &middot; {m.segment}</p>
                  </div>
                  {isCurrent ? (
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> SCANNING
                    </span>
                  ) : sr && !sr.error ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">check</span> DONE
                    </span>
                  ) : hasError ? (
                    <span className="px-2 py-0.5 rounded-full bg-red-400/15 text-red-400 text-[10px] font-bold">NO LISTINGS</span>
                  ) : hasData ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 text-[10px] font-bold">LIVE</span>
                  ) : isQueued ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-400/10 text-slate-400 text-[10px] font-bold">QUEUED</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-slate-400/10 text-slate-400 text-[10px] font-bold">NO DATA</span>
                  )}
                </div>

                {isCurrent ? (
                  <div className="mb-3">
                    <div className="h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                      <span className="text-xs text-primary animate-pulse">Scraping mobile.de + AutoScout24...</span>
                    </div>
                  </div>
                ) : median ? (
                  <div className="mb-3">
                    <p className="font-headline text-2xl font-bold">{formatEur(median)}</p>
                    <span className="text-xs text-on-surface-variant">
                      {report?.marketValue ? `${formatEur(report.marketValue.p25Eur)} - ${formatEur(report.marketValue.p75Eur)}` :
                       sampleSize ? `${sampleSize} listings` : ""}
                    </span>
                  </div>
                ) : hasError ? (
                  <p className="text-red-400/70 text-sm mb-3">No listings found on mobile.de / AutoScout24</p>
                ) : (
                  <p className="text-on-surface-variant text-sm mb-3">{isQueued ? "Waiting in queue..." : "Run a scan to get pricing data"}</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
                  {velocity != null ? (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${getVelocityStyle(velocity).bg}`}>
                      <span className={`text-[10px] font-bold ${getVelocityStyle(velocity).color}`}>
                        {velocity} — {getVelocityStyle(velocity).label}
                      </span>
                    </div>
                  ) : (
                    <span />
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
