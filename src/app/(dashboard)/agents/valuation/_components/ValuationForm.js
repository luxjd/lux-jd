"use client";

import { useState, useRef, useCallback } from "react";
import { formatJpy, formatKm } from "@/lib/format";

const MAKES = [
  "Ferrari", "Porsche", "Lamborghini", "Mercedes-Benz", "Mercedes-AMG",
  "BMW", "BMW M", "Bentley", "Aston Martin", "Jaguar", "Maserati",
  "Range Rover", "Land Rover", "Rolls-Royce", "McLaren", "Lotus",
  "Alfa Romeo", "Bugatti",
];

const HIDDEN_FIELDS = {
  fieldConfidence: true,
  field_confidence: true,
  confidence: true,
  yearEra: true,
  mileageUnit: true,
  mileage_unit: true,
};

const FIELD_LABELS = {
  // Identity
  make: "Make",
  model: "Model",
  grade: "Grade / Edition",
  modelCode: "Model Code (型式)",
  year: "Year",
  lotNumber: "Lot Number",
  auctionHouse: "Auction House",
  // Specs
  mileageKm: "Mileage (km)",
  driveSide: "Drive Side",
  drivetrain: "Drivetrain",
  bodyType: "Body Type",
  doorCount: "Doors",
  seatingCapacity: "Seats",
  transmission: "Transmission",
  fuelType: "Fuel Type",
  // Pricing
  askingPriceJpy: "Asking Price (JPY)",
  recyclingDepositJpy: "Recycling Deposit (JPY)",
  // Color
  exteriorColor: "Exterior Color",
  exteriorColorJapanese: "Exterior Color (Japanese)",
  exteriorColorCatalog: "Catalog Name",
  colorCode: "Color Code",
  colorChanged: "Repainted / Color Changed",
  interiorColor: "Interior Color",
  interiorGrade: "Interior Grade",
  interiorAuxGrade: "Interior Aux Grade",
  // Condition
  auctionGrade: "Auction Grade",
  accidentHistory: "Accident History",
  importType: "Import Type",
  // Registration
  vin: "Chassis / VIN",
  registrationPlate: "Registration Plate",
  shakenExpiry: "Shaken Expiry",
  dimensions: "Dimensions (L×W×H mm)",
  // Notes
  featureCodes: "Factory Equipment",
  salesPoints: "Sales Points",
  modifications: "Modifications / Aftermarket",
  cautionNotes: "Caution Notes",
  inspectorNotes: "Inspector Notes",
  specificationNotes: "Other Specifications",
  // Auction pricing
  auctionDate: "Auction Date",
  startPriceMan: "Start Price (万円)",
  bidPriceMan: "Highest Bid (万円)",
  soldPriceMan: "Sold Price (万円)",
  auctionResult: "Auction Result",
  // Service records
  serviceRecordEntries: "Service Record History",
  serviceRecordCount: "Service Record Books",
  serviceRecordDealer: "Service Dealer",
};

function formatValue(key, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;

  if (key === "accidentHistory") return value ? "Yes" : "No";
  if (key === "colorChanged") return value ? "Yes (repaint indicated)" : "No";
  if (key === "askingPriceJpy" || key === "recyclingDepositJpy") return formatJpy(value);
  if (key === "mileageKm") return `${formatKm(value)}`;
  if (key === "auctionGrade") return String(value);
  if (key === "startPriceMan" || key === "bidPriceMan" || key === "soldPriceMan") return `¥${(value * 10000).toLocaleString()}`;
  if (key === "auctionResult") return value === "sold" ? "Sold (落札)" : value === "unsold" ? "Unsold (流れ)" : value === "negotiating" ? "Negotiating (商談)" : value;
  if (key === "serviceRecordCount") return `${value} books`;
  if (key === "serviceRecordEntries" && Array.isArray(value)) return value.map((e) => `${e.date}: ${e.mileageKm ? formatKm(e.mileageKm) + " km" : "—"}`).join(", ");
  if (key === "doorCount") return `${value}-door`;
  if (key === "seatingCapacity") return `${value} seats`;

  if (key === "dimensions" && value && typeof value === "object") {
    const { length_mm, width_mm, height_mm } = value;
    const parts = [length_mm, width_mm, height_mm].map((n) => (n == null ? "?" : n));
    if (parts.every((p) => p === "?")) return null;
    return `${parts[0]} × ${parts[1]} × ${parts[2]} mm`;
  }

  // Array fields — render as comma-separated list, capped so the card stays readable
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.join(", ");
  }

  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ValuationForm({ onSubmit, loading }) {
  // Phase: upload | extracting | review
  const [phase, setPhase] = useState("upload");
  const [files, setFiles] = useState([]);
  const [extractedData, setExtractedData] = useState({});
  const [summary, setSummary] = useState("");
  const [missingRequired, setMissingRequired] = useState([]);
  const [missingOptional, setMissingOptional] = useState([]);
  // New: sheet-derivable vs external split. After the focused-retry pass,
  // `missingSheetFields` = agent tried and failed → ask user to verify.
  // `missingExternal` = never on the sheet to begin with → ask user.
  const [missingSheetFields, setMissingSheetFields] = useState([]);
  const [missingExternal, setMissingExternal] = useState([]);
  const [retryAudit, setRetryAudit] = useState(null);
  const [answers, setAnswers] = useState({});
  const [extractError, setExtractError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const fileRef = useRef(null);

  // ── File handling ──

  const addFiles = useCallback((newFiles) => {
    const allowed = Array.from(newFiles).filter(f =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );
    setFiles(prev => [...prev, ...allowed].slice(0, 30));
  }, []);

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  // ── AI Extraction ──

  const handleExtract = async () => {
    if (files.length === 0) return;
    setPhase("extracting");
    setExtractError("");

    try {
      const fd = new FormData();
      for (const file of files) {
        fd.append("files", file);
      }

      const res = await fetch("/api/agents/valuation/extract-data", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Extraction failed");
      }

      setExtractedData(data.extracted || {});
      setSummary(data.summary || "");
      setMissingRequired(data.missingRequired || []);
      setMissingOptional(data.missingOptional || []);
      setMissingSheetFields(data.missingSheetFields || []);
      setMissingExternal(data.missingExternal || []);
      setRetryAudit(data._retryAudit || null);
      setAnswers({});
      setPhase("review");
    } catch (err) {
      setExtractError(err.message || "Failed to extract data from files");
      setPhase("upload");
    }
  };

  // ── Answer handling ──

  const updateAnswer = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const markNotAvailable = (key) => {
    setAnswers(prev => ({ ...prev, [key]: "__NOT_AVAILABLE__" }));
  };

  // ── Check if ready to submit ──

  const isReady = () => {
    for (const field of missingRequired) {
      const answer = answers[field.key];
      // askingPriceJpy is the only required field the agent can infer on its own.
      if (field.key === "askingPriceJpy" && answer === "__NOT_AVAILABLE__") continue;
      if (!answer || answer === "__NOT_AVAILABLE__") return false;
    }
    return true;
  };

  // ── Submit ──

  const handleSubmit = () => {
    // Merge extracted data with answers
    const merged = { ...extractedData };

    for (const [key, value] of Object.entries(answers)) {
      if (value === "__NOT_AVAILABLE__") continue;
      // Parse numeric values
      if (key === "year" || key === "mileageKm" || key === "askingPriceJpy") {
        merged[key] = parseInt(value) || merged[key];
      } else if (key === "auctionGrade") {
        merged[key] = parseFloat(value) || null;
      } else if (key === "accidentHistory") {
        merged[key] = value === "yes" || value === "true" || value === "Yes";
      } else {
        merged[key] = value;
      }
    }

    // Set defaults for optional missing fields
    if (!merged.serviceHistory) merged.serviceHistory = "UNKNOWN";
    if (merged.accidentHistory === null || merged.accidentHistory === undefined) merged.accidentHistory = false;

    onSubmit({
      make: merged.make,
      model: merged.model,
      year: merged.year,
      mileageKm: merged.mileageKm,
      driveSide: merged.driveSide || "RHD",
      askingPriceJpy: merged.askingPriceJpy ?? null,
      exteriorColor: merged.exteriorColor || "Unknown",
      interiorColor: merged.interiorColor || "",
      serviceHistory: merged.serviceHistory,
      accidentHistory: !!merged.accidentHistory,
      auctionGrade: merged.auctionGrade || null,
      specificationNotes: merged.specificationNotes || "",
      transmission: merged.transmission || "",
      fuelType: merged.fuelType || "",
      _photos: files.filter(f => f.type.startsWith("image/")),
      _auctionSheet: files.find(f => f.type === "application/pdf") || files[0] || null,
    });
  };

  // ── Back to upload ──

  const handleBack = () => {
    setPhase("upload");
    setExtractedData({});
    setSummary("");
    setMissingRequired([]);
    setMissingOptional([]);
    setAnswers({});
  };

  // ══════════════════════════════════════
  // PHASE 1: UPLOAD
  // ══════════════════════════════════════

  if (phase === "upload") {
    return (
      <div className="space-y-6">
        {/* Upload Zone */}
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">upload_file</span>
            Upload Vehicle Data
          </h3>
          <p className="text-sm text-on-surface-variant mb-4">
            Upload auction sheets, vehicle photos, or PDFs. Our AI will extract all vehicle details automatically.
          </p>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center py-12 sm:py-16 gap-3 ${
              dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-high/50"
            }`}
          >
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/60">
              {dragOver ? "file_download" : "cloud_upload"}
            </span>
            <div className="text-center">
              <p className="text-on-surface font-medium">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Auction sheets, vehicle photos, PDFs — up to 30 files
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </p>
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/15 text-sm group"
                  >
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">
                      {file.type === "application/pdf" ? "picture_as_pdf" : "image"}
                    </span>
                    <span className="text-on-surface truncate max-w-[160px]">{file.name}</span>
                    <span className="text-xs text-on-surface-variant">
                      {(file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="text-on-surface-variant hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {extractError && (
            <div className="mt-4 p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {extractError}
            </div>
          )}
        </div>

        {/* Analyze button */}
        <button
          type="button"
          onClick={handleExtract}
          disabled={files.length === 0}
          className="w-full py-4 bg-primary text-on-primary font-headline font-bold text-lg rounded-xl hover:shadow-[0_0_30px_rgba(248,113,113,0.5)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          <span className="material-symbols-outlined text-2xl">auto_awesome</span>
          Analyze & Extract Data
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════
  // PHASE 2: EXTRACTING (loading)
  // ══════════════════════════════════════

  if (phase === "extracting") {
    return (
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-8 sm:p-12">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="material-symbols-outlined text-2xl text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              auto_awesome
            </span>
          </div>
          <div className="text-center">
            <p className="text-on-surface font-headline font-bold text-lg">Analyzing your files...</p>
            <p className="text-sm text-on-surface-variant mt-1">
              AI is reading auction sheets, identifying the vehicle, and extracting all data
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm animate-pulse">description</span>
            Processing {files.length} file{files.length !== 1 ? "s" : ""}...
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  // PHASE 3: REVIEW — extracted data + Q&A
  // ══════════════════════════════════════

  // Build list of extracted fields that have values (after formatting).
  // Filter on the FORMATTED string so empty arrays / empty dimensions /
  // blank strings disappear instead of rendering an empty card.
  const extractedEntries = Object.entries(extractedData)
    .filter(([k]) => !k.startsWith("_") && !(k in HIDDEN_FIELDS))
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .filter(([k, v]) => {
      const f = formatValue(k, v);
      return f !== null && f !== undefined && f !== "";
    });

  const allRequiredAnswered = missingRequired.every(f => {
    const a = answers[f.key];
    if (f.key === "askingPriceJpy" && a === "__NOT_AVAILABLE__") return true;
    return a && a !== "__NOT_AVAILABLE__";
  });

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
      >
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        Upload different files
      </button>

      {/* Summary */}
      {summary && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary mt-0.5">auto_awesome</span>
            <div>
              <p className="text-sm font-medium text-on-surface">AI Analysis</p>
              <p className="text-sm text-on-surface-variant mt-1">{summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Data */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
        <h3 className="font-headline font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400">check_circle</span>
          Extracted Vehicle Data
        </h3>

        {extractedEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {extractedEntries.map(([key, value]) => (
              <div key={key} className="px-4 py-3 rounded-xl bg-surface-container-high border border-outline-variant/10">
                <p className="text-xs uppercase tracking-widest text-on-surface-variant mb-1">
                  {key === "mileageKm"
                    ? `Mileage (${extractedData.mileageUnit === "miles" ? "miles" : "km"})`
                    : (FIELD_LABELS[key] || key)}
                </p>
                <p className="text-on-surface font-medium">{formatValue(key, value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">No data could be extracted from the uploaded files.</p>
        )}
      </div>

      {/* Retry-recovery audit: show what the agent recovered via focused retry */}
      {retryAudit && (retryAudit.recovered?.length > 0 || retryAudit.stillMissing?.length > 0) && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary mt-0.5">autorenew</span>
            <div className="flex-1 text-sm">
              <p className="font-medium text-on-surface mb-1">Focused retry on missing fields</p>
              {retryAudit.recovered?.length > 0 && (
                <p className="text-on-surface-variant">
                  Recovered <span className="text-emerald-400 font-medium">{retryAudit.recovered.length}</span> field{retryAudit.recovered.length !== 1 ? "s" : ""} on second pass:{" "}
                  {retryAudit.recovered.map((r) => (FIELD_LABELS[r.key] || r.key)).join(", ")}
                </p>
              )}
              {retryAudit.stillMissing?.length > 0 && (
                <p className="text-on-surface-variant mt-1">
                  Could not read <span className="text-amber-400 font-medium">{retryAudit.stillMissing.length}</span> field{retryAudit.stillMissing.length !== 1 ? "s" : ""} — asking below.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Missing Required Fields — Q&A */}
      {missingRequired.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-primary/20 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">help</span>
            Required Information
          </h3>
          <p className="text-sm text-on-surface-variant mb-4">
            {(() => {
              const sheetCount = missingRequired.filter((f) => f.origin === "sheet" || f.origin === "either").length;
              const extCount = missingRequired.filter((f) => f.origin === "external").length;
              if (sheetCount > 0 && extCount > 0) {
                return `${extCount} field${extCount !== 1 ? "s" : ""} not on the auction sheet + ${sheetCount} field${sheetCount !== 1 ? "s" : ""} the agent couldn't read — please provide.`;
              }
              if (sheetCount > 0) return "The agent couldn't read these from the auction sheet. Please confirm or correct.";
              if (extCount > 0) return "These details aren't on the auction sheet — please provide.";
              return "These details are needed for an accurate valuation.";
            })()}
          </p>

          <div className="space-y-4">
            {missingRequired.map((field) => {
              const answerVal = answers[field.key];
              const answered = answerVal && answerVal !== "__NOT_AVAILABLE__";
              const skipped = answerVal === "__NOT_AVAILABLE__";
              const canDelegate = field.key === "askingPriceJpy";
              return (
                <div key={field.key} className={`p-4 rounded-xl border transition-all ${
                  skipped && canDelegate ? "bg-primary/5 border-primary/30" :
                  answered ? "bg-emerald-400/5 border-emerald-400/20" :
                  "bg-surface-container-high border-outline-variant/15"
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-on-surface flex items-center gap-2">
                      {answered && <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>}
                      {skipped && canDelegate && <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>}
                      {field.question}
                    </p>
                    {field.origin === "sheet" && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 whitespace-nowrap">
                        Couldn&apos;t read
                      </span>
                    )}
                    {field.origin === "external" && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                        Not on sheet
                      </span>
                    )}
                    {field.origin === "either" && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-on-surface-variant/10 text-on-surface-variant border border-outline-variant/15 whitespace-nowrap">
                        Optional
                      </span>
                    )}
                  </div>
                  {skipped && canDelegate ? (
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <p className="text-xs text-on-surface-variant">
                        Agent will estimate the highest JPY price that still meets your target margin from the live German market data.
                      </p>
                      <button
                        type="button"
                        onClick={() => updateAnswer(field.key, "")}
                        className="text-xs whitespace-nowrap px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
                      >
                        Enter a price
                      </button>
                    </div>
                  ) : field.key === "make" ? (
                    <select
                      value={answers[field.key] || ""}
                      onChange={(e) => updateAnswer(field.key, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all text-sm"
                    >
                      <option value="">Select brand...</option>
                      {MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="__OTHER__">Other</option>
                    </select>
                  ) : field.key === "driveSide" ? (
                    <div className="flex gap-2">
                      {["LHD", "RHD"].map((ds) => (
                        <button
                          key={ds}
                          type="button"
                          onClick={() => updateAnswer(field.key, ds)}
                          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
                            answers[field.key] === ds
                              ? "bg-primary text-on-primary"
                              : "bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {ds}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <input
                        type={["year", "mileageKm", "askingPriceJpy"].includes(field.key) ? "number" : "text"}
                        value={answers[field.key] === "__NOT_AVAILABLE__" ? "" : answers[field.key] || ""}
                        onChange={(e) => updateAnswer(field.key, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all text-sm"
                      />
                      {canDelegate && !answered && (
                        <button
                          type="button"
                          onClick={() => markNotAvailable(field.key)}
                          className="mt-2 w-full text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">auto_awesome</span>
                          I don&apos;t have a price — let the agent suggest a max bid
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing Optional Fields — Q&A */}
      {missingOptional.length > 0 && (
        <div className="bg-surface-container rounded-2xl border border-outline-variant/10 p-4 sm:p-6">
          <h3 className="font-headline font-bold text-lg mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">info</span>
            Additional Information
            <span className="text-xs font-normal text-on-surface-variant">(optional — improves accuracy)</span>
          </h3>

          <div className="space-y-4 mt-4">
            {missingOptional.map((field) => {
              const answer = answers[field.key];
              const answered = answer && answer !== "__NOT_AVAILABLE__";
              const skipped = answer === "__NOT_AVAILABLE__";

              return (
                <div
                  key={field.key}
                  className={`p-4 rounded-xl border transition-all ${
                    skipped
                      ? "bg-surface-container-high/50 border-outline-variant/10 opacity-60"
                      : answered
                      ? "bg-emerald-400/5 border-emerald-400/20"
                      : "bg-surface-container-high border-outline-variant/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-on-surface flex items-center gap-2">
                          {answered && <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>}
                          {skipped && <span className="material-symbols-outlined text-on-surface-variant text-sm">do_not_disturb_on</span>}
                          {field.question}
                        </p>
                        {field.origin === "sheet" && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 whitespace-nowrap">
                            Couldn&apos;t read
                          </span>
                        )}
                      </div>
                      {!skipped && (
                        field.key === "accidentHistory" ? (
                          <div className="flex gap-2">
                            {[{ label: "No", value: "false" }, { label: "Yes", value: "true" }].map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => updateAnswer(field.key, opt.value)}
                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${
                                  answers[field.key] === opt.value
                                    ? opt.value === "true" ? "bg-red-400/15 text-red-400 border border-red-400/30" : "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
                                    : "bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:text-on-surface"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        ) : field.key === "transmission" ? (
                          <select
                            value={answers[field.key] || ""}
                            onChange={(e) => updateAnswer(field.key, e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all text-sm"
                          >
                            <option value="">Select...</option>
                            <option value="AUTOMATIC">Automatic</option>
                            <option value="MANUAL">Manual</option>
                            <option value="DCT">DCT</option>
                            <option value="PDK">PDK</option>
                            <option value="SMG">SMG</option>
                          </select>
                        ) : field.key === "fuelType" ? (
                          <select
                            value={answers[field.key] || ""}
                            onChange={(e) => updateAnswer(field.key, e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface focus:outline-none focus:border-primary/50 transition-all text-sm"
                          >
                            <option value="">Select...</option>
                            <option value="PETROL">Petrol</option>
                            <option value="DIESEL">Diesel</option>
                            <option value="HYBRID">Hybrid</option>
                            <option value="ELECTRIC">Electric</option>
                          </select>
                        ) : (
                          <input
                            type={field.key === "auctionGrade" ? "number" : "text"}
                            value={answers[field.key] || ""}
                            onChange={(e) => updateAnswer(field.key, e.target.value)}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            step={field.key === "auctionGrade" ? "0.5" : undefined}
                            min={field.key === "auctionGrade" ? "1" : undefined}
                            max={field.key === "auctionGrade" ? "6.5" : undefined}
                            className="w-full px-4 py-2.5 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-all text-sm"
                          />
                        )
                      )}
                    </div>
                    {!answered && (
                      <button
                        type="button"
                        onClick={() => skipped ? updateAnswer(field.key, "") : markNotAvailable(field.key)}
                        className={`text-xs whitespace-nowrap px-3 py-1.5 rounded-lg transition-all ${
                          skipped
                            ? "bg-on-surface-variant/10 text-on-surface-variant hover:text-on-surface"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                        }`}
                      >
                        {skipped ? "Undo" : "Not available"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !isReady()}
        className="w-full py-4 bg-primary text-on-primary font-headline font-bold text-lg rounded-xl hover:shadow-[0_0_30px_rgba(248,113,113,0.5)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
        {loading ? "Processing Valuation..." : !isReady() ? "Answer required questions above" : "Generate Valuation Report"}
      </button>

      {!isReady() && missingRequired.length > 0 && (() => {
        const stillNeeded = missingRequired.filter(f => {
          const a = answers[f.key];
          if (f.key === "askingPriceJpy" && a === "__NOT_AVAILABLE__") return false;
          return !a || a === "__NOT_AVAILABLE__";
        }).length;
        return (
          <p className="text-center text-xs text-on-surface-variant">
            {stillNeeded} required field{stillNeeded !== 1 ? "s" : ""} still needed
          </p>
        );
      })()}
    </div>
  );
}
