"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatEur } from "@/lib/format";

const TABS = ["ALL", "ACTIVE", "SOLD", "DRAFT"];
const STATUS_STYLES = { ACTIVE: "bg-emerald-400/15 text-emerald-400", SOLD: "bg-primary/15 text-primary", DRAFT: "bg-amber-400/15 text-amber-400", PAUSED: "bg-slate-400/10 text-slate-400" };

export default function ListingsPage() {
  const [tab, setTab] = useState("ALL");
  const [realListings, setRealListings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents/listing/listings")
      .then((r) => r.json())
      .then((data) => {
        if (data.listings?.length > 0) setRealListings(data.listings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasRealData = realListings && realListings.length > 0;

  const allListings = hasRealData
    ? realListings.map((l) => ({
        id: l.id,
        make: l.vehicle?.make,
        model: l.vehicle?.model,
        year: l.vehicle?.year,
        color: l.vehicle?.exteriorColor,
        listedPrice: l.currentPrice,
        status: l.status,
        daysOnMarket: l.daysOnMarket || 0,
        views: l.metrics?.totalViews || 0,
        inquiries: l.metrics?.totalInquiries || 0,
        platform: Object.values(l.platforms || {}).find((p) => p.status === "PUBLISHED")?.platform || "LuxJD",
        aiPowered: l.aiPowered,
        platformCount: l.publishing?.totalPublished || 0,
        pricingStrategy: l.pricing?.pricing_strategy,
      }))
    : [];

  const filtered = tab === "ALL" ? allListings : allListings.filter((l) => l.status === tab);
  const fmt = formatEur;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-surface-container-high/30 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${tab === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
              {t} ({t === "ALL" ? allListings.length : allListings.filter((l) => l.status === t).length})
            </button>
          ))}
        </div>
        <Link href="/agents/listing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all shrink-0">
          <span className="material-symbols-outlined text-sm">edit_note</span> Open Agent
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-on-surface-variant">Loading listings...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <div key={l.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden hover:border-primary/30 transition-all">
              <div className="h-36 sm:h-40 bg-surface-container-high flex items-center justify-center relative">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">directions_car</span>
                {l.aiPowered && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">auto_awesome</span> AI
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-headline font-bold text-sm sm:text-base">{l.make} {l.model}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[l.status] || STATUS_STYLES.DRAFT}`}>{l.status}</span>
                </div>
                <p className="text-xs sm:text-sm text-on-surface-variant mb-3 sm:mb-4">
                  {l.year} · {l.color} · {l.platform}
                  {l.platformCount > 1 && ` +${l.platformCount - 1}`}
                </p>
                <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-outline-variant/10">
                  <p className="font-headline text-lg sm:text-xl font-bold">{fmt(l.listedPrice)}</p>
                  <div className="flex gap-3 sm:gap-4 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">visibility</span>{l.views}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">chat</span>{l.inquiries}</span>
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">schedule</span>{l.daysOnMarket}d</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
