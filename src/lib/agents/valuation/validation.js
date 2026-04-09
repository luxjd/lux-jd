/**
 * Input/output validation for the Valuation Agent.
 * Validates all data flowing through the pipeline to catch garbage early.
 *
 * Enhanced with:
 * - Per-field confidence support for sheet output
 * - Richer damage code validation
 * - Extraction output validation for upload flow
 * - Cross-validation helpers
 */

const SUPPORTED_MAKES = ["Ferrari", "Mercedes-AMG", "Mercedes-Benz", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "Jaguar", "Maserati", "BMW M", "BMW", "Range Rover", "Land Rover", "Rolls-Royce", "McLaren", "Lotus", "Alfa Romeo", "Bugatti", "Audi"];
const VALID_DRIVE_SIDES = ["LHD", "RHD"];
const VALID_TRANSMISSIONS = ["MANUAL", "AUTOMATIC", "DCT", "PDK", "SMG", ""];
const VALID_FUEL_TYPES = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "CNG", ""];
const VALID_SERVICE_HISTORY = ["FULL_DEALER", "PARTIAL_DEALER", "INDEPENDENT", "UNKNOWN"];
const VALID_VERDICTS = ["BUY", "REVIEW", "PASS"];
const VALID_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const VALID_LIQUIDITY = ["HIGH", "MEDIUM", "LOW"];
const VALID_TRENDS = ["RISING", "STABLE", "DECLINING"];
const VALID_INTERIOR_GRADES = ["A", "B", "C", "D"];
const VALID_SEVERITIES = ["MINOR", "MODERATE", "MAJOR"];
const VALID_DAMAGE_DISTRIBUTIONS = ["SYMMETRIC", "LEFT_BIASED", "RIGHT_BIASED", "FRONT_BIASED", "REAR_BIASED", "SCATTERED", "CLEAN"];
const VALID_REPAIR_COST_CATEGORIES = ["NONE", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"];

/**
 * Validate and sanitize valuation input. Throws on invalid required fields.
 */
export function validateInput(input) {
  const errors = [];

  // Required fields
  if (!input.make || typeof input.make !== "string") errors.push("make is required");
  if (!input.model || typeof input.model !== "string") errors.push("model is required");
  if (!input.year || input.year < 1990 || input.year > new Date().getFullYear() + 1) errors.push(`year must be 1990-${new Date().getFullYear() + 1}`);
  if (input.mileageKm == null || input.mileageKm < 0 || input.mileageKm > 999999) errors.push("mileageKm must be 0-999999");
  if (!VALID_DRIVE_SIDES.includes(input.driveSide)) errors.push("driveSide must be LHD or RHD");
  if (!input.askingPriceJpy || input.askingPriceJpy <= 0 || input.askingPriceJpy > 500000000) errors.push("askingPriceJpy must be 1-500000000");
  if (!input.exteriorColor || typeof input.exteriorColor !== "string") errors.push("exteriorColor is required");

  // Optional field sanitization
  if (input.auctionGrade != null && input.auctionGrade !== "") {
    const g = parseFloat(input.auctionGrade);
    if (isNaN(g) || g < 1.0 || g > 6.5) errors.push("auctionGrade must be 1.0-6.5");
  }
  if (input.transmission && !VALID_TRANSMISSIONS.includes(input.transmission)) {
    errors.push(`transmission must be one of: ${VALID_TRANSMISSIONS.filter(Boolean).join(", ")}`);
  }
  if (input.fuelType && !VALID_FUEL_TYPES.includes(input.fuelType)) {
    errors.push(`fuelType must be one of: ${VALID_FUEL_TYPES.filter(Boolean).join(", ")}`);
  }

  if (errors.length > 0) {
    const err = new Error(`Validation failed: ${errors.join("; ")}`);
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // Return sanitized input
  return {
    ...input,
    make: input.make.trim(),
    model: input.model.trim(),
    year: parseInt(input.year),
    mileageKm: parseInt(input.mileageKm),
    askingPriceJpy: parseInt(input.askingPriceJpy),
    exteriorColor: input.exteriorColor.trim(),
    interiorColor: input.interiorColor?.trim() || "",
    serviceHistory: VALID_SERVICE_HISTORY.includes(input.serviceHistory) ? input.serviceHistory : "UNKNOWN",
    accidentHistory: !!input.accidentHistory,
    auctionGrade: input.auctionGrade ? parseFloat(input.auctionGrade) : null,
    specificationNotes: input.specificationNotes?.trim() || "",
  };
}

/**
 * Validate risk assessment output from Claude. Fix common issues.
 */
export function validateRiskOutput(result) {
  if (!result || typeof result !== "object") return null;

  // Validate verdict
  if (!VALID_VERDICTS.includes(result.verdict)) {
    result.verdict = "REVIEW"; // safe fallback
  }

  // Validate risk scores
  if (result.risk_scores && typeof result.risk_scores === "object") {
    for (const key of ["condition", "provenance", "tuv", "market", "currency", "capital"]) {
      const risk = result.risk_scores[key];
      if (risk) {
        risk.score = clampNumber(risk.score, 1, 5, 3);
        risk.level = VALID_RISK_LEVELS.includes(risk.level) ? risk.level : scoreToLevel(risk.score);
        risk.reasoning = risk.reasoning || "No reasoning provided";
      } else {
        result.risk_scores[key] = { score: 3, level: "MEDIUM", reasoning: "Unable to assess" };
      }
    }
  }

  // Validate overall risk score
  result.overall_risk_score = clampNumber(result.overall_risk_score, 1, 5, 3);
  result.overall_risk_level = VALID_RISK_LEVELS.includes(result.overall_risk_level) ? result.overall_risk_level : scoreToLevel(result.overall_risk_score);

  // Validate max_bid_jpy
  if (result.max_bid_jpy != null) {
    result.max_bid_jpy = Math.max(0, Math.round(result.max_bid_jpy));
  }

  // Ensure arrays
  result.key_strengths = Array.isArray(result.key_strengths) ? result.key_strengths : [];
  result.key_concerns = Array.isArray(result.key_concerns) ? result.key_concerns : [];
  result.action_items = Array.isArray(result.action_items) ? result.action_items : [];

  return result;
}

/**
 * Validate photo analysis output from Claude.
 */
export function validatePhotoOutput(result) {
  if (!result || typeof result !== "object") return null;

  result.exterior_score = clampNumber(result.exterior_score, 1, 10, 5);
  result.interior_score = clampNumber(result.interior_score, 1, 10, 5);
  result.confidence = clampNumber(result.confidence, 0, 1, 0.5);
  result.exterior_notes = Array.isArray(result.exterior_notes) ? result.exterior_notes : [];
  result.interior_notes = Array.isArray(result.interior_notes) ? result.interior_notes : [];
  result.visible_modifications = Array.isArray(result.visible_modifications) ? result.visible_modifications : [];
  result.visible_damage = Array.isArray(result.visible_damage) ? result.visible_damage : [];
  result.notable_features_spotted = Array.isArray(result.notable_features_spotted) ? result.notable_features_spotted : [];
  result.tuv_risk_flags = Array.isArray(result.tuv_risk_flags) ? result.tuv_risk_flags : [];
  result.overall_impression = result.overall_impression || "No summary available";

  return result;
}

/**
 * Validate market analysis output from Claude.
 */
export function validateMarketOutput(result) {
  if (!result || typeof result !== "object") return null;

  if (result.estimated_sale_price_eur != null) {
    result.estimated_sale_price_eur = Math.max(0, Math.round(result.estimated_sale_price_eur));
  }

  result.avg_days_on_market = clampNumber(result.avg_days_on_market, 1, 365, 30);
  result.market_liquidity = VALID_LIQUIDITY.includes(result.market_liquidity) ? result.market_liquidity : "MEDIUM";
  result.trend_direction = VALID_TRENDS.includes(result.trend_direction) ? result.trend_direction : "STABLE";
  result.confidence = clampNumber(result.confidence, 0, 1, 0.5);
  result.price_adjustments = Array.isArray(result.price_adjustments) ? result.price_adjustments : [];

  return result;
}

/**
 * Validate sheet parser output — enhanced for multi-pass extraction.
 * Handles both new enriched format and backward-compatible fields.
 */
export function validateSheetOutput(result) {
  if (!result || typeof result !== "object") return null;

  // ── Grade validation ──
  if (result.overall_grade != null) {
    result.overall_grade = clampNumber(result.overall_grade, 1, 6.5, null);
  }

  // ── Interior grade ──
  if (result.interior_grade && !VALID_INTERIOR_GRADES.includes(result.interior_grade)) {
    result.interior_grade = null;
  }

  // ── Mileage validation ──
  if (result.mileage_reading != null) {
    result.mileage_reading = Math.max(0, Math.round(result.mileage_reading));
    if (result.mileage_reading > 999999) result.mileage_reading = null;
  }

  // ── Displacement validation ──
  if (result.displacement_cc != null) {
    result.displacement_cc = clampNumber(result.displacement_cc, 500, 16000, null);
  }

  // ── Year validation ──
  if (result.year != null) {
    if (result.year < 1970 || result.year > new Date().getFullYear() + 1) {
      result.year = null;
    }
  }

  // ── Price validation ──
  if (result.start_price_jpy != null) {
    result.start_price_jpy = Math.max(0, Math.round(result.start_price_jpy));
    if (result.start_price_jpy > 500000000) result.start_price_jpy = null;
  }
  if (result.sold_price_jpy != null) {
    result.sold_price_jpy = Math.max(0, Math.round(result.sold_price_jpy));
    if (result.sold_price_jpy > 500000000) result.sold_price_jpy = null;
  }

  // ── Confidence ──
  result.confidence = clampNumber(result.confidence, 0, 1, 0.5);

  // ── Ensure arrays ──
  result.mechanical_notes = Array.isArray(result.mechanical_notes) ? result.mechanical_notes : [];
  result.modification_notes = Array.isArray(result.modification_notes) ? result.modification_notes : [];
  result.equipment_notes = Array.isArray(result.equipment_notes) ? result.equipment_notes : [];
  result.sales_points = Array.isArray(result.sales_points) ? result.sales_points : [];
  result.caution_notes = Array.isArray(result.caution_notes) ? result.caution_notes : [];
  result.inspector_notes = Array.isArray(result.inspector_notes) ? result.inspector_notes : [];

  // ── Damage codes validation ──
  if (Array.isArray(result.damage_codes)) {
    result.damage_codes = result.damage_codes.map((d) => {
      if (!d || typeof d !== "object") return null;
      return {
        location: d.location || d.panel || "unknown",
        code: d.code || "?",
        meaning: d.meaning || d.code || "Unknown damage",
        severity: VALID_SEVERITIES.includes(d.severity) ? d.severity : "MODERATE",
        category: d.category || "unknown",
        tuvRelevant: !!d.tuvRelevant,
        structural: !!d.structural || !!d.is_structural,
      };
    }).filter(Boolean);
  } else {
    result.damage_codes = [];
  }

  // ── Validate enriched fields (from multi-pass) ──
  if (result._damage_severity_score != null) {
    result._damage_severity_score = clampNumber(result._damage_severity_score, 0, 10, 0);
  }
  if (result._damage_distribution && !VALID_DAMAGE_DISTRIBUTIONS.includes(result._damage_distribution)) {
    result._damage_distribution = null;
  }
  if (result._repair_cost_category && !VALID_REPAIR_COST_CATEGORIES.includes(result._repair_cost_category)) {
    result._repair_cost_category = null;
  }
  if (result._field_confidence && typeof result._field_confidence === "object") {
    for (const key of Object.keys(result._field_confidence)) {
      result._field_confidence[key] = clampNumber(result._field_confidence[key], 0, 1, 0.5);
    }
  }
  if (result._anomalies && !Array.isArray(result._anomalies)) {
    result._anomalies = [];
  }

  // ── Ensure backward-compatible fields exist ──
  if (result.panel_conditions && typeof result.panel_conditions !== "object") {
    result.panel_conditions = null;
  }
  if (result.accident_indicator === undefined) {
    result.accident_indicator = result.accident_history ?? null;
  }
  if (!result.service_history_indicator) {
    result.service_history_indicator = null;
  }
  if (!result.overall_assessment) {
    result.overall_assessment = null;
  }

  return result;
}

/**
 * Validate extraction output for the upload/extract-data flow.
 * Ensures extracted fields are properly typed and identifies missing data.
 */
export function validateExtractionOutput(result) {
  if (!result || typeof result !== "object") return null;

  const extracted = result.extracted || {};

  // Type-coerce known fields
  if (extracted.year != null) {
    extracted.year = parseInt(extracted.year);
    if (isNaN(extracted.year) || extracted.year < 1970 || extracted.year > new Date().getFullYear() + 1) {
      extracted.year = null;
    }
  }
  if (extracted.mileageKm != null) {
    extracted.mileageKm = parseInt(extracted.mileageKm);
    if (isNaN(extracted.mileageKm) || extracted.mileageKm < 0 || extracted.mileageKm > 999999) {
      extracted.mileageKm = null;
    }
  }
  if (extracted.askingPriceJpy != null) {
    extracted.askingPriceJpy = parseInt(extracted.askingPriceJpy);
    if (isNaN(extracted.askingPriceJpy) || extracted.askingPriceJpy <= 0) {
      extracted.askingPriceJpy = null;
    }
  }
  if (extracted.auctionGrade != null) {
    const g = String(extracted.auctionGrade).toUpperCase();
    extracted.auctionGrade = g === "S" ? 6 : (parseFloat(g) || null);
  }
  if (extracted.accidentHistory != null) {
    extracted.accidentHistory = !!extracted.accidentHistory;
  }

  // Normalize drive side
  if (extracted.driveSide && !VALID_DRIVE_SIDES.includes(extracted.driveSide)) {
    extracted.driveSide = null;
  }

  // Normalize transmission
  if (extracted.transmission && !VALID_TRANSMISSIONS.includes(extracted.transmission)) {
    extracted.transmission = null;
  }

  // Normalize fuel type
  if (extracted.fuelType && !VALID_FUEL_TYPES.includes(extracted.fuelType)) {
    extracted.fuelType = null;
  }

  // Identify missing required fields
  const requiredFields = [
    { key: "make", label: "Vehicle brand/make", question: "What is the vehicle brand? (e.g. Ferrari, Porsche, Mercedes-Benz)" },
    { key: "model", label: "Model name", question: "What is the exact model name? (e.g. 488 GTB, 911 Turbo S, SL550)" },
    { key: "year", label: "Year of manufacture", question: "What year was the vehicle manufactured?" },
    { key: "mileageKm", label: "Mileage in km", question: "What is the current mileage in kilometers?" },
    { key: "driveSide", label: "Drive side", question: "Is the vehicle LHD (left-hand drive) or RHD (right-hand drive)?" },
    { key: "askingPriceJpy", label: "Asking price in JPY", question: "What is the asking price in Japanese Yen (JPY)?" },
    { key: "exteriorColor", label: "Exterior color", question: "What is the exterior color of the vehicle?" },
  ];

  const optionalFields = [
    { key: "interiorColor", label: "Interior color", question: "What is the interior color/material?" },
    { key: "transmission", label: "Transmission type", question: "What transmission does it have? (Automatic, Manual, DCT, PDK, SMG)" },
    { key: "fuelType", label: "Fuel type", question: "What fuel type? (Petrol, Diesel, Hybrid, Electric)" },
    { key: "auctionGrade", label: "Auction grade", question: "What is the auction inspection grade? (e.g. 3.5, 4, 4.5, 5)" },
    { key: "accidentHistory", label: "Accident history", question: "Does the vehicle have any accident/repair history?" },
    { key: "specificationNotes", label: "Notable specifications", question: "Any notable specifications or options? (e.g. carbon brakes, sport exhaust, special edition)" },
  ];

  const missingRequired = requiredFields.filter((f) => !extracted[f.key] && extracted[f.key] !== false && extracted[f.key] !== 0);
  const missingOptional = optionalFields.filter((f) => !extracted[f.key] && extracted[f.key] !== false && extracted[f.key] !== 0);

  return {
    extracted,
    summary: result.summary || null,
    missingRequired,
    missingOptional,
    complete: missingRequired.length === 0,
  };
}

/**
 * Remove statistical outliers from price array using IQR method.
 */
export function removeOutliers(prices) {
  if (prices.length < 4) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter((p) => p >= lower && p <= upper);
}

// ── Helpers ──

function clampNumber(val, min, max, fallback) {
  if (val == null || typeof val !== "number" || isNaN(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function scoreToLevel(score) {
  if (score <= 2) return "LOW";
  if (score <= 3.5) return "MEDIUM";
  return "HIGH";
}
