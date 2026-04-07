import Link from "next/link";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { STAGES as PIPELINE_STAGES } from "@/lib/agents/logistics/pipeline";

export default function PipelinePage() {
  const realData = getPipelineVehicles();

  const allVehicles = (realData?.vehicles || []).map((v) => ({
    id: v.id, make: v.make, model: v.model, year: v.year,
    currentStage: v.currentStage,
    daysInStage: Math.round((Date.now() - new Date(v.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24)),
    landedCostEur: v.landedCostEur || v.landedCost?.totalLandedCostEur || 0,
    margin: v.margin?.grossMarginEur || 0,
    mileage: v.mileageKm || 0,
    color: v.exteriorColor,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-on-surface-variant text-sm">{allVehicles.length} vehicles in pipeline {allVehicles.length > 0 && "(live data)"}</p>
        </div>
        <div className="flex items-center gap-3">
          {allVehicles.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-xs font-bold">
              <span className="material-symbols-outlined text-sm">auto_awesome</span> {allVehicles.length} vehicles
            </span>
          )}
          <Link href="/agents/logistics" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 text-xs font-bold hover:bg-cyan-400/20 transition-all">
            <span className="material-symbols-outlined text-sm">local_shipping</span> Open Agent
          </Link>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> On track
            <span className="w-2 h-2 rounded-full bg-amber-400 ml-2"></span> Delayed
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
        <div className="flex gap-3 sm:gap-4" style={{ minWidth: "1200px" }}>
          {PIPELINE_STAGES.map((stage) => {
            const stageVehicles = allVehicles.filter((v) => v.currentStage === stage.key);
            return (
              <div key={stage.key} className="flex-1 min-w-[140px] sm:min-w-[160px]">
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${stage.bg}`}>
                  <span className={`material-symbols-outlined text-lg ${stage.color}`}>{stage.icon}</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${stage.color}`}>{stage.label}</span>
                  <span className={`ml-auto text-xs font-bold ${stage.color}`}>{stageVehicles.length}</span>
                </div>

                <div className="space-y-2">
                  {stageVehicles.map((v) => (
                    <div key={v.id} className="bg-surface-container rounded-xl border border-outline-variant/10 p-3 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-on-surface">{v.make}</span>
                        <span className="text-[10px] text-on-surface-variant">{v.daysInStage}d</span>
                      </div>
                      <p className="text-sm font-headline font-bold mb-1">{v.model}</p>
                      <p className="text-xs text-on-surface-variant mb-2">{v.year} · {(v.mileage || v.mileageKm || 0).toLocaleString()} km</p>
                      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10">
                        <span className="text-xs text-on-surface-variant">€{((v.landedCostEur || 0) / 1000).toFixed(0)}K</span>
                        <span className="text-xs font-bold text-emerald-400">+€{((v.margin || v.marginEur || 0) / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  ))}

                  {stageVehicles.length === 0 && (
                    <div className="p-4 rounded-xl border border-dashed border-outline-variant/20 text-center">
                      <p className="text-xs text-on-surface-variant">No vehicles</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
