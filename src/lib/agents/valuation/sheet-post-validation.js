// Post-validation orchestrator — runs after parseAuctionSheet completes.
// Adds three independent verification signals on top of the multi-pass
// Vision extraction:
//   1. VIN check-digit (ISO 3779) — provably rejects bad VIN reads
//   2. NHTSA VIN decoder       — external ground truth for make/year/engine
//   3. Reality constraints     — 15 invariants catching internal contradictions
//
// Output is a `_validation` block attached to the sheet plus adjusted
// per-field confidence scores. Downstream (risk-scorer + recommendation)
// reads these to decide whether a BUY verdict should be force-REVIEWed.
//
// None of this changes the extracted values themselves — the principle
// is "extract aggressively, validate conservatively, escalate loudly".

import { validateVin, makeFromWmi, yearFromVin } from "./vin-validator";
import { decodeVinNhtsa, compareVinDecodeWithSheet } from "./vin-decoder";
import {
  checkRealityConstraints,
  applyConstraintPenalties,
  penaltyForSeverity,
} from "./reality-constraints";

// NHTSA can be slow (occasionally 3-5s). Gate behind a flag so existing
// pipeline latency isn't affected when operators don't want the check.
const NHTSA_ENABLED = process.env.VALUATION_NHTSA !== "0";

/**
 * Post-validate a parsed auction sheet. Returns a new sheet object
 * with `_validation` populated and `_field_confidence` adjusted.
 * Input sheet is not mutated.
 */
export async function postValidateSheet(sheet) {
  if (!sheet || typeof sheet !== "object") return sheet;

  const out = { ...sheet };
  const validation = {
    vin_check: null,
    vin_decode: null,
    vin_decode_disagreements: [],
    constraint_violations: [],
    wmi_make_match: null,
    year_code_match: null,
    // Overall: was anything provably wrong?
    any_high_severity: false,
    summary: null,
  };

  // ── Step 1: VIN check digit (pure math, always on) ──
  if (sheet.vin) {
    validation.vin_check = validateVin(sheet.vin);

    // WMI → make cross-check is immediate and free.
    if (validation.vin_check.valid) {
      const wmiMake = makeFromWmi(sheet.vin);
      if (wmiMake && sheet.make) {
        const s = String(sheet.make).toLowerCase();
        const w = wmiMake.toLowerCase();
        validation.wmi_make_match =
          s === w || s.startsWith(w) || w.startsWith(s) ||
          (w === "mercedes-benz" && s.includes("mercedes")) ||
          (w === "bmw" && s.startsWith("bmw")) ||
          (w === "land rover" && s.includes("range rover"));
      }

      // Year code at position 10 — two candidates; prefer the one closer to sheet.year.
      if (sheet.year) {
        const candidates = yearFromVin(sheet.vin);
        if (Array.isArray(candidates)) {
          const closest = candidates.reduce((best, y) =>
            Math.abs(y - sheet.year) < Math.abs(best - sheet.year) ? y : best
          );
          validation.year_code_match = Math.abs(closest - sheet.year) <= 1;
        }
      }
    }
  }

  // ── Step 2: NHTSA decoder (network, feature-flagged) ──
  if (NHTSA_ENABLED && sheet.vin && validation.vin_check?.valid) {
    const decoded = await decodeVinNhtsa(sheet.vin);
    if (decoded) {
      validation.vin_decode = decoded;
      validation.vin_decode_disagreements = compareVinDecodeWithSheet(decoded, sheet);
    }
  }

  // ── Step 3: Reality constraints (rules) ──
  const { violations, byField } = checkRealityConstraints(sheet);
  validation.constraint_violations = violations;

  // ── Compute severity summary ──
  const highViolations = violations.filter((v) => v.severity === "HIGH").length;
  const highDisagreements = validation.vin_decode_disagreements.filter((d) => d.severity === "HIGH").length;
  const vinBad = validation.vin_check && !validation.vin_check.valid;

  validation.any_high_severity = highViolations > 0 || highDisagreements > 0 || vinBad;

  const parts = [];
  if (vinBad) parts.push(`VIN check-digit failed (${validation.vin_check.reason})`);
  if (validation.wmi_make_match === false) parts.push("VIN WMI doesn't match sheet make");
  if (highDisagreements > 0) parts.push(`${highDisagreements} NHTSA disagreement(s)`);
  if (highViolations > 0) parts.push(`${highViolations} HIGH-severity rule violation(s)`);
  validation.summary = parts.length ? parts.join("; ") : "All post-validation checks passed";

  // ── Apply confidence penalties per field ──
  const fieldConf = { ...(sheet._field_confidence || {}) };

  // VIN-specific penalty
  if (vinBad) {
    fieldConf.vin = Math.max(0, (fieldConf.vin ?? 0.8) - 0.6);
  } else if (validation.vin_check?.valid) {
    // A verified VIN is one of the cheapest confidence boosts available —
    // the math is closed-form and can't lie. Cap the boost at 1.0.
    fieldConf.vin = Math.min(1, (fieldConf.vin ?? 0.8) + 0.15);
  }

  // WMI mismatch → make confidence drops
  if (validation.wmi_make_match === false) {
    fieldConf.make = Math.max(0, (fieldConf.make ?? 0.8) - 0.4);
  }

  // Year-code mismatch → year confidence drops
  if (validation.year_code_match === false) {
    fieldConf.year = Math.max(0, (fieldConf.year ?? 0.8) - 0.3);
  }

  // NHTSA disagreements
  for (const d of validation.vin_decode_disagreements) {
    const penalty = penaltyForSeverity(d.severity);
    fieldConf[d.field] = Math.max(0, (fieldConf[d.field] ?? 0.8) - penalty);
  }

  // Reality-constraint penalties
  const withConstraintPenalties = applyConstraintPenalties(fieldConf, byField);

  out._field_confidence = withConstraintPenalties;
  out._validation = validation;

  // Global confidence is dragged down by the *worst* field's new confidence —
  // if VIN failed, we don't want the sheet-level confidence to still look high.
  const criticalFields = ["make", "model", "year", "vin", "mileage_reading", "overall_grade"];
  const criticalScores = criticalFields
    .map((f) => withConstraintPenalties[f])
    .filter((c) => typeof c === "number");
  if (criticalScores.length) {
    const worstCritical = Math.min(...criticalScores);
    // The sheet's top-level confidence gets pulled toward the worst critical
    // field; this is what downstream risk scoring actually uses.
    out.confidence = Math.min(
      out.confidence ?? 0.8,
      // Weighted blend: existing confidence × 0.6 + worstCritical × 0.4.
      (out.confidence ?? 0.8) * 0.6 + worstCritical * 0.4
    );
  }

  return out;
}
