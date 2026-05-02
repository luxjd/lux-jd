"use client";

import { useState } from "react";
import { formatEur, formatJpy, formatKm } from "@/lib/format";
import AdvanceStageButton from "./AdvanceStageButton";
import PhotoUploadButton from "./PhotoUploadButton";

const STAGES = [
  "SOURCED", "PURCHASED", "JP_TRANSPORT", "AT_PORT_JP", "IN_TRANSIT",
  "AT_PORT_DE", "CUSTOMS", "WORKSHOP", "TUV", "READY_FOR_SALE",
];

const STAGE_LABELS = {
  SOURCED: "Sourced", PURCHASED: "Purchased", JP_TRANSPORT: "JP Transport",
  AT_PORT_JP: "Port JP", IN_TRANSIT: "In Transit", AT_PORT_DE: "Port DE",
  CUSTOMS: "Customs", WORKSHOP: "Workshop", TUV: "TUV", READY_FOR_SALE: "Ready",
};

const STAGE_DOCS = {
  SOURCED: ["Auction confirmation", "Purchase receipt"],
  PURCHASED: ["Payment confirmation", "Auction invoice"],
  JP_TRANSPORT: ["Transport booking", "Pickup confirmation"],
  AT_PORT_JP: ["Export Permission Certificate (EPC)", "Radiation inspection cert", "Pre-loading inspection photos"],
  IN_TRANSIT: ["Bill of lading", "Marine insurance certificate", "Container packing list"],
  AT_PORT_DE: ["Arrival notice", "Port release order"],
  CUSTOMS: ["Customs declaration (Zollanmeldung)", "Duty payment receipt", "VAT payment receipt"],
  WORKSHOP: ["Work order", "Parts invoices", "Completion report"],
  TUV: ["Certificate of Conformity (CoC)", "TUV appointment confirmation", "TUV inspection report"],
  READY_FOR_SALE: ["Professional photos (full set)", "Vehicle detail report", "Listing-ready confirmation"],
};

const ESTIMATED_DAYS_PER_STAGE = {
  SOURCED: 3, PURCHASED: 5, JP_TRANSPORT: 5, AT_PORT_JP: 3,
  IN_TRANSIT: 35, AT_PORT_DE: 3, CUSTOMS: 5, WORKSHOP: 7, TUV: 5, READY_FOR_SALE: 0,
};

export default function VehicleCard({ vehicle, stageInfo, events }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(vehicle.notes || "");
  const [activeTab, setActiveTab] = useState("overview");

  const v = vehicle;
  const info = stageInfo?.find((s) => s.key === v.currentStage);
  const currentIdx = STAGES.indexOf(v.currentStage);
  const daysInStage = Math.round((Date.now() - new Date(v.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));
  const isDelayed = daysInStage > (ESTIMATED_DAYS_PER_STAGE[v.currentStage] || 7) * 1.5;
  const isStuck = daysInStage > (ESTIMATED_DAYS_PER_STAGE[v.currentStage] || 7) * 2.5;
  const docs = v.documents || {};

  const estimatedTimeline = [];
  let cumulativeDays = 0;
  const stageEntryDate = new Date(v.stageEnteredAt || v.createdAt);
  const vehicleCreated = new Date(v.createdAt);
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const isComplete = i < currentIdx;
    const isCurrent = i === currentIdx;
    const estDays = ESTIMATED_DAYS_PER_STAGE[stage] || 5;
    const eta = new Date(vehicleCreated.getTime() + cumulativeDays * 86400000);
    estimatedTimeline.push({ stage, label: STAGE_LABELS[stage], isComplete, isCurrent, eta, estDays });
    cumulativeDays += estDays;
  }

  const landed = v.landedCost || v.pricing?.landedCost || {};
  const costItems = [
    { label: "Purchase", est: landed.purchasePriceEur, actual: v.actualCosts?.purchase },
    { label: "Auction Fees", est: landed.auctionFeesEur, actual: v.actualCosts?.auctionFees },
    { label: "JP Transport", est: landed.jpTransportEur || 400, actual: v.actualCosts?.jpTransport },
    { label: "Export Docs", est: landed.exportDocsEur || 175, actual: v.actualCosts?.exportDocs },
    { label: "Freight", est: landed.freightEur || 2800, actual: v.actualCosts?.freight },
    { label: "Insurance", est: landed.insuranceEur, actual: v.actualCosts?.insurance },
    { label: "Customs Duty", est: landed.customsDutyEur, actual: v.actualCosts?.customsDuty },
    { label: "Import VAT", est: landed.importVatEur, actual: v.actualCosts?.importVat },
    { label: "Port Handling", est: landed.portHandlingEur || 600, actual: v.actualCosts?.portHandling },
    { label: "TUV", est: landed.tuvEstimatedEur, actual: v.actualCosts?.tuv },
    { label: "DE Transport", est: landed.deTransportEur || 450, actual: v.actualCosts?.deTransport },
    { label: "Detailing", est: landed.detailingEur || 1200, actual: v.actualCosts?.detailing },
    { label: "Photography", est: landed.photographyEur || 500, actual: v.actualCosts?.photography },
  ];

  const vehicleEvents = (events || []).filter((e) => e.vehicleId === v.id).slice(-10).reverse();

  const tabs = [
    { id: "overview", label: "Overview", icon: "info" },
    { id: "documents", label: "Documents", icon: "description" },
    { id: "costs", label: "Costs", icon: "payments" },
    { id: "timeline", label: "Timeline", icon: "schedule" },
    { id: "history", label: "History", icon: "history" },
  ];

  return (
    <div className={`bg-surface-container rounded-2xl border transition-all ${isStuck ? "border-red-400/40" : isDelayed ? "border-amber-400/30" : "border-outline-variant/10"}`}>
      {/* Card Header — always visible */}
      <div className="p-4 sm:p-5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${info?.bg || "bg-slate-400/10"} flex items-center justify-center shrink-0`}>
              <span className={`material-symbols-outlined text-lg ${info?.color || "text-slate-400"}`}>{info?.icon || "help"}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-headline font-bold">{v.make} {v.model} {v.year}</h4>
                {isStuck && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-400/15 text-red-400">STUCK {daysInStage}d</span>}
                {isDelayed && !isStuck && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400/15 text-amber-400">DELAYED {daysInStage}d</span>}
              </div>
              <p className="text-xs text-on-surface-variant">
                {v.exteriorColor && `${v.exteriorColor} · `}{v.driveSide} · Stage: <span className={info?.color}>{STAGE_LABELS[v.currentStage]}</span> · Day {daysInStage}
                {v.mileageKm && ` · ${formatKm(v.mileageKm)} km`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {(v.pricing?.margin?.grossMarginEur || v.margin?.grossMarginEur) ? (
              <span className="text-sm font-mono font-bold text-emerald-400 mr-2">
                {formatEur(v.pricing.margin?.grossMarginEur || v.margin.grossMarginEur)} margin
              </span>
            ) : null}
            <PhotoUploadButton vehicleId={v.id} stage={v.currentStage} vehicleName={`${v.make} ${v.model}`} />
            <AdvanceStageButton vehicleId={v.id} currentStage={v.currentStage} vehicleName={`${v.make} ${v.model}`} />
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container-high transition-colors">
              <span className={`material-symbols-outlined text-sm transition-transform ${expanded ? "rotate-180" : ""}`}>expand_more</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-0.5 mt-3">
          {STAGES.map((stage, i) => (
            <div key={stage} className={`flex-1 h-1.5 rounded-full ${i < currentIdx ? "bg-emerald-400" : i === currentIdx ? (isStuck ? "bg-red-400" : isDelayed ? "bg-amber-400" : "bg-primary") + " animate-pulse" : "bg-surface-container-high"}`} title={STAGE_LABELS[stage]} />
          ))}
        </div>

        {/* Shipment + TUV quick info */}
        {v.shipment && (
          <div className="mt-2 text-xs text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-cyan-400">sailing</span>
            {v.shipment.vesselName} · Container: {v.shipment.containerId} · ETA: {v.shipment.dates?.estimatedArrival ? new Date(v.shipment.dates.estimatedArrival).toLocaleDateString() : "—"}
          </div>
        )}
      </div>

      {/* Expanded Detail Panel */}
      {expanded && (
        <div className="border-t border-outline-variant/10">
          {/* Tabs */}
          <div className="flex border-b border-outline-variant/10 px-4">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-colors border-b-2 ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-3">
                  <h5 className="text-xs uppercase text-on-surface-variant tracking-wider font-bold">Vehicle</h5>
                  <div className="space-y-1.5 text-sm">
                    {[
                      ["Make", v.make],
                      ["Model", v.model],
                      ["Year", v.year],
                      ["Drive Side", v.driveSide],
                      ["Color", v.exteriorColor],
                      ["Mileage", v.mileageKm ? `${formatKm(v.mileageKm)} km` : "—"],
                      ["Auction Grade", v.auctionGrade || "—"],
                      ["VIN", v.vin || "—"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-on-surface-variant">{label}</span>
                        <span className="font-mono">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs uppercase text-on-surface-variant tracking-wider font-bold">Pricing</h5>
                  <div className="space-y-1.5 text-sm">
                    {[
                      ["JP Price", v.pricing?.askingPriceJpy ? formatJpy(v.pricing.askingPriceJpy) : "—"],
                      ["Purchase EUR", landed.purchasePriceEur ? formatEur(landed.purchasePriceEur) : "—"],
                      ["Total Landed", landed.totalLandedCostEur ? formatEur(landed.totalLandedCostEur) : "—"],
                      ["DE Market Value", v.pricing?.deMarketMedian ? formatEur(v.pricing.deMarketMedian) : "—"],
                      ["Gross Margin", v.pricing?.margin?.grossMarginEur || v.margin?.grossMarginEur ? formatEur(v.pricing?.margin?.grossMarginEur || v.margin?.grossMarginEur) : "—"],
                      ["Margin %", v.pricing?.margin?.grossMarginPct || v.margin?.grossMarginPct ? `${v.pricing?.margin?.grossMarginPct || v.margin?.grossMarginPct}%` : "—"],
                      ["Max Bid", v.maxBidJpy ? formatJpy(v.maxBidJpy) : "—"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-on-surface-variant">{label}</span>
                        <span className={`font-mono ${label.includes("Margin") && !label.includes("%") ? "text-emerald-400 font-bold" : ""}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs uppercase text-on-surface-variant tracking-wider font-bold">Shipment</h5>
                  <div className="space-y-1.5 text-sm">
                    {[
                      ["Vessel", v.shipment?.vesselName || "—"],
                      ["Container", v.shipment?.containerId || "—"],
                      ["Route", v.shipment?.route?.routeKey || "—"],
                      ["Departure", v.shipment?.dates?.departureDate ? new Date(v.shipment.dates.departureDate).toLocaleDateString() : "—"],
                      ["ETA Port DE", v.shipment?.dates?.estimatedArrival ? new Date(v.shipment.dates.estimatedArrival).toLocaleDateString() : "—"],
                      ["Insurance", v.shipment?.insurance?.provider || "—"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-on-surface-variant">{label}</span>
                        <span className="font-mono">{val}</span>
                      </div>
                    ))}
                  </div>
                  {v.tuvAssessment && (
                    <>
                      <h5 className="text-xs uppercase text-on-surface-variant tracking-wider font-bold pt-2">TUV</h5>
                      <div className="space-y-1.5 text-sm">
                        {[
                          ["Station", v.tuvAssessment.recommended_station || "—"],
                          ["Complexity", v.tuvAssessment.complexity || "—"],
                          ["Pass Prob.", v.tuvAssessment.pass_probability_pct ? `${v.tuvAssessment.pass_probability_pct}%` : "—"],
                        ].map(([label, val]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-on-surface-variant">{label}</span>
                            <span className="font-mono">{val}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <div className="space-y-4">
                {STAGES.slice(0, currentIdx + 1).map((stage) => {
                  const stageDocs = STAGE_DOCS[stage] || [];
                  if (stageDocs.length === 0) return null;
                  const isCurrentStage = stage === v.currentStage;
                  return (
                    <div key={stage}>
                      <h5 className={`text-xs uppercase tracking-wider font-bold mb-2 ${isCurrentStage ? "text-primary" : "text-on-surface-variant"}`}>
                        {STAGE_LABELS[stage]} {isCurrentStage && "(Current)"}
                      </h5>
                      <div className="space-y-1">
                        {stageDocs.map((doc) => {
                          const isChecked = docs[stage]?.includes(doc);
                          return (
                            <label key={doc} className="flex items-center gap-2 text-sm py-1 px-2 rounded-lg hover:bg-surface-container-high/30 cursor-pointer">
                              <input type="checkbox" checked={isChecked || false} readOnly
                                className="w-4 h-4 rounded border-outline-variant/30 text-primary" />
                              <span className={isChecked ? "text-on-surface" : "text-on-surface-variant"}>{doc}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* COSTS TAB */}
            {activeTab === "costs" && (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                        <th className="text-left py-2">Line Item</th>
                        <th className="text-right py-2">Estimated</th>
                        <th className="text-right py-2">Actual</th>
                        <th className="text-right py-2">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costItems.map((item) => {
                        const variance = item.actual != null && item.est != null ? item.actual - item.est : null;
                        return (
                          <tr key={item.label} className="border-b border-outline-variant/5">
                            <td className="py-1.5 text-on-surface-variant">{item.label}</td>
                            <td className="py-1.5 text-right font-mono">{item.est != null ? formatEur(item.est) : "—"}</td>
                            <td className="py-1.5 text-right font-mono">{item.actual != null ? formatEur(item.actual) : <span className="text-on-surface-variant/50">pending</span>}</td>
                            <td className={`py-1.5 text-right font-mono font-bold ${variance > 0 ? "text-red-400" : variance < 0 ? "text-emerald-400" : ""}`}>
                              {variance != null ? `${variance > 0 ? "+" : ""}${formatEur(variance)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-outline-variant/20 font-bold">
                        <td className="py-2">TOTAL LANDED</td>
                        <td className="py-2 text-right font-mono">{landed.totalLandedCostEur ? formatEur(landed.totalLandedCostEur) : "—"}</td>
                        <td className="py-2 text-right font-mono">{v.actualCosts?.total ? formatEur(v.actualCosts.total) : <span className="text-on-surface-variant/50">partial</span>}</td>
                        <td className="py-2 text-right font-mono">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === "timeline" && (
              <div className="space-y-1">
                {estimatedTimeline.map((t, i) => (
                  <div key={t.stage} className={`flex items-center gap-3 p-2 rounded-lg ${t.isCurrent ? "bg-primary/10" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${t.isComplete ? "bg-emerald-400/15" : t.isCurrent ? "bg-primary/15" : "bg-surface-container-high"}`}>
                      {t.isComplete ? (
                        <span className="material-symbols-outlined text-sm text-emerald-400">check</span>
                      ) : t.isCurrent ? (
                        <span className="material-symbols-outlined text-sm text-primary animate-pulse">radio_button_checked</span>
                      ) : (
                        <span className="text-xs text-on-surface-variant font-mono">{i + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${t.isCurrent ? "text-primary" : t.isComplete ? "" : "text-on-surface-variant"}`}>{t.label}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        {t.isComplete ? "Completed" : t.isCurrent ? `Day ${daysInStage} (est. ${t.estDays} days)` : `ETA: ${t.eta.toLocaleDateString()}`}
                      </p>
                    </div>
                    <span className="text-xs text-on-surface-variant font-mono">~{t.estDays}d</span>
                  </div>
                ))}
                <div className="mt-3 p-3 rounded-xl bg-surface-container-high/30 text-center">
                  <p className="text-xs text-on-surface-variant">Total estimated pipeline: <span className="font-bold text-on-surface">~{Object.values(ESTIMATED_DAYS_PER_STAGE).reduce((a, b) => a + b, 0)} days</span> ({Math.round(Object.values(ESTIMATED_DAYS_PER_STAGE).reduce((a, b) => a + b, 0) / 7)} weeks)</p>
                </div>
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === "history" && (
              <div className="space-y-2">
                {vehicleEvents.length > 0 ? vehicleEvents.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-container-high/30">
                    <span className="material-symbols-outlined text-primary text-sm mt-0.5 shrink-0">
                      {evt.type === "STAGE_TRANSITION" ? "arrow_forward" : evt.type === "PHOTO_UPLOADED" ? "photo_camera" : "add_circle"}
                    </span>
                    <div>
                      <p className="text-sm">{evt.message}</p>
                      <p className="text-[10px] text-on-surface-variant">{new Date(evt.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-on-surface-variant text-center py-4">No events recorded yet</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this vehicle..."
                className="w-full bg-surface-container-high/30 border border-outline-variant/10 rounded-xl px-3 py-2 text-sm resize-none h-16 focus:border-primary/30 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
