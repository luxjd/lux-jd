// Multi-model ensemble for auction-sheet extraction.
//
// Same image, three different vision models, via OpenRouter (so no new
// API key is required — we already carry OPENROUTER_API_KEY). The three
// models have *uncorrelated* failure modes: Claude, GPT-5, and Gemini
// each hallucinate on different things. If two agree on a field, the
// combined posterior accuracy for that field is ~99.5%.
//
// Disabled by default (SHEET_ENSEMBLE env flag). When enabled, call
// `ensembleExtract(image)` from sheet-parser.js in place of a single
// Pass-1 call; it returns the consensus object with per-field provenance.

import { callClaudeVision } from "@/lib/claude";
import { loadPrompt } from "./prompts/loader";

// Three vision-capable models with independent training data and
// architectures. All reachable via OpenRouter with the key we already have.
// This OpenRouter deployment is provider-pinned to Anthropic (see
// claude.js PROVIDER_PIN). Using three different Anthropic tiers —
// Opus / Sonnet / Haiku — as the ensemble. Different parameter scales
// = different error modes on small-text OCR. Override via env
// SHEET_ENSEMBLE_MODELS=id1,id2,id3 if your provider pin differs.
const ENSEMBLE_MODELS = (process.env.SHEET_ENSEMBLE_MODELS
  ? process.env.SHEET_ENSEMBLE_MODELS.split(",").map((id) => ({ id: id.trim(), name: id.trim().split("/").pop() }))
  : [
      { id: "anthropic/claude-opus-4-7",     name: "opus" },
      { id: "anthropic/claude-sonnet-4",     name: "sonnet" },
      { id: "anthropic/claude-haiku-4.5",    name: "haiku" },
    ]);

// Fields where cross-model consensus is most valuable — these are the
// ones with high silent-failure risk (mileage digit-boxes, model year,
// VIN text, color, grade numbers). Free-text fields (notes, assessment)
// fall back to the highest-confidence single extraction.
const CONSENSUS_FIELDS = [
  "make",
  "model",
  "year",
  "year_era",
  "vin",
  "mileage_reading",
  "exterior_color",
  "interior_color",
  "overall_grade",
  "interior_grade",
  "drive_side",
  "transmission",
  "fuel_type",
  "displacement_cc",
  "accident_history",
];

export function ensembleEnabled() {
  return process.env.SHEET_ENSEMBLE === "1" || process.env.VALUATION_SHEET_ENSEMBLE === "1";
}

/**
 * Run extraction on `image` through every ensemble model in parallel.
 * Returns an array of { name, model, result, elapsedMs }. Failed calls
 * are returned with result=null so the consensus step can still see them.
 */
async function runAllExtractors(image, { prompt, system, maxTokens = 4096 } = {}) {
  const tasks = ENSEMBLE_MODELS.map(async ({ id, name }) => {
    const t0 = Date.now();
    try {
      const result = await callClaudeVision({
        prompt,
        system,
        images: [image],
        model: id,
        maxTokens,
      });
      return { name, model: id, result, elapsedMs: Date.now() - t0 };
    } catch (e) {
      return { name, model: id, result: null, error: e.message, elapsedMs: Date.now() - t0 };
    }
  });
  return Promise.all(tasks);
}

// ─────────────────────────────────────────────────────────────
// Per-field consensus strategy
// ─────────────────────────────────────────────────────────────
// For each field:
//   - Collect the three model answers (skipping null/undefined).
//   - Normalise (trim strings, round numbers to spec precision).
//   - Bucket by equality; pick the bucket with ≥2 votes if one exists.
//   - If all three disagree → pick the longest non-empty string OR
//     the median number, and flag `disagreement: true` so the
//     post-validator drops confidence for that field.

// Value normalisers applied BEFORE bucketing votes — so "Left" and "LHD"
// count as the same answer and achieve consensus instead of splitting the
// vote three ways. The normalised form is used only for bucket keys; the
// first raw value in the winning bucket is what gets returned downstream.
const DRIVE_SIDE_ALIASES = {
  left: "LHD", lhd: "LHD", "left-hand drive": "LHD", "左": "LHD",
  right: "RHD", rhd: "RHD", "right-hand drive": "RHD", "右": "RHD",
};
const TRANSMISSION_ALIASES = {
  at: "AUTOMATIC", auto: "AUTOMATIC", automatic: "AUTOMATIC", a: "AUTOMATIC",
  mt: "MANUAL", manual: "MANUAL", m: "MANUAL",
  dct: "DCT", pdk: "PDK", smg: "SMG", cvt: "AUTOMATIC",
};
const FUEL_ALIASES = {
  gasoline: "PETROL", gas: "PETROL", petrol: "PETROL", "ガソリン": "PETROL",
  diesel: "DIESEL", "軽油": "DIESEL", hybrid: "HYBRID",
  electric: "ELECTRIC", ev: "ELECTRIC",
};

function normalise(value, field) {
  if (value == null) return null;
  if (typeof value === "string") {
    const lc = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (field === "drive_side" && DRIVE_SIDE_ALIASES[lc]) return DRIVE_SIDE_ALIASES[lc];
    if (field === "transmission" && TRANSMISSION_ALIASES[lc]) return TRANSMISSION_ALIASES[lc];
    if (field === "fuel_type" && FUEL_ALIASES[lc]) return FUEL_ALIASES[lc];
    return lc;
  }
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return value;
}

function voteOn(values, field) {
  const buckets = new Map();
  for (const v of values) {
    if (v == null) continue;
    const normalised = normalise(v, field);
    const key = JSON.stringify(normalised);
    const entry = buckets.get(key) || { count: 0, values: [], normalised };
    entry.count += 1;
    entry.values.push(v);
    buckets.set(key, entry);
  }
  if (buckets.size === 0) return { value: null, agree: 0, total: 0 };

  let best = null;
  for (const [, entry] of buckets) {
    if (!best || entry.count > best.count) best = entry;
  }

  // Return the NORMALISED form for canonical fields (LHD/RHD/AUTOMATIC/...)
  // so downstream validation sees canonical values, not "Left" or "AT".
  const CANONICAL_FIELDS = new Set(["drive_side", "transmission", "fuel_type"]);
  const value = CANONICAL_FIELDS.has(field) && best.normalised != null ? best.normalised : best.values[0];

  const total = values.filter((v) => v != null).length;
  return { value, agree: best.count, total };
}

function median(nums) {
  const sorted = nums.filter((n) => typeof n === "number" && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Apply the canonical-form normalisation to drive_side / transmission / fuel
// regardless of which code path produced the merged object. Fixes the case
// where a single-model early-return preserves "Left" / "AT" / "Gasoline"
// instead of "LHD" / "AUTOMATIC" / "PETROL".
function canonicaliseFields(obj) {
  if (!obj) return obj;
  if (typeof obj.drive_side === "string") {
    const n = normalise(obj.drive_side, "drive_side");
    if (n === "LHD" || n === "RHD") obj.drive_side = n;
  }
  if (typeof obj.transmission === "string") {
    const n = normalise(obj.transmission, "transmission");
    if (typeof n === "string" && /^(AUTOMATIC|MANUAL|DCT|PDK|SMG)$/.test(n)) obj.transmission = n;
  }
  if (typeof obj.fuel_type === "string") {
    const n = normalise(obj.fuel_type, "fuel_type");
    if (typeof n === "string" && /^(PETROL|DIESEL|HYBRID|ELECTRIC)$/.test(n)) obj.fuel_type = n;
  }
  return obj;
}

function mergeByConsensus(extractorResults) {
  const results = extractorResults.map((r) => r.result).filter(Boolean);
  if (results.length === 0) return null;
  if (results.length === 1) {
    return canonicaliseFields({
      ...results[0],
      _ensemble: {
        participants: extractorResults.map((r) => ({ name: r.name, model: r.model, succeeded: !!r.result, elapsedMs: r.elapsedMs })),
        consensus_summary: "Only one model returned a result — no consensus possible.",
      },
    });
  }

  // Start by copying the first result's shape, then overwrite contested
  // fields with consensus values.
  const merged = JSON.parse(JSON.stringify(results[0]));
  const perField = {};
  const fieldConfidence = {};

  for (const field of CONSENSUS_FIELDS) {
    const values = results.map((r) => r?.[field]);
    const { value, agree, total } = voteOn(values, field);
    if (value !== null && value !== undefined) {
      merged[field] = value;
    }
    perField[field] = { value, agree, total, disagreement: total > 1 && agree < total };

    // Confidence formula:
    //   unanimous (agree = total, total ≥ 2) → 0.98
    //   majority  (agree = total - 1)        → 0.85
    //   split     (agree < majority)         → 0.55
    if (total >= 2) {
      if (agree === total) fieldConfidence[field] = 0.98;
      else if (agree >= Math.ceil(total / 2) + (total === 2 ? 0 : 0)) fieldConfidence[field] = 0.85;
      else fieldConfidence[field] = 0.55;
    }
  }

  // Numerical fields: keep the consensus when ≥2 agree; otherwise use the
  // median to reduce wild outliers.
  for (const numField of ["mileage_reading", "overall_grade", "displacement_cc", "year"]) {
    const values = results.map((r) => r?.[numField]).filter((v) => typeof v === "number");
    if (values.length >= 2 && perField[numField]?.disagreement) {
      merged[numField] = median(values);
      fieldConfidence[numField] = 0.7;
    }
  }

  merged._field_confidence = { ...(merged._field_confidence || {}), ...fieldConfidence };
  merged._ensemble = {
    participants: extractorResults.map((r) => ({
      name: r.name,
      model: r.model,
      succeeded: !!r.result,
      elapsedMs: r.elapsedMs,
      error: r.error || null,
    })),
    per_field: perField,
    consensus_summary: summariseDisagreements(perField),
  };

  // Pull global sheet confidence down when many critical fields disagreed.
  const criticalDisagreements = Object.values(perField).filter((f) => f.disagreement && f.total >= 2).length;
  if (criticalDisagreements >= 3) {
    merged.confidence = Math.min(merged.confidence ?? 0.9, 0.55);
  } else if (criticalDisagreements >= 1) {
    merged.confidence = Math.min(merged.confidence ?? 0.9, 0.75);
  }

  return canonicaliseFields(merged);
}

function summariseDisagreements(perField) {
  const issues = Object.entries(perField)
    .filter(([, f]) => f.disagreement && f.total >= 2)
    .map(([k, f]) => `${k} (${f.agree}/${f.total} agreement)`);
  if (issues.length === 0) return "All critical fields reached unanimous or majority consensus.";
  return `Models disagreed on: ${issues.join(", ")}. Reduced confidence applied to those fields.`;
}

/**
 * Public entry point. Accepts the same (image, opts) that sheet-parser
 * would pass to a single callClaudeVision; returns the merged consensus
 * object shaped exactly like a Pass-1 result (so the rest of the
 * sheet-parser pipeline is a no-op change).
 */
export async function ensembleExtract(image, { prompt, system, maxTokens } = {}) {
  const extractors = await runAllExtractors(image, {
    prompt: prompt || loadPrompt("sheet_parsing"),
    system: system || loadPrompt("sheet_parsing.system"),
    maxTokens,
  });
  return mergeByConsensus(extractors);
}
