import { vehicles, PIPELINE_STAGES } from "@/lib/mock-data";

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-on-surface-variant text-sm">{vehicles.length} vehicles in pipeline</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span> On track
          <span className="w-2 h-2 rounded-full bg-amber-400 ml-2"></span> Delayed
        </div>
      </div>

      {/* Kanban board */}
      <div className="overflow-x-auto pb-4 -mx-6 px-6">
        <div className="flex gap-4" style={{ minWidth: "1600px" }}>
          {PIPELINE_STAGES.map((stage) => {
            const stageVehicles = vehicles.filter((v) => v.currentStage === stage.key);
            return (
              <div key={stage.key} className="flex-1 min-w-[160px]">
                {/* Column header */}
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${stage.bg}`}>
                  <span className={`material-symbols-outlined text-lg ${stage.color}`}>{stage.icon}</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${stage.color}`}>{stage.label}</span>
                  <span className={`ml-auto text-xs font-bold ${stage.color}`}>{stageVehicles.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {stageVehicles.map((v) => (
                    <div key={v.id} className="bg-surface-container rounded-xl border border-outline-variant/10 p-3 hover:border-primary/30 transition-all cursor-pointer">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-on-surface">{v.make}</span>
                        <span className="text-[10px] text-on-surface-variant">{v.daysInStage}d</span>
                      </div>
                      <p className="text-sm font-headline font-bold mb-1">{v.model}</p>
                      <p className="text-xs text-on-surface-variant mb-2">{v.year} &middot; {v.mileage.toLocaleString()} km</p>
                      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/10">
                        <span className="text-xs text-on-surface-variant">€{(v.landedCostEur / 1000).toFixed(0)}K</span>
                        <span className="text-xs font-bold text-emerald-400">+€{(v.margin / 1000).toFixed(0)}K</span>
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
