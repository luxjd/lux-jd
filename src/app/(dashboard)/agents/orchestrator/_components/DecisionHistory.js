"use client";

import { useState, useCallback } from "react";

const DECISION_STYLES = {
  AUTO_APPROVE: "bg-emerald-400/15 text-emerald-400",
  HUMAN_APPROVED: "bg-emerald-400/15 text-emerald-400",
  HUMAN_REVIEW: "bg-amber-400/15 text-amber-400",
  REJECT: "bg-slate-400/10 text-slate-400",
  HUMAN_REJECTED: "bg-red-400/15 text-red-400",
};

const fmt = (n) => n != null && !isNaN(n) ? `€${Number(n).toLocaleString("de-DE")}` : "—";
const fmtJpy = (n) => n != null && !isNaN(n) ? `¥${Number(n).toLocaleString("de-DE")}` : "—";

function DecisionCard({ d, onOverride }) {
  const [loading, setLoading] = useState(null);

  const handleOverride = async (action) => {
    setLoading(action);
    try {
      // Parse vehicleName for the opportunity data
      const parts = (d.vehicleName || "").split(" ");
      const year = parseInt(parts[parts.length - 1]) || 2024;
      const make = parts[0] || "Unknown";
      const model = parts.length > 2 ? parts.slice(1, -1).join(" ") : parts[1] || "Unknown";

      const res = await fetch("/api/agents/orchestrator/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: d.opportunityId,
          vehicleName: d.vehicleName,
          opportunity: {
            id: d.opportunityId,
            vehicle: { make, model, year, driveSide: "RHD" },
            landedCost: d.financials ? {
              totalLandedCostEur: d.financials.landedCost || 0,
              totalCashOutlayEur: d.financials.cashOutlay || d.financials.landedCost || 0,
              fxRateUsed: 183,
            } : {},
            margin: d.financials ? {
              grossMarginEur: d.financials.margin || 0,
              grossMarginPct: d.financials.marginPct || 0,
            } : {},
            pricing: {
              askingPriceJpy: 0,
              deMarketMedian: d.financials ? (d.financials.landedCost || 0) + (d.financials.margin || 0) : 0,
            },
            risk: d.risk || {},
            confidence: 0.7,
            maxBidJpy: d.financials?.maxBidJpy || 0,
          },
          action,
        }),
      });

      const newDecision = action === "APPROVE" ? "HUMAN_APPROVED" : "HUMAN_REJECTED";

      // Notify parent to move this card between sections instantly
      onOverride(d.opportunityId || d.id, newDecision);
    } catch (err) {
      console.error("Override failed:", err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-surface-container-high/30 rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-headline font-bold text-sm">{d.vehicleName}</h4>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${DECISION_STYLES[d.decision]}`}>{d.decision?.replace(/_/g, " ")}</span>
        </div>
        <span className="text-[10px] text-on-surface-variant">{new Date(d.createdAt || d.savedAt).toLocaleString("de-DE")}</span>
      </div>

      {d.steps?.length > 0 && (
        <div className="flex gap-1 mb-2">
          {d.steps.map((s) => (
            <div key={s.step} className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${s.result === "PASS" ? "bg-emerald-400/15 text-emerald-400" : s.result === "FAIL" ? "bg-red-400/15 text-red-400" : "bg-amber-400/15 text-amber-400"}`} title={`Step ${s.step}: ${s.name} — ${s.result}`}>
              {s.step}
            </div>
          ))}
          <span className="text-[10px] text-on-surface-variant ml-2 self-center">
            {d.summary?.passCount}✓ {d.summary?.failCount}✗ {d.summary?.flagCount}⚠
          </span>
        </div>
      )}

      <p className="text-xs text-on-surface-variant">{d.decisionReason?.substring(0, 150)}{d.decisionReason?.length > 150 ? "..." : ""}</p>

      {d.financials && (d.financials.margin != null || d.financials.maxBidJpy) && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs">
          {d.financials.margin != null && <span>Margin: <strong className={d.financials.margin >= 0 ? "text-emerald-400" : "text-red-400"}>{fmt(d.financials.margin)} ({d.financials.marginPct}%)</strong></span>}
          {d.risk?.compositeScore && <span>Risk: <strong>{d.risk.compositeScore}/3.0</strong></span>}
          {d.financials.maxBidJpy && <span>Max bid: <strong className="text-secondary">{fmtJpy(d.financials.maxBidJpy)}</strong></span>}
        </div>
      )}

      {d.brief && (
        <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs font-bold text-primary mb-1">{d.brief.headline}</p>
          <p className="text-xs text-on-surface-variant">{d.brief.executive_summary?.substring(0, 200)}</p>
          {d.brief.bull_case && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><p className="text-[9px] uppercase text-emerald-400 font-bold">Bull Case</p><p className="text-[10px] text-on-surface-variant">{d.brief.bull_case?.substring(0, 120)}</p></div>
              <div><p className="text-[9px] uppercase text-red-400 font-bold">Bear Case</p><p className="text-[10px] text-on-surface-variant">{d.brief.bear_case?.substring(0, 120)}</p></div>
            </div>
          )}
        </div>
      )}

      {d.decision === "HUMAN_REVIEW" && d.flagReasons?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.flagReasons.map((r, j) => (
            <span key={j} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 text-[10px]">
              <span className="material-symbols-outlined text-[10px]">warning</span> {r}
            </span>
          ))}
        </div>
      )}

      {/* Approve / Reject buttons for HUMAN_REVIEW */}
      {d.decision === "HUMAN_REVIEW" && (
        <div className="flex items-center gap-1.5 mt-3">
          <button
            onClick={() => handleOverride("APPROVE")}
            disabled={!!loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:shadow-[0_0_10px_rgba(52,211,153,0.3)] transition-all disabled:opacity-50">
            {loading === "APPROVE" ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xs">send</span>}
            Send to Pipeline
          </button>
          <button
            onClick={() => handleOverride("REJECT")}
            disabled={!!loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500/80 text-white rounded-lg text-[10px] font-bold hover:shadow-[0_0_10px_rgba(248,113,113,0.3)] transition-all disabled:opacity-50">
            {loading === "REJECT" ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xs">close</span>}
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon, count, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className={`rounded-2xl border ${color.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between p-4 ${color.bg} hover:brightness-110 transition-all`}
      >
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-lg ${color.text}`}>{icon}</span>
          <h4 className={`font-headline font-bold text-sm ${color.text}`}>{title}</h4>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color.badge}`}>{count}</span>
        </div>
        <span className={`material-symbols-outlined text-lg ${color.text} transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="p-4 space-y-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DecisionHistory({ decisions: initialDecisions }) {
  // Local state so we can move cards between sections instantly
  const [decisions, setDecisions] = useState(() => {
    // Deduplicate: keep only the latest decision per vehicle
    // Decisions arrive newest-first from DB. Use opportunityId or vehicleName as key.
    const seen = new Set();
    return initialDecisions.filter((d) => {
      const key = d.opportunityId || d.vehicleName || d.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  // Called by DecisionCard when user clicks Approve or Reject
  const handleOverride = useCallback((oppId, newDecision) => {
    setDecisions((prev) =>
      prev.map((d) => {
        const matchId = d.opportunityId || d.id;
        if (matchId === oppId) {
          return {
            ...d,
            decision: newDecision,
            decisionReason: newDecision === "HUMAN_APPROVED"
              ? `HUMAN APPROVED: Operator reviewed and approved.`
              : `HUMAN REJECTED: Operator reviewed and rejected.`,
          };
        }
        return d;
      })
    );
  }, []);

  const pending = decisions.filter((d) => d.decision === "HUMAN_REVIEW");
  const approved = decisions.filter((d) => d.decision === "AUTO_APPROVE" || d.decision === "HUMAN_APPROVED");
  const rejected = decisions.filter((d) => d.decision === "REJECT" || d.decision === "HUMAN_REJECTED");

  if (decisions.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-headline font-bold text-lg">Decision History ({decisions.length})</h3>

      {/* Pending Review — always open */}
      <CollapsibleSection
        title="Pending Review"
        icon="pending"
        count={pending.length}
        color={{ border: "border-amber-400/20", bg: "bg-amber-400/5", text: "text-amber-400", badge: "bg-amber-400/15 text-amber-400" }}
        defaultOpen={true}
      >
        {pending.map((d) => <DecisionCard key={d.id || d.opportunityId} d={d} onOverride={handleOverride} />)}
      </CollapsibleSection>

      {/* Approved */}
      <CollapsibleSection
        title="Approved"
        icon="check_circle"
        count={approved.length}
        color={{ border: "border-emerald-400/20", bg: "bg-emerald-400/5", text: "text-emerald-400", badge: "bg-emerald-400/15 text-emerald-400" }}
        defaultOpen={false}
      >
        {approved.map((d) => <DecisionCard key={d.id || d.opportunityId} d={d} onOverride={handleOverride} />)}
      </CollapsibleSection>

      {/* Rejected */}
      <CollapsibleSection
        title="Rejected"
        icon="cancel"
        count={rejected.length}
        color={{ border: "border-red-400/20", bg: "bg-red-400/5", text: "text-red-400", badge: "bg-red-400/15 text-red-400" }}
        defaultOpen={false}
      >
        {rejected.map((d) => <DecisionCard key={d.id || d.opportunityId} d={d} onOverride={handleOverride} />)}
      </CollapsibleSection>
    </div>
  );
}
