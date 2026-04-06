"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EvaluateButton({ opportunities }) {
  const [evaluating, setEvaluating] = useState(false);
  const [results, setResults] = useState(null);
  const router = useRouter();

  const handleEvaluateAll = async () => {
    setEvaluating(true);
    setResults(null);
    const evaluated = [];

    for (const opp of opportunities) {
      try {
        const res = await fetch("/api/agents/orchestrator/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunity: opp }),
        });
        const data = await res.json();
        evaluated.push(data);
      } catch (err) {
        evaluated.push({ error: err.message, vehicleName: `${opp.vehicle?.make} ${opp.vehicle?.model}` });
      }
    }

    setResults(evaluated);
    setEvaluating(false);
    router.refresh();
  };

  const approved = results?.filter((r) => r.decision === "AUTO_APPROVE").length || 0;
  const review = results?.filter((r) => r.decision === "HUMAN_REVIEW").length || 0;
  const rejected = results?.filter((r) => r.decision === "REJECT").length || 0;

  return (
    <div>
      <button onClick={handleEvaluateAll} disabled={evaluating || !opportunities.length}
        className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-on-secondary rounded-xl font-bold text-sm hover:shadow-[0_0_20px_rgba(255,138,101,0.4)] transition-all disabled:opacity-50">
        <span className={`material-symbols-outlined text-lg ${evaluating ? "animate-spin" : ""}`}>{evaluating ? "progress_activity" : "gavel"}</span>
        {evaluating ? `Evaluating ${opportunities.length}...` : `Evaluate ${opportunities.length} Opportunities`}
      </button>

      {results && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-sm">
          <span className="text-emerald-400 font-bold">{approved} APPROVED</span> ·
          <span className="text-amber-400 font-bold ml-1">{review} REVIEW</span> ·
          <span className="text-slate-400 font-bold ml-1">{rejected} REJECTED</span>
        </div>
      )}
    </div>
  );
}
