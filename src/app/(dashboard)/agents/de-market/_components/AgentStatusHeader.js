"use client";

import { useState } from "react";

export default function AgentStatusHeader({ status }) {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [lastResult, setLastResult] = useState(null);

  const handleScan = async () => {
    setScanning(true);
    setLastResult(null);
    setScanProgress("Starting full market scan...");

    try {
      // For single model quick scan vs full scan
      const res = await fetch("/api/agents/de-market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.error) {
        setLastResult({ error: true, message: data.error });
      } else {
        setLastResult(data);
      }
    } catch (err) {
      setLastResult({ error: true, message: err.message });
    } finally {
      setScanning(false);
      setScanProgress("");
    }
  };

  const healthEntries = Object.entries(status.healthChecks || {});

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6">
      {/* Top row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-2xl">query_stats</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-headline text-xl font-bold">DE Market Research Agent</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">de_market</span>
              <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" :
                status.status === "SCANNING" ? "bg-amber-400/15 text-amber-400" :
                "bg-red-400/15 text-red-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  status.status === "ONLINE" ? "bg-emerald-400" : status.status === "SCANNING" ? "bg-amber-400 animate-pulse" : "bg-red-400"
                }`} />
                {status.status}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">Uptime {status.uptime} &middot; Last scan {new Date(status.lastScanTimestamp).toLocaleTimeString()}</p>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(248,113,113,0.4)] transition-all disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-lg ${scanning ? "animate-spin" : ""}`}>
            {scanning ? "progress_activity" : "radar"}
          </span>
          {scanning ? "Scanning..." : "Scan Now"}
        </button>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Listings Tracked", value: status.totalListingsTracked, icon: "list" },
          { label: "Price Updates (24h)", value: status.totalPriceUpdates24h, icon: "update" },
          { label: "Scans Today", value: `${status.scansConductedToday}/${status.scansScheduledToday}`, icon: "radar" },
          { label: "Errors (24h)", value: status.errorCount24h, icon: "error_outline" },
        ].map((m, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-high/30">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">{m.icon}</span>
            <div>
              <p className="font-headline font-bold text-sm">{m.value}</p>
              <p className="text-[10px] text-on-surface-variant">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Health checks */}
      <div className="flex flex-wrap gap-2">
        {healthEntries.map(([name, check]) => (
          <div key={name} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
            check.status === "OK" ? "border-emerald-400/20 text-emerald-400 bg-emerald-400/5" :
            check.status === "DEGRADED" ? "border-amber-400/20 text-amber-400 bg-amber-400/5" :
            "border-red-400/20 text-red-400 bg-red-400/5"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              check.status === "OK" ? "bg-emerald-400" : check.status === "DEGRADED" ? "bg-amber-400" : "bg-red-400"
            }`} />
            {name}
            <span className="text-on-surface-variant font-mono">{check.latency}ms</span>
          </div>
        ))}
      </div>

      {/* Scanning progress */}
      {scanning && (
        <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
          {scanProgress || "Scanning all models... This takes 2-3 minutes with real AI."}
        </div>
      )}

      {/* Scan result toast */}
      {lastResult && !lastResult.error && !scanning && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          {lastResult.aiPowered
            ? `AI Scan complete: ${lastResult.models?.succeeded || 0}/${lastResult.models?.total || 0} models scanned, ${lastResult.tvrsGenerated || 0} TVRs generated, ${lastResult.totalListingsTracked || 0} listings tracked (${((lastResult.duration || 0) / 1000).toFixed(1)}s)`
            : `Scan complete: ${lastResult.listingsScanned || 0} scanned, ${lastResult.newFound || 0} new`
          }
        </div>
      )}

      {/* Error toast */}
      {lastResult?.error && !scanning && (
        <div className="mt-4 p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">error</span>
          {lastResult.message || "Scan failed. Check console for details."}
        </div>
      )}
    </div>
  );
}
