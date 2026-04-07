"use client";

import { useState, useRef } from "react";

const MAKES = ["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "Jaguar", "Maserati", "BMW M", "Range Rover"];
const TRANSMISSIONS = [
  { value: "", label: "Auto-detect" },
  { value: "AUTOMATIC", label: "Automatic" },
  { value: "MANUAL", label: "Manual" },
  { value: "DCT", label: "DCT" },
  { value: "PDK", label: "PDK" },
  { value: "SMG", label: "SMG" },
];
const FUEL_TYPES = [
  { value: "", label: "Auto-detect" },
  { value: "PETROL", label: "Petrol" },
  { value: "DIESEL", label: "Diesel" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ELECTRIC", label: "Electric" },
];
const SERVICE_OPTIONS = [
  { value: "FULL_DEALER", label: "Full Dealer" },
  { value: "PARTIAL_DEALER", label: "Partial Dealer" },
  { value: "INDEPENDENT", label: "Independent" },
  { value: "UNKNOWN", label: "Unknown" },
];

export default function ValuationForm({ onSubmit, loading }) {
  const [form, setForm] = useState({
    make: "", model: "", year: 2021, mileageKm: 15000, driveSide: "LHD",
    askingPriceJpy: 15000000, exteriorColor: "", interiorColor: "",
    transmission: "", fuelType: "",
    serviceHistory: "UNKNOWN", accidentHistory: false, auctionGrade: "",
    specificationNotes: "",
  });
  const [photos, setPhotos] = useState([]);
  const [auctionSheet, setAuctionSheet] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef(null);

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const updateNum = (key, val) => setForm((f) => ({ ...f, [key]: val === "" ? "" : parseInt(val) || f[key] }));

  const handleAuctionSheetUpload = async (file) => {
    setAuctionSheet(file);
    if (!file) return;
    setParsing(true);
    setParseError("");
    try {
      const fd = new FormData();
      fd.append("auctionSheet", file);
      const res = await fetch("/api/agents/valuation/parse-sheet", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Failed to parse");
      const { fields } = await res.json();
      if (!fields) throw new Error("No data extracted");
      setForm((prev) => {
        const next = { ...prev };
        if (fields.make && MAKES.includes(fields.make)) next.make = fields.make;
        if (fields.model) next.model = fields.model;
        if (fields.year) next.year = fields.year;
        if (fields.mileageKm) next.mileageKm = fields.mileageKm;
        if (fields.driveSide) next.driveSide = fields.driveSide;
        if (fields.auctionGrade != null) next.auctionGrade = String(fields.auctionGrade);
        if (fields.transmission) next.transmission = fields.transmission;
        if (fields.fuelType) next.fuelType = fields.fuelType;
        if (fields.exteriorColor) next.exteriorColor = fields.exteriorColor;
        if (fields.interiorColor) next.interiorColor = fields.interiorColor;
        if (fields.accidentHistory != null) next.accidentHistory = fields.accidentHistory;
        if (fields.askingPriceJpy) next.askingPriceJpy = fields.askingPriceJpy;
        if (fields.specificationNotes) next.specificationNotes = fields.specificationNotes;
        return next;
      });
    } catch {
      setParseError("Could not auto-fill from auction sheet. Please fill fields manually.");
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      auctionGrade: form.auctionGrade ? parseFloat(form.auctionGrade) : null,
      photoCount: photos.length,
      hasAuctionSheet: !!auctionSheet,
      _photos: photos,
      _auctionSheet: auctionSheet,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Vehicle Identification */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">directions_car</span>
          Vehicle Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Make *</label>
            <select value={form.make} onChange={(e) => update("make", e.target.value)} required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all">
              <option value="">Select brand...</option>
              {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Model *</label>
            <input type="text" value={form.model} onChange={(e) => update("model", e.target.value)} placeholder="e.g. 488 GTB" required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Year *</label>
            <input type="number" value={form.year} onChange={(e) => updateNum("year", e.target.value)} min={1990} max={2026} required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Mileage (km) *</label>
            <input type="number" value={form.mileageKm} onChange={(e) => updateNum("mileageKm", e.target.value)} min={0} required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Drive Side *</label>
            <div className="flex gap-2">
              {["LHD", "RHD"].map((ds) => (
                <button key={ds} type="button" onClick={() => update("driveSide", ds)}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${form.driveSide === ds ? "bg-primary text-on-primary" : "bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface"}`}>
                  {ds}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Auction Grade</label>
            <input type="number" value={form.auctionGrade} onChange={(e) => update("auctionGrade", e.target.value)} min={1} max={6.5} step={0.5} placeholder="e.g. 4.5" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Transmission</label>
            <select value={form.transmission} onChange={(e) => update("transmission", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all">
              {TRANSMISSIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Fuel Type</label>
            <select value={form.fuelType} onChange={(e) => update("fuelType", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all">
              {FUEL_TYPES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Price & Color */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">currency_yen</span>
          Price & Specification
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Asking Price (JPY) *</label>
            <input type="number" value={form.askingPriceJpy} onChange={(e) => updateNum("askingPriceJpy", e.target.value)} min={0} step={100000} required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all" />
            <p className="text-xs text-on-surface-variant mt-1">≈ €{Math.round(form.askingPriceJpy / 166.80).toLocaleString()} at ¥166.80</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Exterior Color *</label>
            <input type="text" value={form.exteriorColor} onChange={(e) => update("exteriorColor", e.target.value)} placeholder="e.g. Rosso Corsa" required className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Interior Color</label>
            <input type="text" value={form.interiorColor} onChange={(e) => update("interiorColor", e.target.value)} placeholder="e.g. Nero Leather" className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Service History</label>
            <select value={form.serviceHistory} onChange={(e) => update("serviceHistory", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all">
              {SERVICE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Accident History</label>
            <button type="button" onClick={() => update("accidentHistory", !form.accidentHistory)}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${form.accidentHistory ? "bg-red-400/15 text-red-400 border border-red-400/30" : "bg-surface-container-high border border-outline-variant/20 text-on-surface-variant"}`}>
              {form.accidentHistory ? "Yes — Accident Reported" : "No Accident History"}
            </button>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Specification Notes</label>
            <input type="text" value={form.specificationNotes} onChange={(e) => update("specificationNotes", e.target.value)} placeholder="Carbon brakes, sport exhaust..." className="w-full px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all" />
          </div>
        </div>
      </div>

      {/* Photos & Documents */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">photo_camera</span>
          Photos & Documents
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Vehicle Photos (up to 30)</label>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []))} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full py-6 sm:py-8 rounded-xl border-2 border-dashed border-outline-variant/30 text-on-surface-variant hover:border-primary/50 hover:text-primary transition-all flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
              <span className="text-sm">{photos.length > 0 ? `${photos.length} photos selected` : "Click to upload photos"}</span>
            </button>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest text-on-surface-variant mb-2">Auction Sheet</label>
            <input type="file" accept="image/*,.pdf" onChange={(e) => handleAuctionSheetUpload(e.target.files?.[0] || null)} className="hidden" id="auction-sheet" />
            <label htmlFor="auction-sheet"
              className={`w-full py-6 sm:py-8 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 cursor-pointer ${parsing ? "border-secondary/50 text-secondary animate-pulse" : "border-outline-variant/30 text-on-surface-variant hover:border-secondary/50 hover:text-secondary"}`}>
              <span className="material-symbols-outlined text-3xl">{parsing ? "hourglass_top" : "description"}</span>
              <span className="text-sm">
                {parsing ? "Scanning auction sheet..." : auctionSheet ? auctionSheet.name : "Click to upload auction sheet"}
              </span>
              {parsing && <span className="text-xs text-on-surface-variant">Auto-filling form fields via AI</span>}
            </label>
            {parseError && <p className="text-xs text-red-400 mt-1">{parseError}</p>}
          </div>
        </div>
      </div>

      {/* Submit */}
      <button type="submit" disabled={loading || !form.make || !form.model || !form.exteriorColor}
        className="w-full py-4 bg-primary text-on-primary font-headline font-bold text-lg rounded-xl hover:shadow-[0_0_30px_rgba(248,113,113,0.5)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
        {loading ? "Processing Valuation..." : "Generate Valuation Report"}
      </button>
    </form>
  );
}
