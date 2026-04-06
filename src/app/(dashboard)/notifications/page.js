"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PRIORITY_STYLES = {
  CRITICAL: { bg: "bg-red-400/10", border: "border-red-400/20", text: "text-red-400", badge: "bg-red-400" },
  HIGH: { bg: "bg-amber-400/10", border: "border-amber-400/20", text: "text-amber-400", badge: "bg-amber-400" },
  MEDIUM: { bg: "bg-primary/10", border: "border-primary/20", text: "text-primary", badge: "bg-primary" },
  LOW: { bg: "bg-slate-400/10", border: "border-slate-400/20", text: "text-slate-400", badge: "bg-slate-400" },
};

const TYPE_LABELS = {
  APPROVAL_NEEDED: "Pending Approval",
  ESCALATION: "Escalation",
  FX_ALERT: "FX Alert",
  PIPELINE_DELAY: "Pipeline Delay",
  PRICE_REVIEW: "Price Review",
};

export default function NotificationsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const notifications = data?.notifications || [];
  const filtered = filter === "ALL" ? notifications : notifications.filter((n) => n.priority === filter);

  const FILTERS = [
    { key: "ALL", label: "All", count: notifications.length },
    { key: "CRITICAL", label: "Critical", count: data?.byCritical || 0 },
    { key: "HIGH", label: "High", count: data?.byHigh || 0 },
    { key: "MEDIUM", label: "Medium", count: data?.byMedium || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-lg font-bold">Notifications & Alerts</h2>
          <p className="text-xs text-on-surface-variant">Aggregated from all 8 agents — escalations, approvals, FX alerts, delays</p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface-container-high/30 rounded-xl">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
              {f.label} {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-400/5 border border-red-400/10">
            <span className="material-symbols-outlined text-red-400">error</span>
            <div>
              <p className="font-headline font-bold text-lg text-red-400">{data.byCritical}</p>
              <p className="text-[10px] text-red-400 uppercase">Critical</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-400/5 border border-amber-400/10">
            <span className="material-symbols-outlined text-amber-400">warning</span>
            <div>
              <p className="font-headline font-bold text-lg text-amber-400">{data.byHigh}</p>
              <p className="text-[10px] text-amber-400 uppercase">High</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10">
            <span className="material-symbols-outlined text-primary">info</span>
            <div>
              <p className="font-headline font-bold text-lg text-primary">{data.byMedium}</p>
              <p className="text-[10px] text-primary uppercase">Medium</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-high/30 border border-outline-variant/10">
            <span className="material-symbols-outlined text-on-surface-variant">notifications</span>
            <div>
              <p className="font-headline font-bold text-lg">{data.count}</p>
              <p className="text-[10px] text-on-surface-variant uppercase">Total</p>
            </div>
          </div>
        </div>
      )}

      {/* Notifications list */}
      {loading ? (
        <div className="text-center py-12 text-on-surface-variant">Loading notifications...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-emerald-400/30 mb-3 block">check_circle</span>
          <h3 className="font-headline font-bold text-lg mb-2 text-emerald-400">All Clear</h3>
          <p className="text-sm text-on-surface-variant">No pending notifications. All agents operating normally.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const style = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.LOW;
            return (
              <Link key={n.id} href={n.actionUrl || "#"}
                className={`block ${style.bg} border ${style.border} rounded-2xl p-4 sm:p-5 hover:opacity-90 transition-all`}>
                <div className="flex items-start gap-3">
                  {/* Priority dot + icon */}
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-10 h-10 rounded-xl ${style.bg} border ${style.border} flex items-center justify-center`}>
                      <span className={`material-symbols-outlined ${style.text}`}>{n.icon}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`w-2 h-2 rounded-full ${style.badge} shrink-0`} />
                      <span className={`text-[10px] font-bold uppercase ${style.text}`}>{n.priority}</span>
                      <span className="text-[10px] text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-high/50">{TYPE_LABELS[n.type] || n.type}</span>
                      <span className="text-[10px] text-on-surface-variant ml-auto">{n.source}</span>
                    </div>

                    <h4 className="font-headline font-bold text-sm mb-1">{n.title}</h4>
                    {n.description && <p className="text-xs text-on-surface-variant mb-1">{n.description}</p>}
                    {n.detail && <p className="text-[11px] text-on-surface-variant/70">{n.detail}</p>}

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-on-surface-variant">{n.timestamp ? new Date(n.timestamp).toLocaleString() : ""}</span>
                      <span className={`text-[10px] font-bold ${style.text} flex items-center gap-1`}>
                        View <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
