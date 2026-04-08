"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InquirySimulator() {
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [source, setSource] = useState("mobile.de");
  const [inquiry, setInquiry] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const router = useRouter();

  // Load real vehicles from pipeline + listings
  useEffect(() => {
    async function loadVehicles() {
      try {
        const [pipelineRes, listingsRes] = await Promise.all([
          fetch("/api/agents/logistics/vehicles").then((r) => r.json()).catch(() => ({ vehicles: [] })),
          fetch("/api/agents/listing/listings").then((r) => r.json()).catch(() => ({ listings: [] })),
        ]);

        const realVehicles = [];

        // Add pipeline vehicles
        const pipelineVehicles = pipelineRes.vehicles || [];

        for (const v of pipelineVehicles) {
          realVehicles.push({
            id: v.id,
            make: v.make,
            model: v.model,
            year: v.year,
            exteriorColor: v.exteriorColor || v.color,
            interiorColor: v.interiorColor || null,
            driveSide: v.driveSide || "LHD",
            mileageKm: v.mileageKm || v.mileage || 0,
            engineSpec: v.specification?.engineSpec || v.engineSpec || null,
            serviceHistory: v.serviceHistory || "UNKNOWN",
            listingPrice: v.listingPriceEur || v.estimatedSalePrice || v.margin?.estimatedSalePrice || 0,
            specNotes: v.specification?.specNotes || v.specNotes || null,
            source: "pipeline",
          });
        }

        // Add listed vehicles
        for (const l of (listingsRes.listings || [])) {
          if (realVehicles.some((v) => v.id === l.vehicleId)) continue;
          realVehicles.push({
            id: l.vehicleId || l.id,
            make: l.make,
            model: l.model,
            year: l.year,
            exteriorColor: l.exteriorColor,
            interiorColor: l.interiorColor,
            driveSide: l.driveSide || "LHD",
            mileageKm: l.mileageKm || 0,
            engineSpec: l.engineSpec || null,
            serviceHistory: l.serviceHistory || "UNKNOWN",
            listingPrice: l.currentPrice || l.initialPrice || 0,
            specNotes: l.specNotes || null,
            source: "listing",
          });
        }

        setVehicles(realVehicles);
        if (realVehicles.length > 0) setVehicleId(realVehicles[0].id);
      } catch {
        setVehicles([]);
      } finally {
        setLoadingVehicles(false);
      }
    }
    loadVehicles();
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inquiry.trim() || !vehicle) return;
    setProcessing(true);
    setResult(null);

    try {
      const res = await fetch("/api/agents/concierge/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry,
          customerName,
          customerEmail,
          vehicle,
          source,
          offerPrice: offerPrice ? parseInt(offerPrice) : null,
        }),
      });
      const data = await res.json();
      setResult(data);
      router.refresh();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const RISK_STYLES = { PRIORITY: "text-emerald-400", STANDARD: "text-primary", LOW: "text-slate-400" };

  if (loadingVehicles) {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-6 text-center">
        <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
        <p className="text-sm text-on-surface-variant mt-2">Loading vehicles...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6 space-y-4">
        <h3 className="font-headline font-bold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">chat</span> Customer Inquiry
        </h3>

        {vehicles.length === 0 ? (
          <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm">
            No vehicles in pipeline or listings. Send a vehicle to pipeline from the Valuation Agent first.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Vehicle</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50">
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} {v.year} — {v.listingPrice ? `€${v.listingPrice.toLocaleString()}` : "No price"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Source</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50">
                  {["mobile.de", "AutoScout24", "ClassicDriver", "Website", "email", "phone", "Instagram"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Customer Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Max Müller" className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Offer Price (optional)</label>
                <input type="number" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="e.g. 85000" className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            {vehicle && (
              <div className="p-3 rounded-xl bg-surface-container-high/30 text-xs text-on-surface-variant">
                {vehicle.make} {vehicle.model} {vehicle.year} · {vehicle.exteriorColor} · {vehicle.driveSide} · {(vehicle.mileageKm || 0).toLocaleString()} km
                {vehicle.engineSpec && ` · ${vehicle.engineSpec}`}
                {vehicle.specNotes && ` · ${vehicle.specNotes}`}
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Customer Inquiry</label>
              <textarea value={inquiry} onChange={(e) => setInquiry(e.target.value)} rows={3} placeholder="e.g. Guten Tag, ich interessiere mich für den Mercedes-AMG GT. Ist das Fahrzeug noch verfügbar? Können Sie mir mehr über die Servicehistorie sagen?" className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 resize-none" />
            </div>

            <button type="submit" disabled={processing || !inquiry.trim() || !vehicle} className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-sm hover:shadow-[0_0_20px_rgba(248,113,113,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              <span className={`material-symbols-outlined text-lg ${processing ? "animate-spin" : ""}`}>{processing ? "progress_activity" : "send"}</span>
              {processing ? "Generating Expert Response..." : "Send Inquiry"}
            </button>
          </>
        )}
      </form>

      {/* Result */}
      {result && !result.error && (
        <div className="space-y-4">
          {/* Classification */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase">{result.classification?.buyerType}</span>
              <span className={`text-sm font-bold ${RISK_STYLES[result.classification?.routing]}`}>Score: {result.classification?.score}/100 ({result.classification?.routing})</span>
              {result.escalation?.shouldEscalate && (
                <span className="px-2 py-0.5 rounded-full bg-red-400/15 text-red-400 text-[10px] font-bold uppercase">ESCALATED</span>
              )}
              {result.negotiation && (
                <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold uppercase">{result.negotiation.action}</span>
              )}
              <span className="text-xs text-on-surface-variant ml-auto">{result.duration}ms</span>
            </div>
            <p className="text-xs text-on-surface-variant">{result.classification?.reasoning}</p>
          </div>

          {/* AI Response */}
          <div className="bg-surface-container rounded-2xl border border-primary/20 p-4 sm:p-5">
            <h4 className="text-xs uppercase tracking-widest text-primary mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Response ({result.response?.language || "DE"})
            </h4>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{result.response?.response_text}</div>
            {result.response?.suggested_next_action && (
              <div className="mt-3 pt-3 border-t border-outline-variant/10 flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">Suggested action:</span>
                <span className="px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[10px] font-bold">{result.response.suggested_next_action}</span>
              </div>
            )}
          </div>

          {/* Negotiation Details */}
          {result.negotiation && (
            <div className="bg-surface-container rounded-2xl border border-secondary/20 p-4 sm:p-5">
              <h4 className="text-xs uppercase tracking-widest text-secondary mb-2">Negotiation Analysis</h4>
              <p className="text-sm">{result.negotiation.reasoning}</p>
              {result.negotiation.counterOffer && (
                <p className="text-sm font-bold text-secondary mt-1">Counter offer: €{result.negotiation.counterOffer.toLocaleString()}</p>
              )}
            </div>
          )}
        </div>
      )}

      {result?.error && (
        <div className="p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm">{result.error}</div>
      )}
    </div>
  );
}
