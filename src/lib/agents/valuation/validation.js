/**
 * Input/output validation for the Valuation Agent.
 * Validates all data flowing through the pipeline to catch garbage early.
 */

const SUPPORTED_MAKES = ["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "Jaguar", "Maserati", "BMW M", "Range Rover"];
const VALID_DRIVE_SIDES = ["LHD", "RHD"];
const VALID_TRANSMISSIONS = ["MANUAL", "AUTOMATIC", "DCT", "PDK", "SMG", ""];
const VALID_FUEL_TYPES = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", ""];
const VALID_SERVICE_HISTORY = ["FULL_DEALER", "PARTIAL_DEALER", "INDEPENDENT", "UNKNOWN"];
const VALID_VERDICTS = ["BUY", "REVIEW", "PASS"];
const VALID_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const VALID_LIQUIDITY = ["HIGH", "MEDIUM", "LOW"];
const VALID_TRENDS = ["RISING", "STABLE", "DECLINING"];

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
 * Validate sheet parser output.
 */
export function validateSheetOutput(result) {
  if (!result || typeof result !== "object") return null;

  if (result.overall_grade != null) {
    result.overall_grade = clampNumber(result.overall_grade, 1, 6.5, null);
  }
  if (result.mileage_reading != null) {
    result.mileage_reading = Math.max(0, Math.round(result.mileage_reading));
    if (result.mileage_reading > 999999) result.mileage_reading = null;
  }
  result.confidence = clampNumber(result.confidence, 0, 1, 0.5);
  result.mechanical_notes = Array.isArray(result.mechanical_notes) ? result.mechanical_notes : [];
  result.modification_notes = Array.isArray(result.modification_notes) ? result.modification_notes : [];
  result.damage_codes = Array.isArray(result.damage_codes) ? result.damage_codes : [];
  result.equipment_notes = Array.isArray(result.equipment_notes) ? result.equipment_notes : [];

  return result;
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
