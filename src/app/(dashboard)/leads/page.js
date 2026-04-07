"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const TABS = ["ALL", "NEW", "QUALIFIED", "ESCALATED", "CONTACTED", "CONVERTED", "LOST"];
const STATUS_COLORS = {
  NEW: "bg-primary/15 text-primary", QUALIFIED: "bg-emerald-400/15 text-emerald-400",
  ESCALATED: "bg-red-400/15 text-red-400", CONTACTED: "bg-amber-400/15 text-amber-400",
  CONVERTED: "bg-primary/15 text-primary", LOST: "bg-slate-400/10 text-slate-400",
};
const BUYER_COLORS = { COLLECTOR: "text-secondary", SERIOUS: "text-emerald-400", TRADE: "text-primary", BROWSER: "text-on-surface-variant", COMPETITOR: "text-red-400" };

export default function LeadsPage() {
  const [tab, setTab] = useState("ALL");
  const [realLeads, setRealLeads] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/concierge/leads")
      .then((r) => r.json())
      .then((data) => { if (data.leads?.length > 0) setRealLeads(data.leads); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasRealData = realLeads && realLeads.length > 0;

  const allLeads = hasRealData
    ? realLeads.map((l) => ({
        id: l.id, name: l.name, email: l.email, vehicle: l.vehicle,
        source: l.source, status: l.status, date: l.createdAt?.split("T")[0],
        notes: l.escalationReason || `${l.buyerType} · Score ${l.score}/100`,
        score: l.score, buyerType: l.buyerType, escalated: l.escalated,
        offerPrice: l.offerPrice,
      }))
    : [];

  const filtered = tab === "ALL" ? allLeads : allLeads.filter((l) => l.status === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-surface-container-high/30 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${tab === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
              {t} ({t === "ALL" ? allLeads.length : allLeads.filter((l) => l.status === t).length})
            </button>
          ))}
        </div>
        <Link href="/agents/concierge" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-400/10 border border-violet-400/20 text-violet-400 text-xs font-bold hover:bg-violet-400/20 transition-all shrink-0">
          <span className="material-symbols-outlined text-sm">support_agent</span> Open Agent
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-on-surface-variant">Loading leads...</div>
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  {["Contact", "Vehicle", "Source", "Type", "Score", "Status", "Date"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 sm:px-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors">
                    <td className="py-3 px-3 sm:px-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                          <span className="text-primary text-xs font-bold">{l.name?.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold truncate flex items-center gap-1">
                            {l.name}
                            {l.isReal && <span className="text-[8px] text-primary">(AI)</span>}
                          </p>
                          <p className="text-[10px] sm:text-xs text-on-surface-variant truncate">{l.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm font-headline font-bold">{l.vehicle}</td>
                    <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-on-surface-variant">{l.source}</td>
                    <td className="py-3 px-3 sm:px-4">
                      <span className={`text-[10px] font-bold ${BUYER_COLORS[l.buyerType] || "text-on-surface-variant"}`}>{l.buyerType || "—"}</span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-xs font-bold">{l.score || "—"}</td>
                    <td className="py-3 px-3 sm:px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[l.status] || STATUS_COLORS.NEW}`}>{l.status}</span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-[10px] sm:text-xs text-on-surface-variant">{l.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
