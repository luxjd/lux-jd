"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanButton() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const router = useRouter();

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    setProgress("Starting JP auction scan...");

    try {
      const res = await fetch("/api/agents/jp-sourcing/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepAnalysis: true }),
      });
      const data = await res.json();

      if (data.error) {
        setResult({ error: true, message: data.error });
      } else {
        setResult(data);
        router.refresh();
      }
    } catch (err) {
      setResult({ error: true, message: err.message });
    } finally {
      setScanning(false);
      setProgress("");
    }
  };

  return (
    <div>
      <button
        onClick={handleScan}
        disabled={scanning}
        className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(255,138,101,0.4)] transition-all disabled:opacity-50"
      >
        <span className={`material-symbols-outlined text-lg ${scanning ? "animate-spin" : ""}`}>
          {scanning ? "progress_activity" : "travel_explore"}
        </span>
        {scanning ? "Scanning Auctions..." : "Scan Japanese Auctions"}
      </button>

      {scanning && (
        <div className="mt-3 p-3 rounded-xl bg-secondary/10 border border-secondary/20 text-secondary text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
          {progress || "Scanning auctions, evaluating vehicles, running deep analysis... This takes 2-4 minutes."}
        </div>
      )}

      {result && !result.error && !scanning && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Scan complete in {((result.duration || 0) / 1000).toFixed(0)}s
          </div>
          <p className="text-xs opacity-80">
            {result.scanSummary?.matchingVehicles || 0} vehicles found &middot;
            {result.results?.strongBuy || 0} STRONG_BUY &middot;
            {result.results?.buy || 0} BUY &middot;
            {result.results?.review || 0} REVIEW &middot;
            {result.results?.pass || 0} PASS &middot;
            {result.results?.deepAnalyzed || 0} deep-analyzed
          </p>
        </div>
      )}

      {result?.error && !scanning && (
        <div className="mt-3 p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">error</span>
          {result.message}
        </div>
      )}
    </div>
  );
}
