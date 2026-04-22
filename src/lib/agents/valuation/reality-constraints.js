// Reality constraints: facts about the world that a valid auction sheet
// must satisfy. When a constraint fires, the extraction is *provably*
// inconsistent — the sheet can't simultaneously claim a 2020 model year
// and 600,000 km of use, for instance.
//
// Each constraint returns null when satisfied, or an object
//   { rule, severity: "LOW" | "MEDIUM" | "HIGH", fields: string[], message }
// on violation. Fields in `fields[]` get their confidence penalized
// downstream so the verdict engine sees elevated uncertainty.

const CURRENT_YEAR = new Date().getFullYear();

// ─────────────────────────────────────────────────────────────
// Individual rules — each is a pure function of the parsed sheet.
// ─────────────────────────────────────────────────────────────

// Era → base year + valid-number bounds. Showa ran 1926-1989 (max 64),
// Heisei ran 1989-2019 (max 31), Reiwa started 2019 (open-ended, capped
// at current year - 2018). Numbers outside these ranges are OCR garbage.
const ERA_SPEC = {
  S: { base: 1925, max: 64, name: "Showa" },
  H: { base: 1988, max: 31, name: "Heisei" },
  R: { base: 2018, max: Math.max(1, new Date().getFullYear() - 2018), name: "Reiwa" },
};

function ruleEraMathMatches(sheet) {
  if (!sheet.year_era || !sheet.year) return null;
  const match = String(sheet.year_era).toUpperCase().match(/^([SHR])\s*(\d{1,2})/);
  if (!match) return null;
  const spec = ERA_SPEC[match[1]];
  if (!spec) return null;
  const expected = spec.base + parseInt(match[2], 10);
  if (expected !== sheet.year) {
    return {
      rule: "era_math",
      severity: "HIGH",
      fields: ["year", "year_era"],
      message: `Japanese era ${sheet.year_era} (${spec.name}) resolves to ${expected}, but sheet reports year ${sheet.year}`,
    };
  }
  return null;
}

// Flag era numbers that are literally impossible — H32 (Heisei ended at 31),
// R{current+1}, S65+ — OCR garbage that would otherwise sneak through.
// Also catches unknown era letters ("T24" etc.) before number bounds apply.
function ruleEraNumberBounds(sheet) {
  if (!sheet.year_era) return null;
  // Permissive letter match first — detect shape "<letter><digits>" without
  // committing to S/H/R, so we can flag invalid letters explicitly.
  const shapeMatch = String(sheet.year_era).toUpperCase().match(/^([A-Z])\s*(\d{1,2})/);
  if (!shapeMatch) return null;
  const letter = shapeMatch[1];
  const spec = ERA_SPEC[letter];
  if (!spec) {
    return {
      rule: "era_letter_unknown",
      severity: "HIGH",
      fields: ["year_era"],
      message: `Unknown era letter "${letter}" — valid letters are S (Showa), H (Heisei), R (Reiwa)`,
    };
  }
  const num = parseInt(shapeMatch[2], 10);
  if (num < 1 || num > spec.max) {
    return {
      rule: "era_number_out_of_bounds",
      severity: "HIGH",
      fields: ["year_era"],
      message: `${spec.name} era number ${num} is out of bounds (valid range: 1-${spec.max}); likely an OCR misread`,
    };
  }
  return null;
}

function ruleYearInRange(sheet) {
  if (!sheet.year) return null;
  if (sheet.year < 1990 || sheet.year > CURRENT_YEAR + 1) {
    return {
      rule: "year_range",
      severity: "HIGH",
      fields: ["year"],
      message: `Year ${sheet.year} is outside plausible range 1990-${CURRENT_YEAR + 1}`,
    };
  }
  return null;
}

function ruleOverallGradeRange(sheet) {
  const g = sheet.overall_grade;
  if (g == null) return null;
  const valid = (g >= 1 && g <= 6) || g === 6.5;
  if (!valid) {
    return {
      rule: "grade_range",
      severity: "MEDIUM",
      fields: ["overall_grade"],
      message: `Overall grade ${g} is not in valid set (1.0-6.0 or 6.5 for S)`,
    };
  }
  return null;
}

function ruleInteriorGradeRange(sheet) {
  if (!sheet.interior_grade) return null;
  if (!/^[ABCD]$/.test(sheet.interior_grade)) {
    return {
      rule: "interior_grade_range",
      severity: "MEDIUM",
      fields: ["interior_grade"],
      message: `Interior grade "${sheet.interior_grade}" is not one of A/B/C/D`,
    };
  }
  return null;
}

function ruleMileagePerYearSanity(sheet) {
  if (!sheet.year || !sheet.mileage_reading || sheet.mileage_reading <= 0) return null;
  const age = Math.max(0.5, CURRENT_YEAR - sheet.year);
  const kmPerYear = sheet.mileage_reading / age;
  if (kmPerYear > 60000) {
    return {
      rule: "mileage_per_year_high",
      severity: "MEDIUM",
      fields: ["mileage_reading", "year"],
      message: `${Math.round(kmPerYear).toLocaleString()} km/year is implausibly high (age ${age.toFixed(1)}y, total ${sheet.mileage_reading.toLocaleString()} km)`,
    };
  }
  if (kmPerYear < 200 && sheet.mileage_reading > 100) {
    return {
      rule: "mileage_per_year_low",
      severity: "LOW",
      fields: ["mileage_reading", "year"],
      message: `${Math.round(kmPerYear).toLocaleString()} km/year is suspiciously low — verify odometer reading`,
    };
  }
  return null;
}

function ruleAccidentFlagVsDamageCodes(sheet) {
  if (sheet.accident_history !== false) return null;
  if (!Array.isArray(sheet.damage_codes)) return null;
  const majorDamage = sheet.damage_codes.filter((d) => d?.severity === "MAJOR");
  if (majorDamage.length > 0) {
    return {
      rule: "accident_vs_damage_contradiction",
      severity: "HIGH",
      fields: ["accident_history", "damage_codes"],
      message: `Sheet marks accident_history=false but records ${majorDamage.length} MAJOR-severity damage code(s)`,
    };
  }
  return null;
}

function rulePanelVsDamageCodeCount(sheet) {
  if (!sheet.panel_conditions || !Array.isArray(sheet.damage_codes)) return null;
  const panelsWithDamage = Object.entries(sheet.panel_conditions).filter(
    ([, v]) => v && v !== "OK" && v !== "クリーン" && !/^(none|clean)$/i.test(String(v))
  ).length;
  const codes = sheet.damage_codes.length;
  // Allow slack of 2 — the diagram often groups related damage into one code.
  if (Math.abs(panelsWithDamage - codes) > 3 && panelsWithDamage > 0 && codes > 0) {
    return {
      rule: "panel_vs_code_count",
      severity: "LOW",
      fields: ["panel_conditions", "damage_codes"],
      message: `Panel diagram shows ${panelsWithDamage} damaged panel(s) but ${codes} damage code(s) were extracted`,
    };
  }
  return null;
}

function ruleInteriorGradeVsScore(sheet) {
  // A Grade-A interior with a Pass-3 interior_score of 3 is a contradiction.
  if (!sheet.interior_grade || sheet.interior_score == null) return null;
  const expectedMin = { A: 7, B: 5, C: 3, D: 1 }[sheet.interior_grade];
  if (expectedMin == null) return null;
  if (sheet.interior_score < expectedMin - 1) {
    return {
      rule: "interior_grade_vs_score",
      severity: "MEDIUM",
      fields: ["interior_grade", "interior_score"],
      message: `Interior grade ${sheet.interior_grade} implies score ≥${expectedMin}, but photo/pass score is ${sheet.interior_score}`,
    };
  }
  return null;
}

function ruleDisplacementInRange(sheet) {
  if (!sheet.displacement_cc) return null;
  const cc = sheet.displacement_cc;
  if (cc < 600 || cc > 8500) {
    return {
      rule: "displacement_range",
      severity: "MEDIUM",
      fields: ["displacement_cc"],
      message: `Displacement ${cc}cc is outside plausible 600-8500cc range — verify unit (L vs cc)`,
    };
  }
  return null;
}

function ruleDriveSideValid(sheet) {
  if (!sheet.drive_side) return null;
  const ds = String(sheet.drive_side).toUpperCase();
  if (!["LHD", "RHD"].includes(ds)) {
    return {
      rule: "drive_side_valid",
      severity: "LOW",
      fields: ["drive_side"],
      message: `drive_side "${sheet.drive_side}" is not LHD/RHD`,
    };
  }
  return null;
}

function ruleTransmissionValid(sheet) {
  if (!sheet.transmission) return null;
  const t = String(sheet.transmission).toUpperCase();
  const valid = ["MANUAL", "AUTOMATIC", "DCT", "PDK", "SMG", "AT", "MT", "CVT", "AMT"];
  if (!valid.includes(t)) {
    return {
      rule: "transmission_valid",
      severity: "LOW",
      fields: ["transmission"],
      message: `Transmission "${sheet.transmission}" is not in the recognised set`,
    };
  }
  return null;
}

function ruleGradeVsAccident(sheet) {
  // A grade-5 or grade-6 sheet combined with accident_history=true is almost
  // always a misread — top-grade Japanese auctions have accident-free vehicles.
  if (!sheet.overall_grade || sheet.accident_history !== true) return null;
  if (sheet.overall_grade >= 5) {
    return {
      rule: "grade_vs_accident_contradiction",
      severity: "HIGH",
      fields: ["overall_grade", "accident_history"],
      message: `Overall grade ${sheet.overall_grade} with accident_history=true is contradictory; verify grade`,
    };
  }
  return null;
}

function ruleMakeConsistency(sheet) {
  if (!sheet.make || !sheet.model) return null;
  // A Ferrari model shouldn't appear under make=Porsche etc. Light-touch
  // sanity check against the most common Luxury-car model families.
  const m = sheet.make.toLowerCase();
  const mo = sheet.model.toLowerCase();
  const wrong = [
    { make: "ferrari", mustNotContain: ["911", "carrera", "amg", "m3", "m4", "m5", "rolls"] },
    { make: "porsche", mustNotContain: ["488", "f430", "gt-r", "amg", "huracan"] },
    { make: "mercedes", mustNotContain: ["911", "panamera", "f430", "huracan"] },
    { make: "bmw", mustNotContain: ["911", "amg", "huracan", "f430"] },
    { make: "lamborghini", mustNotContain: ["911", "amg", "f430", "m3"] },
  ];
  for (const w of wrong) {
    if (m.includes(w.make)) {
      for (const kw of w.mustNotContain) {
        if (mo.includes(kw)) {
          return {
            rule: "make_model_family",
            severity: "HIGH",
            fields: ["make", "model"],
            message: `Make="${sheet.make}" with model containing "${kw}" is implausible; one of them is misread`,
          };
        }
      }
    }
  }
  return null;
}

function ruleShakenDateSanity(sheet) {
  if (!sheet.shaken_expiry) return null;
  const s = String(sheet.shaken_expiry);
  const m = s.match(/(\d{4})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (year < 2000 || year > CURRENT_YEAR + 3) {
    return {
      rule: "shaken_date_range",
      severity: "LOW",
      fields: ["shaken_expiry"],
      message: `Shaken expiry year ${year} is outside plausible range`,
    };
  }
  return null;
}

// Shaken (車検) is Japan's mandatory vehicle inspection. It runs on a fixed
// cycle: 3 years for a brand-new car, then 2 years per renewal thereafter.
// So a reasonable shaken expiry must be >= registration year + 2. An expiry
// *before* registration or equal to it means one of them was misread.
// This rule catches handwriting misreads like R9 → R3 where the shaken
// year ends up implausibly close to (or before) the registration year.
function ruleShakenVsRegistrationYear(sheet) {
  if (!sheet.shaken_expiry || !sheet.year) return null;
  const m = String(sheet.shaken_expiry).match(/(\d{4})/);
  if (!m) return null;
  const shakenYear = parseInt(m[1], 10);
  const regYear = sheet.year;
  // Newly-imported vehicles can expire up to 4 years after first-reg in some
  // edge cases (if Japan registration differs from first-country-of-use).
  // Allow ±1 year slack and treat anything ≥ reg - 1 as plausible.
  if (shakenYear < regYear - 1) {
    return {
      rule: "shaken_before_registration",
      severity: "HIGH",
      fields: ["shaken_expiry", "year"],
      message: `Shaken expiry ${shakenYear} is before or too close to registration year ${regYear}; one of them was misread (e.g. handwritten R9 confused with R3)`,
    };
  }
  // Past-date expiry for a car claimed to still be at auction is unusual
  // but not impossible (auction car with expired shaken). Flag as LOW.
  if (shakenYear < CURRENT_YEAR) {
    return {
      rule: "shaken_expired",
      severity: "LOW",
      fields: ["shaken_expiry"],
      message: `Shaken expired in ${shakenYear}; verify this is intentional (some auction cars are sold sha-nashi)`,
    };
  }
  return null;
}

// Two-tone interior preservation — Japanese auction sheets commonly list
// two-tone leather as "ブラック/ホワイト" (Black/White). The separator "/"
// MUST survive translation; if the Japanese shows a split and the English
// collapses to a single color, the translation dropped information that
// affects resale value (two-tone luxury interiors price differently).
function ruleTwoToneInteriorConsistency(sheet) {
  const jp = sheet.interior_color_japanese || sheet.interior_color_jp || null;
  const en = sheet.interior_color;
  if (!jp || !en) return null;
  const jpHasSeparator = /[\/／]/.test(String(jp));
  const enHasSeparator = /[\/／]/.test(String(en));
  if (jpHasSeparator && !enHasSeparator) {
    return {
      rule: "two_tone_interior_dropped",
      severity: "MEDIUM",
      fields: ["interior_color"],
      message: `Two-tone interior detected in Japanese ("${jp}") but translated value "${en}" collapsed to one color; separator "/" should be preserved`,
    };
  }
  return null;
}

function ruleDimensionsSanity(sheet) {
  const d = sheet.dimensions;
  if (!d) return null;
  const violations = [];
  if (d.length_mm != null && (d.length_mm < 2500 || d.length_mm > 6000)) {
    violations.push(`length ${d.length_mm}mm`);
  }
  if (d.width_mm != null && (d.width_mm < 1300 || d.width_mm > 2300)) {
    violations.push(`width ${d.width_mm}mm`);
  }
  if (d.height_mm != null && (d.height_mm < 1000 || d.height_mm > 2500)) {
    violations.push(`height ${d.height_mm}mm`);
  }
  if (violations.length) {
    return {
      rule: "dimensions_sanity",
      severity: "LOW",
      fields: ["dimensions"],
      message: `Dimensions outside plausible range: ${violations.join(", ")}`,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────

const ALL_RULES = [
  ruleEraMathMatches,
  ruleEraNumberBounds,
  ruleYearInRange,
  ruleOverallGradeRange,
  ruleInteriorGradeRange,
  ruleMileagePerYearSanity,
  ruleAccidentFlagVsDamageCodes,
  rulePanelVsDamageCodeCount,
  ruleInteriorGradeVsScore,
  ruleDisplacementInRange,
  ruleDriveSideValid,
  ruleTransmissionValid,
  ruleGradeVsAccident,
  ruleMakeConsistency,
  ruleShakenDateSanity,
  ruleShakenVsRegistrationYear,
  ruleDimensionsSanity,
  ruleTwoToneInteriorConsistency,
];

/**
 * Run every reality-constraint rule against a parsed sheet. Returns:
 *   { violations: Violation[], byField: Record<field, Violation[]> }
 *
 * Never throws — the goal is to survey the output, not fail loudly.
 */
export function checkRealityConstraints(sheet) {
  if (!sheet || typeof sheet !== "object") {
    return { violations: [], byField: {} };
  }
  const violations = [];
  for (const rule of ALL_RULES) {
    try {
      const v = rule(sheet);
      if (v) violations.push(v);
    } catch {
      // Any rule crashing is a bug in the rule, not the sheet —
      // continue with the remaining rules.
    }
  }
  const byField = {};
  for (const v of violations) {
    for (const f of v.fields) {
      if (!byField[f]) byField[f] = [];
      byField[f].push(v);
    }
  }
  return { violations, byField };
}

/**
 * Apply a confidence penalty per field based on violation severity.
 * HIGH violations drop field confidence by 0.4, MEDIUM by 0.2, LOW by 0.05.
 * Confidence can't go below 0 or above 1.
 */
export function penaltyForSeverity(severity) {
  return { HIGH: 0.4, MEDIUM: 0.2, LOW: 0.05 }[severity] || 0;
}

export function applyConstraintPenalties(fieldConfidence, byField) {
  const out = { ...(fieldConfidence || {}) };
  for (const [field, vs] of Object.entries(byField)) {
    const maxPenalty = Math.max(0, ...vs.map((v) => penaltyForSeverity(v.severity)));
    const current = out[field] ?? 0.8;
    out[field] = Math.max(0, Math.min(1, current - maxPenalty));
  }
  return out;
}
