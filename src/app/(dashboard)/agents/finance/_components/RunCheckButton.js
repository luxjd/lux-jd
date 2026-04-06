"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunCheckButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/agents/finance/portfolio", { method: "POST" });
      const data = await res.json();
      setResult(data);
      router.refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <button onClick={handleRun} disabled={running}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(173,198,255,0.4)] transition-all disabled:opacity-50">
        <span className={`material-symbols-outlined text-lg ${running ? "animate-spin" : ""}`}>{running ? "progress_activity" : "account_balance"}</span>
        {running ? "Analyzing..." : "Run Financial Check"}
      </button>

      {running && (
        <p className="mt-2 text-xs text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          Checking FX rates, calculating P&Ls, running tax analysis...
        </p>
      )}

      {result && !result.error && !running && (
        <div className="mt-2 p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          Check complete — {result.vehiclePnLs?.length || 0} vehicles analyzed, FX {result.fxCheck?.status || "OK"}
          {result.fxCheck?.alerts?.length > 0 && ` · ${result.fxCheck.alerts.length} alert(s)`}
        </div>
      )}

      {result?.error && !running && (
        <p className="mt-2 text-xs text-red-400">{result.error}</p>
      )}
    </div>
  );
}
