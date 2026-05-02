import Link from "next/link";
import { getPipelineVehicles, getPipelineEvents, getAgentStatus, getShipments, getTuvAppointments } from "@/lib/agents/logistics/storage";
import { STAGE_KEYS as STAGES, STAGES as PIPELINE_STAGES } from "@/lib/agents/logistics/pipeline";
import AutoAdvanceButton from "./_components/AutoAdvanceButton";
import VehicleFilters from "./_components/VehicleFilters";

export default async function LogisticsAgentPage() {
  const status = await getAgentStatus();
  const data = await getPipelineVehicles();
  const events = await getPipelineEvents();
  const shipments = await getShipments();
  const tuvAppts = await getTuvAppointments();
  const vehicles = data.vehicles || [];
  const hasData = vehicles.length > 0;

  const stageInfo = PIPELINE_STAGES; // For icons/colors

  return (
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-sm">arrow_back</span> All Agents
      </Link>

      {/* Header */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-cyan-400 text-2xl">local_shipping</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-headline text-xl font-bold">Logistics Agent</h2>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] text-on-surface-variant font-mono">logistics</span>
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${status.status === "ONLINE" ? "bg-emerald-400/15 text-emerald-400" : "bg-slate-400/10 text-slate-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-400"}`} />
                {status.status || "IDLE"}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              10-stage pipeline · shipping · customs · TUV · {vehicles.length} vehicles tracked
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-4">
          <AutoAdvanceButton />
        </div>

        {/* Stage summary */}
        {hasData && (
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 sm:gap-2">
            {STAGES.map((stage) => {
              const info = stageInfo.find((s) => s.key === stage);
              const count = vehicles.filter((v) => v.currentStage === stage).length;
              return (
                <div key={stage} className="text-center">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full ${info?.bg || "bg-slate-400/10"} flex items-center justify-center mx-auto mb-1`}>
                    <span className={`material-symbols-outlined text-sm sm:text-lg ${info?.color || "text-slate-400"}`}>{info?.icon || "help"}</span>
                  </div>
                  <p className="font-headline text-sm sm:text-lg font-bold">{count}</p>
                  <p className="text-[7px] sm:text-[9px] text-on-surface-variant uppercase leading-tight">{info?.label || stage}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vehicles in pipeline */}
      {hasData ? (
        <VehicleFilters vehicles={vehicles} stageInfo={stageInfo} events={events.events || []} />
      ) : (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3 block">local_shipping</span>
          <h3 className="font-headline font-bold text-lg mb-2">No Vehicles in Pipeline</h3>
          <p className="text-sm text-on-surface-variant">Vehicles enter the pipeline when the Orchestrator approves a purchase from JP Sourcing Agent opportunities.</p>
        </div>
      )}

      {/* Recent Events */}
      {events.events?.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-4">Recent Events</h3>
          <div className="space-y-2">
            {events.events.slice(-10).reverse().map((evt) => (
              <div key={evt.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-container-high/30 transition-colors">
                <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0">
                  {evt.type === "STAGE_TRANSITION" ? "arrow_forward" : "add_circle"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm">{evt.message}</p>
                  <p className="text-[10px] text-on-surface-variant">{new Date(evt.timestamp).toLocaleString()} · {evt.agent}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shipments + TUV Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {shipments.shipments?.length > 0 && (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
            <h3 className="font-headline font-bold text-lg mb-4">Active Shipments ({shipments.shipments.length})</h3>
            {shipments.shipments.map((s) => (
              <div key={s.shipmentId} className="p-3 rounded-xl bg-surface-container-high/30 mb-2">
                <p className="text-sm font-bold">{s.vesselName}</p>
                <p className="text-xs text-on-surface-variant">{s.route?.routeKey} · {s.containerType} · {s.insurance.provider}</p>
                <p className="text-xs text-on-surface-variant">Departure: {new Date(s.dates.departureDate).toLocaleDateString()} · ETA: {new Date(s.dates.estimatedArrival).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {tuvAppts.appointments?.length > 0 && (
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
            <h3 className="font-headline font-bold text-lg mb-4">TUV Appointments ({tuvAppts.appointments.length})</h3>
            {tuvAppts.appointments.map((a) => (
              <div key={a.appointmentId} className="p-3 rounded-xl bg-surface-container-high/30 mb-2">
                <p className="text-sm font-bold">{a.station?.name}</p>
                <p className="text-xs text-on-surface-variant">{a.station?.city} · {new Date(a.appointmentDate).toLocaleDateString()} · {a.status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
