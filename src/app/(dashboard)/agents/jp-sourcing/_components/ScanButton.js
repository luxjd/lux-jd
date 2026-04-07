"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function ScanButton({ onScanComplete }) {
  const [progress, setProgress] = useState(null); // scan progress from backend
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const router = useRouter();

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/jp-sourcing/scan");
      const data = await res.json();
      setProgress(data.state === "idle" ? null : data);

      if (data.state === "done" || data.state === "stopped" || data.state === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (data.state === "done") onScanComplete?.();
        if (data.state === "error") setError(data.error);
        // Clear after showing result
        setTimeout(() => { setProgress(null); setError(null); }, 5000);
      }
    } catch {}
  }, [router]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(pollProgress, 2500);
  }, [pollProgress]);

  // Check for running scan on mount
  useEffect(() => {
    pollProgress();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollProgress]);

  // Auto-start polling if active
  useEffect(() => {
    if (progress && (progress.state === "scanning" || progress.state === "paused")) {
      if (!pollRef.current) startPolling();
    }
  }, [progress, startPolling]);

  const handleScan = async () => {
    setError(null);
    try {
      const res = await fetch("/api/agents/jp-sourcing/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepAnalysis: true }),
      });
      const data = await res.json();
      if (data.error && res.status !== 409) {
        setError(data.error);
        return;
      }
      pollProgress();
      startPolling();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleControl = async (action) => {
    try {
      await fetch("/api/agents/jp-sourcing/scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      pollProgress();
    } catch {}
  };

  const isActive = progress?.state === "scanning" || progress?.state === "paused";
  const isDone = progress?.state === "done";

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isActive && !isDone && (
          <button onClick={handleScan}
            className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(255,138,101,0.4)] transition-all">
            <span className="material-symbols-outlined text-lg">travel_explore</span>
            Scan Japanese Auctions
          </button>
        )}

        {progress?.state === "scanning" && (
          <>
            <button onClick={() => handleControl("pause")}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-400/15 text-amber-400 border border-amber-400/30 rounded-xl font-bold text-sm hover:bg-amber-400/25 transition-all">
              <span className="material-symbols-outlined text-lg">pause</span>
              Pause
            </button>
            <button onClick={() => handleControl("stop")}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/30 text-on-surface-variant rounded-xl text-sm hover:border-red-400/50 hover:text-red-400 transition-all">
              <span className="material-symbols-outlined text-lg">stop</span>
              Stop
            </button>
          </>
        )}

        {progress?.state === "paused" && (
          <>
            <button onClick={() => handleControl("resume")}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 rounded-xl font-bold text-sm hover:bg-emerald-400/25 transition-all">
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              Resume
            </button>
            <button onClick={() => handleControl("stop")}
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant/30 text-on-surface-variant rounded-xl text-sm hover:border-red-400/50 hover:text-red-400 transition-all">
              <span className="material-symbols-outlined text-lg">stop</span>
              Stop
            </button>
          </>
        )}

        {isDone && (
          <span className="flex items-center gap-2 text-sm text-emerald-400 font-bold">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Scan complete — {progress.vehiclesFound || 0} vehicles found
          </span>
        )}
      </div>

      {/* Progress banner */}
      {isActive && (
        <div className={`p-3 rounded-xl border flex items-center gap-3 ${
          progress.state === "paused"
            ? "bg-amber-400/10 border-amber-400/20"
            : "bg-secondary/10 border-secondary/20"
        }`}>
          <span className={`material-symbols-outlined text-lg ${
            progress.state === "paused" ? "text-amber-400" : "text-secondary animate-spin"
          }`}>{progress.state === "paused" ? "pause_circle" : "progress_activity"}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${progress.state === "paused" ? "text-amber-400" : "text-secondary"}`}>
              {progress.state === "paused"
                ? `Paused — ${progress.detail || "Click Resume to continue"}`
                : progress.detail || "Scanning Japanese auctions..."
              }
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {progress.state === "paused"
                ? "Navigate freely — progress is saved."
                : "Runs in background. You can navigate to other pages."
              }
            </p>
            {progress.totalModels > 0 && (
              <div className="mt-2 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progress.state === "paused" ? "bg-amber-400" : "bg-secondary"}`}
                  style={{ width: `${((progress.completedModels || 0) / progress.totalModels) * 100}%` }}
                />
              </div>
            )}
            {progress.vehiclesFound > 0 && (
              <p className="text-xs text-on-surface-variant mt-1">
                {progress.vehiclesFound} vehicles found so far
                {progress.results && ` · ${progress.results.strongBuy || 0} STRONG_BUY · ${progress.results.buy || 0} BUY`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isActive && (
        <div className="p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">error</span>
          {error}
        </div>
      )}
    </div>
  );
}
