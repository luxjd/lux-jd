"use client";

import { useState } from "react";
import ConversationThread from "./ConversationThread";

const STATUS_STYLES = { NEW: "bg-primary/15 text-primary", QUALIFIED: "bg-emerald-400/15 text-emerald-400", ESCALATED: "bg-red-400/15 text-red-400", CONTACTED: "bg-amber-400/15 text-amber-400", CONVERTED: "bg-primary/15 text-primary", LOST: "bg-slate-400/10 text-slate-400" };
const BUYER_STYLES = { COLLECTOR: "text-secondary", SERIOUS: "text-emerald-400", TRADE: "text-primary", BROWSER: "text-on-surface-variant", COMPETITOR: "text-red-400" };

export default function LeadsPanel({ leads = [] }) {
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  if (selectedLeadId) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedLeadId(null)} className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Back to leads
        </button>
        <ConversationThread leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 text-center">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 mb-2 block">forum</span>
        <p className="text-sm text-on-surface-variant">No leads yet. Send an inquiry above to create the first lead.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
      <h3 className="font-headline font-bold text-lg mb-4">Recent Leads ({leads.length})</h3>
      <div className="space-y-2">
        {leads.slice(0, 15).map((lead) => (
          <button
            key={lead.id}
            onClick={() => setSelectedLeadId(lead.id)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-container-high/30 hover:bg-surface-container-high/60 transition-all text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-violet-400/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-violet-400 text-sm">person</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold truncate">{lead.name || "Unknown"}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${STATUS_STYLES[lead.status] || "bg-slate-400/10 text-slate-400"}`}>{lead.status}</span>
                  {lead.buyerType && (
                    <span className={`text-[9px] font-bold uppercase ${BUYER_STYLES[lead.buyerType] || ""}`}>{lead.buyerType}</span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant truncate">
                  {lead.vehicle?.make && `${lead.vehicle.make} ${lead.vehicle.model} · `}{lead.source || "platform"} · {lead.createdAt ? lead.createdAt.split("T")[0] : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {lead.score != null && <span className="text-[10px] font-bold">{lead.score}/100</span>}
              <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
