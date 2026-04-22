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
  // Spec §2.1: asking_price_jpy is REQUIRED. We support an explicit opt-in
  // "guidance" mode where the caller asks the agent to derive a max bid
  // without specifying a price — set guidanceMode: true to enable.
  const hasPrice = input.askingPriceJpy != null && input.askingPriceJpy !== "";
  if (!hasPrice && !input.guidanceMode) {
    errors.push("askingPriceJpy is required (or pass guidanceMode: true to derive a max-bid ceiling)");
  }
  if (hasPrice && (input.askingPriceJpy <= 0 || input.askingPriceJpy > 500000000)) {
    errors.push("askingPriceJpy must be 1-500000000");
  }
  if (!input.exteriorColor || typeof input.exteriorColor !== "string") errors.push("exteriorColor is required");

  // Optional field sanitization
  // Spec §2.1: auction_grade float 1.0–6.0 (S = 6.5). The S grade is a discrete
  // top-tier mark from Japanese auctions; all other grades fall on the 1.0–6.0
  // continuous scale, typically in 0.5 increments.
  if (input.auctionGrade != null && input.auctionGrade !== "") {
    const g = parseFloat(input.auctionGrade);
    const inRange = g >= 1.0 && g <= 6.0;
    const isSGrade = g === 6.5;
    if (isNaN(g) || !(inRange || isSGrade)) {
      errors.push("auctionGrade must be a number in 1.0-6.0 (or 6.5 for S grade)");
    }
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
    askingPriceJpy: (input.askingPriceJpy != null && input.askingPriceJpy !== "") ? parseInt(input.askingPriceJpy) : null,
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
  if (result.interior_aux_grade && !VALID_INTERIOR_GRADES.includes(result.interior_aux_grade)) {
    result.interior_aux_grade = null;
  }

  // ── Shaken (車検) expiry: normalize to YYYY-MM ──
  if (result.shaken_expiry != null) {
    const s = String(result.shaken_expiry).trim();
    if (!/^\d{4}-\d{2}$/.test(s)) {
      // Try to salvage common formats: "R7-9", "令和7年9月", "2025/09", "2025.9"
      const m = s.match(/(\d{4})[\/\.\-年](\d{1,2})/) || s.match(/^([RH])(\d+)[\/\.\-年](\d{1,2})/);
      if (m) {
        if (/^\d{4}$/.test(m[1])) {
          result.shaken_expiry = `${m[1]}-${String(m[2]).padStart(2, "0")}`;
        } else {
          const base = m[1] === "R" ? 2018 : m[1] === "H" ? 1988 : null;
          if (base) result.shaken_expiry = `${base + parseInt(m[2])}-${String(m[3]).padStart(2, "0")}`;
          else result.shaken_expiry = null;
        }
      } else {
        result.shaken_expiry = null;
      }
    }
  }

  // ── Registration plate: trim, null if empty ──
  if (result.registration_plate != null) {
    const p = String(result.registration_plate).trim();
    result.registration_plate = p.length > 0 ? p : null;
  }

  // ── Dimensions: numeric, plausible range (1000–6500 mm) ──
  if (result.dimensions && typeof result.dimensions === "object") {
    for (const k of ["length_mm", "width_mm", "height_mm"]) {
      const v = result.dimensions[k];
      if (v == null) continue;
      const n = parseInt(v);
      result.dimensions[k] = (!isNaN(n) && n >= 1000 && n <= 6500) ? n : null;
    }
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

  // VIN: must be exactly 17 chars using A–H, J–N, P, R–Z, 0–9.
  // Shorter values are almost always 型式 (model code) misread as chassis.
  if (extracted.vin != null) {
    const v = String(extracted.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    extracted.vin = v.length === 17 ? v : null;
  }

  // Grade/edition: trim whitespace; null if empty
  if (extracted.grade != null) {
    const s = String(extracted.grade).trim();
    extracted.grade = s.length > 0 ? s : null;
  }

  // Model code (型式): trim; null if empty
  if (extracted.modelCode != null) {
    const s = String(extracted.modelCode).trim();
    extracted.modelCode = s.length > 0 ? s : null;
  }

  // Lot number: trim; coerce to string (some sheets print numeric)
  if (extracted.lotNumber != null) {
    const s = String(extracted.lotNumber).trim();
    extracted.lotNumber = s.length > 0 ? s : null;
  }

  // Auction house: trim + uppercase
  if (extracted.auctionHouse != null) {
    const s = String(extracted.auctionHouse).trim();
    extracted.auctionHouse = s.length > 0 ? s : null;
  }

  // Drivetrain: normalize 2WD / 4WD / AWD
  if (extracted.drivetrain != null) {
    const s = String(extracted.drivetrain).toUpperCase().replace(/\s+/g, "");
    extracted.drivetrain = ["2WD", "4WD", "AWD", "FWD", "RWD"].includes(s) ? s : null;
  }

  // Body type: trim + lowercase
  if (extracted.bodyType != null) {
    const s = String(extracted.bodyType).trim();
    extracted.bodyType = s.length > 0 ? s : null;
  }

  // Door count / seating capacity: coerce to integer in plausible range
  if (extracted.doorCount != null) {
    const n = parseInt(extracted.doorCount);
    extracted.doorCount = (!isNaN(n) && n >= 1 && n <= 6) ? n : null;
  }
  if (extracted.seatingCapacity != null) {
    const n = parseInt(extracted.seatingCapacity);
    extracted.seatingCapacity = (!isNaN(n) && n >= 1 && n <= 10) ? n : null;
  }

  // Import type: pass through string (Dealer / Individual / Auction / etc.)
  if (extracted.importType != null) {
    const s = String(extracted.importType).trim();
    extracted.importType = s.length > 0 ? s : null;
  }

  // Recycling deposit: coerce to integer JPY
  if (extracted.recyclingDepositJpy != null) {
    const n = parseInt(String(extracted.recyclingDepositJpy).replace(/[,\s¥]/g, ""));
    extracted.recyclingDepositJpy = (!isNaN(n) && n >= 0 && n < 1_000_000) ? n : null;
  }

  // Color code: uppercase alphanumeric (2–5 chars)
  if (extracted.colorCode != null) {
    const s = String(extracted.colorCode).trim().toUpperCase();
    extracted.colorCode = /^[A-Z0-9]{1,5}$/.test(s) ? s : null;
  }

  // Interior grades: A / B / C / D
  const VALID_INT_GRADES = ["A", "B", "C", "D"];
  if (extracted.interiorGrade != null) {
    const s = String(extracted.interiorGrade).trim().toUpperCase();
    extracted.interiorGrade = VALID_INT_GRADES.includes(s) ? s : null;
  }
  if (extracted.interiorAuxGrade != null) {
    const s = String(extracted.interiorAuxGrade).trim().toUpperCase();
    extracted.interiorAuxGrade = VALID_INT_GRADES.includes(s) ? s : null;
  }

  // colorChanged: boolean (tri-state null allowed)
  if (extracted.colorChanged != null) {
    extracted.colorChanged = !!extracted.colorChanged;
  }

  // shakenExpiry: YYYY-MM-DD or YYYY-MM. Accept both.
  if (extracted.shakenExpiry != null) {
    const s = String(extracted.shakenExpiry).trim();
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
      extracted.shakenExpiry = s;
    } else {
      // Salvage common formats: "R8/5/11", "令和8年5月11日", "2026/05/11"
      const m1 = s.match(/^(\d{4})[\/\.\-年](\d{1,2})(?:[\/\.\-月](\d{1,2}))?/);
      const m2 = s.match(/^([RH])(\d+)[\/\.\-年](\d{1,2})(?:[\/\.\-月](\d{1,2}))?/);
      if (m1) {
        extracted.shakenExpiry = m1[3]
          ? `${m1[1]}-${String(m1[2]).padStart(2, "0")}-${String(m1[3]).padStart(2, "0")}`
          : `${m1[1]}-${String(m1[2]).padStart(2, "0")}`;
      } else if (m2) {
        const base = m2[1] === "R" ? 2018 : 1988;
        const yr = base + parseInt(m2[2]);
        extracted.shakenExpiry = m2[4]
          ? `${yr}-${String(m2[3]).padStart(2, "0")}-${String(m2[4]).padStart(2, "0")}`
          : `${yr}-${String(m2[3]).padStart(2, "0")}`;
      } else {
        extracted.shakenExpiry = null;
      }
    }
  }

  // Array fields — ensure arrays; strip nulls and empty strings
  for (const key of ["featureCodes", "salesPoints", "modifications", "cautionNotes", "inspectorNotes"]) {
    if (extracted[key] == null) continue;
    if (!Array.isArray(extracted[key])) {
      extracted[key] = null;
    } else {
      extracted[key] = extracted[key].filter((s) => s != null && String(s).trim().length > 0).map((s) => String(s).trim());
      if (extracted[key].length === 0) extracted[key] = null;
    }
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

  // Field classification (spec-aware).
  //   origin = "sheet"     — typically printed on a Japanese inspection sheet
  //                          (USS/TAA/HAA/JU/CAA etc.). If missing, we retry
  //                          with a focused prompt before asking the user.
  //   origin = "external"  — NEVER on inspection sheets (the inspection sheet
  //                          is the condition report; the asking price and
  //                          buyer-side details come from elsewhere). Always
  //                          ask the user.
  //   origin = "either"    — some sheets have it, some don't. Retry; if the
  //                          retry comes back empty, ask.
  const requiredFields = [
    { key: "make", label: "Vehicle brand/make", origin: "sheet", question: "What is the vehicle brand? (e.g. Ferrari, Porsche, Mercedes-Benz)" },
    { key: "model", label: "Model name", origin: "sheet", question: "What is the exact model name? (e.g. 488 GTB, 911 Turbo S, SL550)" },
    { key: "year", label: "Year of manufacture", origin: "sheet", question: "What year was the vehicle manufactured?" },
    { key: "mileageKm", label: "Mileage in km", origin: "sheet", question: "What is the current mileage in kilometers?" },
    { key: "driveSide", label: "Drive side", origin: "sheet", question: "Is the vehicle LHD (left-hand drive) or RHD (right-hand drive)?" },
    { key: "askingPriceJpy", label: "Asking price in JPY", origin: "external", question: "What is the asking price in Japanese Yen (JPY)?" },
    { key: "exteriorColor", label: "Exterior color", origin: "sheet", question: "What is the exterior color of the vehicle?" },
  ];

  const optionalFields = [
    { key: "grade", label: "Grade / Edition", origin: "sheet", question: "What is the grade or edition? (e.g. S 130th Anniversary Edition, GT3 RS, Edition 1)" },
    { key: "modelCode", label: "Model code (型式)", origin: "sheet", question: "What is the Japanese model code? (e.g. CBA-190378)" },
    { key: "interiorColor", label: "Interior color", origin: "sheet", question: "What is the interior color/material?" },
    { key: "interiorGrade", label: "Interior grade (内装)", origin: "sheet", question: "What is the interior grade? (A/B/C/D)" },
    { key: "interiorAuxGrade", label: "Interior aux grade (内装補助評価)", origin: "either", question: "What is the interior auxiliary grade? (A/B/C/D)" },
    { key: "transmission", label: "Transmission type", origin: "sheet", question: "What transmission does it have? (Automatic, Manual, DCT, PDK, SMG)" },
    { key: "fuelType", label: "Fuel type", origin: "sheet", question: "What fuel type? (Petrol, Diesel, Hybrid, Electric)" },
    { key: "drivetrain", label: "Drivetrain (駆動)", origin: "sheet", question: "What drivetrain? (2WD / 4WD / AWD)" },
    { key: "bodyType", label: "Body type", origin: "either", question: "What body type? (coupe, sedan, SUV, etc.)" },
    { key: "doorCount", label: "Door count", origin: "sheet", question: "How many doors?" },
    { key: "seatingCapacity", label: "Seating capacity (乗車定員)", origin: "sheet", question: "How many seats?" },
    { key: "auctionGrade", label: "Auction grade", origin: "sheet", question: "What is the auction inspection grade? (e.g. 3.5, 4, 4.5, 5)" },
    { key: "accidentHistory", label: "Accident history", origin: "sheet", question: "Does the vehicle have any accident/repair history?" },
    { key: "importType", label: "Import type (輸入区分)", origin: "sheet", question: "How was it imported? (Dealer / Individual / Auction)" },
    { key: "vin", label: "Chassis / VIN (車台No)", origin: "sheet", question: "What is the 17-character chassis number / VIN?" },
    { key: "registrationPlate", label: "Registration plate (登録No)", origin: "sheet", question: "What is the Japanese registration plate?" },
    { key: "shakenExpiry", label: "Shaken expiry (車検)", origin: "sheet", question: "When does the shaken expire? (YYYY-MM or YYYY-MM-DD)" },
    { key: "lotNumber", label: "Lot number (出品番号)", origin: "sheet", question: "What is the auction lot number?" },
    { key: "auctionHouse", label: "Auction house (会場)", origin: "sheet", question: "Which auction house? (USS / TAA / JU / HAA etc.)" },
    { key: "recyclingDepositJpy", label: "Recycling deposit (リサイクル預託金)", origin: "sheet", question: "What is the recycling deposit in JPY?" },
    { key: "colorCode", label: "Color code (カラーNo.)", origin: "sheet", question: "What is the manufacturer color code?" },
    { key: "exteriorColorCatalog", label: "Color catalog name", origin: "either", question: "What is the manufacturer catalog name for the exterior color? (auto-filled from code lookup)" },
    { key: "colorChanged", label: "Color changed / repainted", origin: "sheet", question: "Has the vehicle been repainted? (indicated by 色替 or → arrow)" },
    { key: "specificationNotes", label: "Notable specifications", origin: "either", question: "Any notable specifications or options? (e.g. carbon brakes, sport exhaust, special edition)" },
  ];

  const isEmpty = (v) => v === null || v === undefined || v === "";
  const missingRequired = requiredFields.filter((f) => isEmpty(extracted[f.key]));
  const missingOptional = optionalFields.filter((f) => isEmpty(extracted[f.key]));

  // Split into sheet-derivable (retry target) vs external (always ask).
  // Downstream: extractVehicleData runs focused retries on sheet+either;
  // the UI shows two separate panels so the user knows which questions
  // are being asked because the sheet doesn't have them versus which ones
  // the agent couldn't read.
  const missingSheetFields = [...missingRequired, ...missingOptional].filter((f) => f.origin === "sheet" || f.origin === "either");
  const missingExternal = [...missingRequired, ...missingOptional].filter((f) => f.origin === "external");

  return {
    extracted,
    summary: result.summary || null,
    // Legacy shape — kept for backward compat with any consumer still using it.
    missingRequired,
    missingOptional,
    // New shape: origin-classified.
    missingSheetFields,   // candidates for focused-retry pass
    missingExternal,      // always ask the user
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
