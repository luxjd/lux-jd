"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { STAGES, STAGE_DURATIONS } from "@/lib/agents/logistics/pipeline";
import { formatKm } from "@/lib/format";

export default function PipelinePage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("timeline"); // timeline | kanban

  useEffect(() => {
    fetch("/api/agents/logistics/vehicles")
      .then((r) => r.json())
      .then((d) => setVehicles(d?.vehicles || []))
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false));
  }, []);

  const allVehicles = vehicles.map((v) => ({
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    currentStage: v.currentStage,
    daysInStage: Math.round(
      (Date.now() - new Date(v.stageEnteredAt).getTime()) / 864e5
    ),
    landedCostEur: v.landedCostEur || v.landedCost?.totalLandedCostEur || 0,
    margin: v.margin?.grossMarginEur || 0,
    mileage: v.mileageKm || 0,
    color: v.exteriorColor,
  }));

  const stageData = STAGES.map((s, i) => ({
    ...s,
    index: i,
    vehicles: allVehicles.filter((v) => v.currentStage === s.key),
    avgDays: STAGE_DURATIONS[s.key] || 0,
  }));

  const totalInPipeline = allVehicles.length;
  const totalValue = allVehicles.reduce((s, v) => s + (v.landedCostEur || 0), 0);
  const totalMargin = allVehicles.reduce((s, v) => s + (v.margin || 0), 0);
  const avgDaysTotal = Object.values(STAGE_DURATIONS).reduce((a, b) => a + b, 0);
  const delayedCount = allVehicles.filter((v) => {
    const expected = STAGE_DURATIONS[v.currentStage] || 7;
    return v.daysInStage > expected;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold">Vehicle Pipeline</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            10-stage import lifecycle — Japan to Germany
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl bg-surface-container border border-outline-variant/10 p-0.5">
            {[
              { key: "timeline", icon: "timeline", label: "Timeline" },
              { key: "kanban", icon: "view_kanban", label: "Kanban" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  view === v.key
                    ? "bg-primary/15 text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-sm">{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>
          <Link
            href="/agents/logistics"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
          >
            <span className="material-symbols-outlined text-sm">local_shipping</span>
            Open Agent
          </Link>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          {
            label: "In Pipeline",
            value: totalInPipeline,
            icon: "directions_car",
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Capital Deployed",
            value: totalValue > 0 ? `€${(totalValue / 1000).toFixed(0)}K` : "—",
            icon: "account_balance",
            color: "text-secondary",
            bg: "bg-secondary/10",
          },
          {
            label: "Expected Margin",
            value: totalMargin > 0 ? `€${(totalMargin / 1000).toFixed(0)}K` : "—",
            icon: "trending_up",
            color: "text-emerald-400",
            bg: "bg-emerald-400/10",
          },
          {
            label: "Delayed",
            value: delayedCount,
            icon: "warning",
            color: delayedCount > 0 ? "text-amber-400" : "text-on-surface-variant",
            bg: delayedCount > 0 ? "bg-amber-400/10" : "bg-surface-container",
          },
          {
            label: "Avg. Cycle",
            value: `${avgDaysTotal}d`,
            icon: "schedule",
            color: "text-cyan-400",
            bg: "bg-cyan-400/10",
          },
        ].map((m, i) => (
          <div
            key={i}
            className="bg-surface-container rounded-2xl border border-outline-variant/10 p-3 sm:p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`material-symbols-outlined text-lg ${m.color}`}>
                {m.icon}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">
                {m.label}
              </span>
            </div>
            <p className="font-headline text-xl sm:text-2xl font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {view === "timeline" ? (
        <TimelineView stageData={stageData} totalVehicles={totalInPipeline} />
      ) : (
        <KanbanView stageData={stageData} />
      )}
    </div>
  );
}

/* ── Timeline View ───────────────────────────────────────── */

function TimelineView({ stageData, totalVehicles }) {
  return (
    <div className="space-y-3">
      {/* Stage journey — connected visual */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary text-lg">route</span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
            Pipeline Journey
          </h2>
          <span className="ml-auto text-[10px] text-on-surface-variant">
            ~74 days total cycle
          </span>
        </div>

        {/* Horizontal connected stage indicators */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-5 left-5 right-5 h-px bg-outline-variant/20" />
          {totalVehicles > 0 && (
            <div
              className="absolute top-5 left-5 h-px bg-gradient-to-r from-primary to-primary/0 transition-all duration-700"
              style={{
                width: `${Math.max(
                  5,
                  (Math.max(...stageData.map((s) => (s.vehicles.length > 0 ? s.index : 0))) /
                    (stageData.length - 1)) *
                    100
                )}%`,
              }}
            />
          )}

          <div className="relative flex justify-between">
            {stageData.map((stage) => {
              const hasVehicles = stage.vehicles.length > 0;
              return (
                <div key={stage.key} className="flex flex-col items-center" style={{ width: "10%" }}>
                  {/* Node */}
                  <div
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
                      hasVehicles
                        ? `${stage.bg} border-current ${stage.color} shadow-lg`
                        : "bg-surface-container border-outline-variant/20 text-on-surface-variant"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{stage.icon}</span>
                    {hasVehicles && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center">
                        {stage.vehicles.length}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`mt-2 text-[10px] font-bold text-center leading-tight ${
                      hasVehicles ? stage.color : "text-on-surface-variant/60"
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="text-[9px] text-on-surface-variant/40 mt-0.5">
                    {stage.avgDays}d avg
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stage breakdown rows */}
      {stageData.map((stage) => {
        const hasVehicles = stage.vehicles.length > 0;
        return (
          <div
            key={stage.key}
            className={`rounded-2xl border transition-all ${
              hasVehicles
                ? "bg-surface-container border-outline-variant/10"
                : "bg-surface-container/50 border-outline-variant/5"
            }`}
          >
            {/* Stage header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${stage.bg}`}
              >
                <span className={`material-symbols-outlined text-lg ${stage.color}`}>
                  {stage.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{stage.label}</span>
                  <span className="text-[10px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded-md">
                    Stage {stage.index + 1}/10
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">
                  Expected duration: {stage.avgDays} days
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    hasVehicles
                      ? `${stage.bg} ${stage.color}`
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {stage.vehicles.length} vehicle{stage.vehicles.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Vehicle cards for this stage */}
            {hasVehicles && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {stage.vehicles.map((v) => {
                    const isDelayed = v.daysInStage > (stage.avgDays || 7);
                    return (
                      <div
                        key={v.id}
                        className={`rounded-xl border p-3 transition-all hover:border-primary/30 ${
                          isDelayed
                            ? "bg-amber-400/5 border-amber-400/15"
                            : "bg-surface-container-high/50 border-outline-variant/10"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <p className="text-sm font-bold">
                              {v.make} {v.model}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                              {v.year} · {formatKm(v.mileage || 0)} km
                              {v.color && ` · ${v.color}`}
                            </p>
                          </div>
                          <span
                            className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              isDelayed
                                ? "bg-amber-400/15 text-amber-400"
                                : "bg-emerald-400/10 text-emerald-400"
                            }`}
                          >
                            {isDelayed && (
                              <span className="material-symbols-outlined text-xs">warning</span>
                            )}
                            {v.daysInStage}d
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-1 rounded-full bg-outline-variant/10 mt-2 mb-2">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isDelayed ? "bg-amber-400" : "bg-emerald-400"
                            }`}
                            style={{
                              width: `${Math.min(100, ((stage.index + 1) / 10) * 100)}%`,
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-on-surface-variant">
                            €{((v.landedCostEur || 0) / 1000).toFixed(0)}K cost
                          </span>
                          {v.margin > 0 && (
                            <span className="text-[11px] font-bold text-emerald-400">
                              +€{((v.margin || 0) / 1000).toFixed(0)}K
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {totalVehicles === 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 sm:p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-primary text-3xl">
              local_shipping
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold mb-2">No vehicles in pipeline</h3>
          <p className="text-on-surface-variant text-sm max-w-md mx-auto mb-6">
            Vehicles enter the pipeline when approved by the Orchestrator or sent from the Valuation Agent.
            Start by scanning for opportunities.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/agents/valuation"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-sm">search</span>
              Valuate a Vehicle
            </Link>
            <Link
              href="/agents/jp-sourcing"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-outline-variant/20 text-on-surface text-xs font-bold hover:border-primary/30 transition-all"
            >
              <span className="material-symbols-outlined text-sm">travel_explore</span>
              Scan Auctions
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Kanban View ─────────────────────────────────────────── */

function KanbanView({ stageData }) {
  return (
    <div className="overflow-x-auto pb-4 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
      <div className="flex gap-3" style={{ minWidth: "1400px" }}>
        {stageData.map((stage) => {
          const hasVehicles = stage.vehicles.length > 0;
          return (
            <div key={stage.key} className="flex-1 min-w-[140px]">
              {/* Column header */}
              <div
                className={`flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl border ${
                  hasVehicles
                    ? `${stage.bg} border-current/10`
                    : "bg-surface-container border-outline-variant/10"
                }`}
              >
                <span className={`material-symbols-outlined text-base ${stage.color}`}>
                  {stage.icon}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider flex-1 ${
                    hasVehicles ? stage.color : "text-on-surface-variant"
                  }`}
                >
                  {stage.label}
                </span>
                <span
                  className={`text-[10px] font-bold w-5 h-5 rounded-md flex items-center justify-center ${
                    hasVehicles
                      ? `${stage.bg} ${stage.color}`
                      : "text-on-surface-variant"
                  }`}
                >
                  {stage.vehicles.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px]">
                {stage.vehicles.map((v) => {
                  const isDelayed = v.daysInStage > (stage.avgDays || 7);
                  return (
                    <div
                      key={v.id}
                      className={`rounded-xl border p-3 transition-all hover:border-primary/30 cursor-pointer ${
                        isDelayed
                          ? "bg-amber-400/5 border-amber-400/15"
                          : "bg-surface-container border-outline-variant/10"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                          {v.make}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isDelayed
                              ? "bg-amber-400/15 text-amber-400"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          {v.daysInStage}d
                        </span>
                      </div>
                      <p className="text-sm font-bold mb-0.5">{v.model}</p>
                      <p className="text-[11px] text-on-surface-variant mb-2">
                        {v.year} · {formatKm(v.mileage || 0)} km
                      </p>

                      {/* Mini progress */}
                      <div className="w-full h-0.5 rounded-full bg-outline-variant/10 mb-2">
                        <div
                          className={`h-full rounded-full ${isDelayed ? "bg-amber-400" : stage.color.replace("text-", "bg-")}`}
                          style={{
                            width: `${Math.min(100, ((stage.index + 1) / 10) * 100)}%`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-on-surface-variant">
                          €{((v.landedCostEur || 0) / 1000).toFixed(0)}K
                        </span>
                        {v.margin > 0 && (
                          <span className="text-[10px] font-bold text-emerald-400">
                            +€{((v.margin || 0) / 1000).toFixed(0)}K
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {!hasVehicles && (
                  <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-outline-variant/15 min-h-[100px]">
                    <span className="material-symbols-outlined text-on-surface-variant/20 text-2xl mb-1">
                      inbox
                    </span>
                    <p className="text-[10px] text-on-surface-variant/40">Empty</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
