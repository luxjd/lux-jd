"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoAdvanceButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agents/logistics/auto-advance", { method: "POST" });
      const data = await res.json();
      setResult(data);
      if (data.advanced > 0) router.refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRun}
        disabled={running}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 rounded-lg text-xs font-bold hover:bg-cyan-400/20 transition-all disabled:opacity-50"
      >
        <span className={`material-symbols-outlined text-sm ${running ? "animate-spin" : ""}`}>
          {running ? "progress_activity" : "fast_forward"}
        </span>
        {running ? "Checking..." : "Auto-Advance Check"}
      </button>
      {result && !result.error && (
        <p className="text-[10px] text-on-surface-variant mt-1">
          Checked {result.checked} vehicles — {result.advanced > 0
            ? <span className="text-emerald-400">{result.advanced} advanced</span>
            : "no changes needed"}
        </p>
      )}
      {result?.actions?.map((a, i) => (
        <p key={i} className="text-[10px] text-emerald-400 mt-0.5">
          {a.from} → {a.to}: {a.reason}
        </p>
      ))}
      {result?.error && <p className="text-[10px] text-red-400 mt-1">{result.error}</p>}
    </div>
  );
}
