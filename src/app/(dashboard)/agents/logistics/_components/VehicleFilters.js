"use client";

import { useState } from "react";
import VehicleCard from "./VehicleCard";

const STAGE_LABELS = {
  ALL: "All Stages",
  SOURCED: "Sourced", PURCHASED: "Purchased", JP_TRANSPORT: "JP Transport",
  AT_PORT_JP: "Port JP", IN_TRANSIT: "In Transit", AT_PORT_DE: "Port DE",
  CUSTOMS: "Customs", WORKSHOP: "Workshop", TUV: "TUV", READY_FOR_SALE: "Ready",
};

const SORT_OPTIONS = [
  { id: "stage", label: "Stage (pipeline order)" },
  { id: "days-desc", label: "Days in stage (longest first)" },
  { id: "days-asc", label: "Days in stage (shortest first)" },
  { id: "value-desc", label: "Value (highest first)" },
  { id: "name", label: "Name (A-Z)" },
];

export default function VehicleFilters({ vehicles, stageInfo, events }) {
  const [stageFilter, setStageFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("stage");
  const [search, setSearch] = useState("");

  const STAGES_ORDER = ["SOURCED", "PURCHASED", "JP_TRANSPORT", "AT_PORT_JP", "IN_TRANSIT", "AT_PORT_DE", "CUSTOMS", "WORKSHOP", "TUV", "READY_FOR_SALE"];

  let filtered = vehicles;
  if (stageFilter !== "ALL") filtered = filtered.filter((v) => v.currentStage === stageFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((v) => `${v.make} ${v.model} ${v.year} ${v.exteriorColor}`.toLowerCase().includes(q));
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "stage") return STAGES_ORDER.indexOf(a.currentStage) - STAGES_ORDER.indexOf(b.currentStage);
    if (sortBy === "days-desc") return new Date(a.stageEnteredAt) - new Date(b.stageEnteredAt);
    if (sortBy === "days-asc") return new Date(b.stageEnteredAt) - new Date(a.stageEnteredAt);
    if (sortBy === "value-desc") return (b.pricing?.deMarketMedian || 0) - (a.pricing?.deMarketMedian || 0);
    if (sortBy === "name") return `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`);
    return 0;
  });

  const stageCounts = {};
  for (const v of vehicles) stageCounts[v.currentStage] = (stageCounts[v.currentStage] || 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="font-headline font-bold text-lg">Vehicles ({filtered.length}{filtered.length !== vehicles.length ? ` of ${vehicles.length}` : ""})</h3>
        <div className="flex items-center gap-2">
          <div>
            <input type="text" placeholder="🔍 Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-surface-container-high border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm w-48 focus:border-primary/30 focus:outline-none" />
          </div>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="bg-surface-container-high border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
            {Object.entries(STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}{k !== "ALL" && stageCounts[k] ? ` (${stageCounts[k]})` : k === "ALL" ? ` (${vehicles.length})` : ""}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="bg-surface-container-high border border-outline-variant/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {sorted.map((v) => (
        <VehicleCard key={v.id} vehicle={v} stageInfo={stageInfo} events={events} />
      ))}

      {sorted.length === 0 && (
        <div className="text-center py-8 text-on-surface-variant">
          <span className="material-symbols-outlined text-3xl mb-2 block">filter_list_off</span>
          <p className="text-sm">No vehicles match the current filters</p>
        </div>
      )}
    </div>
  );
}
