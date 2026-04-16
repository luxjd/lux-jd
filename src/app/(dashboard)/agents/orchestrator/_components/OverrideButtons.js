"use client";

import { useState } from "react";

export default function OverrideButtons({ decision }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(null);

  if (result) {
    const isApproved = result.decision === "HUMAN_APPROVED";
    return (
      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${isApproved ? "bg-emerald-400/15 text-emerald-400" : "bg-red-400/15 text-red-400"}`}>
        <span className="material-symbols-outlined text-xs">{isApproved ? "check_circle" : "cancel"}</span>
        {isApproved ? "Approved → Pipeline" : "Rejected by Operator"}
      </span>
    );
  }

  if (decision.decision !== "HUMAN_REVIEW") return null;

  const handleOverride = async (action) => {
    setLoading(action);
    try {
      // Parse vehicleName: "Ferrari 488 GTB 2018" → make, model, year
      const parts = (decision.vehicleName || "").split(" ");
      const year = parseInt(parts[parts.length - 1]) || 2024;
      const make = parts[0] || "Unknown";
      const model = parts.length > 2 ? parts.slice(1, -1).join(" ") : parts[1] || "Unknown";

      const res = await fetch("/api/agents/orchestrator/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: decision.opportunityId,
          vehicleName: decision.vehicleName,
          opportunity: {
            id: decision.opportunityId,
            vehicle: { make, model, year, driveSide: "RHD" },
            landedCost: decision.financials ? {
              totalLandedCostEur: decision.financials.landedCost || 0,
              totalCashOutlayEur: decision.financials.cashOutlay || decision.financials.landedCost || 0,
              fxRateUsed: 183,
            } : {},
            margin: decision.financials ? {
              grossMarginEur: decision.financials.margin || 0,
              grossMarginPct: decision.financials.marginPct || 0,
            } : {},
            pricing: {
              askingPriceJpy: 0,
              deMarketMedian: decision.financials ? (decision.financials.landedCost || 0) + (decision.financials.margin || 0) : 0,
            },
            risk: decision.risk || {},
            confidence: 0.7,
            maxBidJpy: decision.financials?.maxBidJpy || 0,
          },
          action,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Request failed");
        setResult({ decision: action === "APPROVE" ? "HUMAN_APPROVED" : "HUMAN_REJECTED", error: errorText });
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <button
        onClick={() => handleOverride("APPROVE")}
        disabled={!!loading}
        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:shadow-[0_0_10px_rgba(52,211,153,0.3)] transition-all disabled:opacity-50">
        {loading === "APPROVE" ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xs">check</span>}
        Approve & Send to Pipeline
      </button>
      <button
        onClick={() => handleOverride("REJECT")}
        disabled={!!loading}
        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/80 text-white rounded-lg text-[10px] font-bold hover:shadow-[0_0_10px_rgba(248,113,113,0.3)] transition-all disabled:opacity-50">
        {loading === "REJECT" ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xs">close</span>}
        Reject
      </button>
    </div>
  );
}
