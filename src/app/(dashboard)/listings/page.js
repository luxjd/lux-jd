"use client";

import { useState } from "react";
import { listings } from "@/lib/mock-data";

const TABS = ["ALL", "ACTIVE", "SOLD", "DRAFT"];

export default function ListingsPage() {
  const [tab, setTab] = useState("ALL");

  const filtered = tab === "ALL" ? listings : listings.filter((l) => l.status === tab);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-container-high/30 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t} ({t === "ALL" ? listings.length : listings.filter((l) => l.status === t).length})
          </button>
        ))}
      </div>

      {/* Listing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((l) => (
          <div key={l.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden hover:border-primary/30 transition-all">
            {/* Placeholder image */}
            <div className="h-40 bg-surface-container-high flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">directions_car</span>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-headline font-bold">{l.make} {l.model}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  l.status === "ACTIVE" ? "bg-emerald-400/15 text-emerald-400" :
                  l.status === "SOLD" ? "bg-primary/15 text-primary" :
                  "bg-amber-400/15 text-amber-400"
                }`}>
                  {l.status}
                </span>
              </div>

              <p className="text-sm text-on-surface-variant mb-4">{l.year} &middot; {l.color} &middot; {l.platform}</p>

              <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10">
                <div>
                  <p className="font-headline text-xl font-bold">€{l.listedPrice.toLocaleString()}</p>
                </div>
                <div className="flex gap-4 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    {l.views}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">chat</span>
                    {l.inquiries}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {l.daysOnMarket}d
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
