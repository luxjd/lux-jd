"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = ["SOURCED", "PURCHASED", "JP_TRANSPORT", "AT_PORT_JP", "IN_TRANSIT", "AT_PORT_DE", "CUSTOMS", "WORKSHOP", "TUV", "READY_FOR_SALE"];

export default function AdvanceStageButton({ vehicleId, currentStage, vehicleName }) {
  const [advancing, setAdvancing] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  const currentIdx = STAGES.indexOf(currentStage);
  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;

  if (!nextStage) return <span className="text-xs text-emerald-400 font-bold">COMPLETE</span>;

  const handleAdvance = async () => {
    setAdvancing(true);
    setResult(null);
    try {
      const res = await fetch("/api/agents/logistics/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, targetStage: nextStage }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) router.refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleAdvance}
        disabled={advancing}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:shadow-[0_0_10px_rgba(248,113,113,0.3)] transition-all disabled:opacity-50"
      >
        <span className={`material-symbols-outlined text-sm ${advancing ? "animate-spin" : ""}`}>
          {advancing ? "progress_activity" : "arrow_forward"}
        </span>
        → {nextStage.replace("_", " ")}
      </button>
      {result?.error && <p className="text-[10px] text-red-400 mt-1">{result.error}</p>}
      {result?.success && result.photoRequired && (
        <p className="text-[10px] text-amber-400 mt-1">Photo documentation required at this stage</p>
      )}
    </div>
  );
}
