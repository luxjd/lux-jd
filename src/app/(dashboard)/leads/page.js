"use client";

import { useState } from "react";
import { leads } from "@/lib/mock-data";

const TABS = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const STATUS_COLORS = {
  NEW: "bg-blue-400/15 text-blue-400",
  CONTACTED: "bg-amber-400/15 text-amber-400",
  QUALIFIED: "bg-emerald-400/15 text-emerald-400",
  CONVERTED: "bg-primary/15 text-primary",
  LOST: "bg-red-400/15 text-red-400",
};

export default function LeadsPage() {
  const [tab, setTab] = useState("ALL");
  const filtered = tab === "ALL" ? leads : leads.filter((l) => l.status === tab);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-container-high/30 rounded-xl overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              tab === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t} ({t === "ALL" ? leads.length : leads.filter((l) => l.status === t).length})
          </button>
        ))}
      </div>

      {/* Leads table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-outline-variant/20">
                {["Contact", "Vehicle Interest", "Source", "Status", "Date", "Notes"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs uppercase tracking-widest text-on-surface-variant font-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-outline-variant/10 hover:bg-surface-container-high/30 transition-colors cursor-pointer">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <span className="text-primary text-xs font-bold">{l.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{l.name}</p>
                        <p className="text-xs text-on-surface-variant">{l.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm font-headline font-bold">{l.vehicle}</td>
                  <td className="py-3 px-4 text-sm text-on-surface-variant">{l.source}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[l.status]}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-on-surface-variant">{l.date}</td>
                  <td className="py-3 px-4 text-xs text-on-surface-variant max-w-[200px] truncate">{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
