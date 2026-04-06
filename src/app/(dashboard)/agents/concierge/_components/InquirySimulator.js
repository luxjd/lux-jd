"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_VEHICLES = [
  { id: "v001", make: "Ferrari", model: "488 GTB", year: 2017, exteriorColor: "Rosso Corsa", interiorColor: "Nero", driveSide: "LHD", mileageKm: 18000, engineSpec: "3.9L Twin-Turbo V8, 670 PS", serviceHistory: "FULL_DEALER", listingPrice: 238000, specNotes: "Daytona seats, carbon fibre package" },
  { id: "v002", make: "Porsche", model: "911 GT3", year: 2021, exteriorColor: "GT Silver", interiorColor: "Black", driveSide: "LHD", mileageKm: 12000, engineSpec: "4.0L Flat-6, 510 PS", serviceHistory: "FULL_DEALER", listingPrice: 218000, specNotes: "PCCB, Sport Chrono, full bucket seats" },
  { id: "v003", make: "Mercedes-AMG", model: "GT R", year: 2019, exteriorColor: "Selenite Grey", interiorColor: "Black", driveSide: "LHD", mileageKm: 25000, engineSpec: "4.0L Twin-Turbo V8, 585 PS", serviceHistory: "FULL_DEALER", listingPrice: 168000, specNotes: "AMG Aerodynamics Package, carbon pack" },
];

export default function InquirySimulator() {
  const [vehicleId, setVehicleId] = useState(SAMPLE_VEHICLES[0].id);
  const [customerName, setCustomerName] = useState("Max Müller");
  const [customerEmail, setCustomerEmail] = useState("max@example.de");
  const [source, setSource] = useState("mobile.de");
  const [inquiry, setInquiry] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const router = useRouter();

  const vehicle = SAMPLE_VEHICLES.find((v) => v.id === vehicleId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inquiry.trim()) return;
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

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6 space-y-4">
        <h3 className="font-headline font-bold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">chat</span> Inquiry Simulator
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Vehicle</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50">
              {SAMPLE_VEHICLES.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} {v.year} — €{v.listingPrice.toLocaleString()}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50">
              {["mobile.de", "AutoScout24", "ClassicDriver", "email", "phone", "Instagram"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Customer Name</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm focus:outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Offer Price (optional)</label>
            <input type="number" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="e.g. 225000" className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Customer Inquiry</label>
          <textarea value={inquiry} onChange={(e) => setInquiry(e.target.value)} rows={3} placeholder="e.g. Guten Tag, ich interessiere mich für den Ferrari 488. Ist das Fahrzeug noch verfügbar? Können Sie mir mehr über die Ausstattung und die Servicehistorie sagen?" className="w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 resize-none" />
        </div>

        <button type="submit" disabled={processing || !inquiry.trim()} className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-sm hover:shadow-[0_0_20px_rgba(173,198,255,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          <span className={`material-symbols-outlined text-lg ${processing ? "animate-spin" : ""}`}>{processing ? "progress_activity" : "send"}</span>
          {processing ? "Generating Expert Response..." : "Send Inquiry"}
        </button>
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
