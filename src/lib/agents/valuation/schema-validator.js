/**
 * Schema validator for extracted auction sheet data.
 *
 * Validates fields against strict type/enum constraints, range checks,
 * format rules, and cross-field sanity invariants. Catches garbage values
 * that passed through the LLM and either fixes them (minor issues) or
 * nulls them (invalid values).
 *
 * Handles both camelCase (extractVehicleData output) and snake_case
 * (parseAuctionSheet output) field names transparently.
 */

const CURRENT_YEAR = new Date().getFullYear();

// ── Strict enums ────────────────────────────────────────────

const STRICT_ENUMS = {
  transmission: ["AUTOMATIC", "MANUAL", "DCT", "PDK", "SMG"],
  fuelType: ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "CNG"],
  fuel_type: ["PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "CNG"],
  driveSide: ["LHD", "RHD"],
  drive_side: ["LHD", "RHD"],
  drivetrain: ["2WD", "4WD", "AWD", "FF", "FR", "MR", "RR"],
  interiorGrade: ["A", "B", "C", "D"],
  interior_grade: ["A", "B", "C", "D"],
  interiorAuxGrade: ["A", "B", "C", "D"],
  interior_aux_grade: ["A", "B", "C", "D"],
  mileageUnit: ["km", "miles"],
  mileage_unit: ["km", "miles"],
};

// ── VIN WMI-to-make mapping for cross-field checks ──────────

const WMI_MAKE_MAP = {
  WDB: "Mercedes", WDC: "Mercedes", WDD: "Mercedes", WDF: "Mercedes",
  WP0: "Porsche", WP1: "Porsche",
  ZFF: "Ferrari",
};

// ── Helpers ─────────────────────────────────────────────────

/**
 * Read a field from data, checking both camelCase and snake_case variants.
 * Returns { value, key } where key is the actual key found in data.
 */
function getField(data, camelKey, snakeKey) {
  if (data[camelKey] !== undefined) return { value: data[camelKey], key: camelKey };
  if (snakeKey && data[snakeKey] !== undefined) return { value: data[snakeKey], key: snakeKey };
  return { value: undefined, key: null };
}

function hasJapaneseCJK(str) {
  // Hiragana, Katakana, CJK Unified Ideographs
  return /[぀-ゟ゠-ヿ一-鿿]/.test(str);
}

// ── Core validation ────────────────────────────────────────

/**
 * Validate extracted auction sheet data against strict type/enum
 * constraints, range checks, format rules, and cross-field invariants.
 *
 * @param {object} data - Extracted data (camelCase or snake_case keys)
 * @returns {{ validated: object, violations: string[], fieldConfidence: object }}
 */
export function validateExtractedSchema(data) {
  if (!data || typeof data !== "object") {
    return { validated: {}, violations: ["Input is null or not an object"], fieldConfidence: {} };
  }

  const validated = { ...data };
  const violations = [];
  const fieldConfidence = {};

  // ── 1. Strict enum validation ──

  validateStrictEnums(validated, violations, fieldConfidence);

  // ── 2. Range checks ──

  validateRanges(validated, violations, fieldConfidence);

  // ── 3. Format checks ──

  validateFormats(validated, violations, fieldConfidence);

  // ── 4. Cross-field sanity checks ──

  validateCrossField(validated, violations, fieldConfidence);

  // ── Assign default confidence for fields not yet scored ──

  assignDefaultConfidence(validated, fieldConfidence);

  return { validated, violations, fieldConfidence };
}

// ── Strict Enum Validation ─────────────────────────────────

function validateStrictEnums(data, violations, confidence) {
  for (const [field, allowed] of Object.entries(STRICT_ENUMS)) {
    if (data[field] === undefined || data[field] === null || data[field] === "") continue;

    const raw = String(data[field]).trim().toUpperCase();

    // Check if the uppercased value matches any allowed value (case-insensitive)
    const match = allowed.find((a) => a.toUpperCase() === raw);
    if (match) {
      data[field] = match;
      confidence[field] = "high";
    } else {
      violations.push(`${field}: "${data[field]}" is not a valid enum value (expected: ${allowed.join(" | ")})`);
      data[field] = null;
      confidence[field] = "low";
    }
  }
}

// ── Range Validation ───────────────────────────────────────

function validateRanges(data, violations, confidence) {
  // year
  const year = getField(data, "year", "year");
  if (year.value != null && year.key) {
    const y = parseInt(year.value);
    if (isNaN(y) || y < 1970 || y > CURRENT_YEAR + 1) {
      violations.push(`${year.key}: ${year.value} is outside valid range (1970-${CURRENT_YEAR + 1})`);
      data[year.key] = null;
      confidence[year.key] = "low";
    } else {
      data[year.key] = y;
      if (!confidence[year.key]) confidence[year.key] = "high";
    }
  }

  // mileageKm / mileage_reading
  for (const [camel, snake] of [["mileageKm", "mileage_km"], ["mileage_reading", "mileage_reading"]]) {
    const f = getField(data, camel, snake);
    if (f.value != null && f.key) {
      const v = parseInt(f.value);
      if (isNaN(v) || v < 0 || v > 999999) {
        violations.push(`${f.key}: ${f.value} is outside valid range (0-999,999)`);
        data[f.key] = null;
        confidence[f.key] = "low";
      } else {
        data[f.key] = v;
        if (!confidence[f.key]) confidence[f.key] = "high";
      }
    }
  }

  // overallGrade / auctionGrade / overall_grade
  for (const [camel, snake] of [["overallGrade", "overall_grade"], ["auctionGrade", "auction_grade"]]) {
    const f = getField(data, camel, snake);
    if (f.value != null && f.key) {
      const raw = String(f.value).trim().toUpperCase();

      // S = 6.5
      if (raw === "S") {
        data[f.key] = 6.5;
        if (!confidence[f.key]) confidence[f.key] = "high";
        continue;
      }

      // R, RA, or Japanese "invalid" marker = null
      if (raw === "R" || raw === "RA" || raw === "無効") {
        data[f.key] = null;
        if (!confidence[f.key]) confidence[f.key] = "high";
        continue;
      }

      const g = parseFloat(raw);
      if (isNaN(g) || g < 1.0 || g > 6.5) {
        violations.push(`${f.key}: ${f.value} is outside valid range (1.0-6.5)`);
        data[f.key] = null;
        confidence[f.key] = "low";
      } else {
        data[f.key] = g;
        if (!confidence[f.key]) confidence[f.key] = "high";
      }
    }
  }

  // displacementCc / displacement_cc
  const disp = getField(data, "displacementCc", "displacement_cc");
  if (disp.value != null && disp.key) {
    const v = parseInt(disp.value);
    if (isNaN(v) || v < 500 || v > 16000) {
      violations.push(`${disp.key}: ${disp.value} is outside valid range (500-16,000 cc)`);
      data[disp.key] = null;
      confidence[disp.key] = "low";
    } else {
      data[disp.key] = v;
      if (!confidence[disp.key]) confidence[disp.key] = "high";
    }
  }

  // recyclingDepositJpy / recycling_deposit_jpy
  const recyc = getField(data, "recyclingDepositJpy", "recycling_deposit_jpy");
  if (recyc.value != null && recyc.key) {
    const v = parseInt(String(recyc.value).replace(/[,\s¥]/g, ""));
    if (isNaN(v) || v < 5000 || v > 60000) {
      violations.push(`${recyc.key}: ${recyc.value} is outside valid range (5,000-60,000 JPY)`);
      data[recyc.key] = null;
      confidence[recyc.key] = "low";
    } else {
      data[recyc.key] = v;
      if (!confidence[recyc.key]) confidence[recyc.key] = "high";
    }
  }

  // seatingCapacity / seating_capacity
  const seat = getField(data, "seatingCapacity", "seating_capacity");
  if (seat.value != null && seat.key) {
    const v = parseInt(seat.value);
    if (isNaN(v) || v < 1 || v > 10) {
      violations.push(`${seat.key}: ${seat.value} is outside valid range (1-10)`);
      data[seat.key] = null;
      confidence[seat.key] = "low";
    } else {
      data[seat.key] = v;
      if (!confidence[seat.key]) confidence[seat.key] = "high";
    }
  }

  // doorCount / door_count
  const door = getField(data, "doorCount", "door_count");
  if (door.value != null && door.key) {
    const v = parseInt(door.value);
    if (isNaN(v) || v < 1 || v > 6) {
      violations.push(`${door.key}: ${door.value} is outside valid range (1-6)`);
      data[door.key] = null;
      confidence[door.key] = "low";
    } else {
      data[door.key] = v;
      if (!confidence[door.key]) confidence[door.key] = "high";
    }
  }
}

// ── Format Validation ──────────────────────────────────────

function validateFormats(data, violations, confidence) {
  // VIN: exactly 17 characters, A-H J-N P R-Z 0-9 only
  const vin = getField(data, "vin", "vin");
  if (vin.value != null && vin.key) {
    const cleaned = String(vin.value).trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (cleaned.length !== 17) {
      violations.push(`${vin.key}: VIN "${vin.value}" is not exactly 17 valid characters (got ${cleaned.length})`);
      data[vin.key] = null;
      confidence[vin.key] = "low";
    } else {
      data[vin.key] = cleaned;
      // Check if we had to clean characters (minor issue)
      if (cleaned !== String(vin.value).trim().toUpperCase()) {
        confidence[vin.key] = "medium";
      } else {
        if (!confidence[vin.key]) confidence[vin.key] = "high";
      }
    }
  }

  // registrationPlate / registration_plate: must contain at least one CJK char
  const regPlate = getField(data, "registrationPlate", "registration_plate");
  if (regPlate.value != null && regPlate.key) {
    const s = String(regPlate.value).trim();
    if (s.length === 0) {
      data[regPlate.key] = null;
      confidence[regPlate.key] = "low";
    } else if (!hasJapaneseCJK(s) || /^W[A-Z0-9]{16}$/i.test(s.replace(/\s/g, "")) || s.replace(/[^A-Za-z0-9]/g, "").length === 17) {
      violations.push(`${regPlate.key}: "${s}" rejected — no Japanese characters or looks like a VIN`);
      data[regPlate.key] = null;
      confidence[regPlate.key] = "low";
    } else {
      if (!confidence[regPlate.key]) confidence[regPlate.key] = "high";
    }
  }

  // shakenExpiry / shaken_expiry: YYYY-MM or YYYY-MM-DD format
  const shaken = getField(data, "shakenExpiry", "shaken_expiry");
  if (shaken.value != null && shaken.key) {
    const s = String(shaken.value).trim();
    const dateMatch = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (dateMatch) {
      const shakenYear = parseInt(dateMatch[1]);
      if (shakenYear < CURRENT_YEAR - 1) {
        violations.push(`${shaken.key}: year ${shakenYear} is before ${CURRENT_YEAR - 1}`);
        confidence[shaken.key] = "medium";
      } else {
        if (!confidence[shaken.key]) confidence[shaken.key] = "high";
      }
    } else {
      // Try to salvage common formats
      const salvaged = salvageShakenFormat(s);
      if (salvaged) {
        data[shaken.key] = salvaged;
        confidence[shaken.key] = "medium";
      } else {
        violations.push(`${shaken.key}: "${s}" does not match YYYY-MM or YYYY-MM-DD format`);
        data[shaken.key] = null;
        confidence[shaken.key] = "low";
      }
    }
  }

  // colorCode / color_code: 1-5 alphanumeric characters
  const colorCode = getField(data, "colorCode", "color_code");
  if (colorCode.value != null && colorCode.key) {
    const s = String(colorCode.value).trim().toUpperCase();
    if (!/^[A-Z0-9]{1,5}$/.test(s)) {
      violations.push(`${colorCode.key}: "${colorCode.value}" is not 1-5 alphanumeric characters (may be a model number)`);
      data[colorCode.key] = null;
      confidence[colorCode.key] = "low";
    } else {
      data[colorCode.key] = s;
      if (!confidence[colorCode.key]) confidence[colorCode.key] = "high";
    }
  }

  // lotNumber / lot_number: string of digits, typically 4-6 characters
  const lot = getField(data, "lotNumber", "lot_number");
  if (lot.value != null && lot.key) {
    const s = String(lot.value).trim();
    if (!/^\d+$/.test(s)) {
      violations.push(`${lot.key}: "${s}" is not a numeric string`);
      data[lot.key] = null;
      confidence[lot.key] = "low";
    } else if (s.length < 4 || s.length > 6) {
      // Still valid digits but atypical length
      confidence[lot.key] = "medium";
    } else {
      data[lot.key] = s;
      if (!confidence[lot.key]) confidence[lot.key] = "high";
    }
  }

  // modelCode / model_code: should contain a dash, 5-15 chars (CBA-190378 pattern)
  const modelCode = getField(data, "modelCode", "model_code");
  if (modelCode.value != null && modelCode.key) {
    const s = String(modelCode.value).trim();
    if (s.length < 5 || s.length > 15) {
      violations.push(`${modelCode.key}: "${s}" length ${s.length} is outside expected range (5-15 chars)`);
      data[modelCode.key] = null;
      confidence[modelCode.key] = "low";
    } else if (!s.includes("-")) {
      // No dash — still possibly valid but flag as medium confidence
      confidence[modelCode.key] = "medium";
    } else {
      if (!confidence[modelCode.key]) confidence[modelCode.key] = "high";
    }
  }
}

/**
 * Attempt to salvage non-standard shaken expiry formats into YYYY-MM or YYYY-MM-DD.
 */
function salvageShakenFormat(s) {
  // "2025/09", "2025.9", "2025-9"
  const m1 = s.match(/^(\d{4})[\/\.\-年](\d{1,2})(?:[\/\.\-月](\d{1,2}))?/);
  if (m1) {
    const month = String(m1[2]).padStart(2, "0");
    if (m1[3]) {
      const day = String(m1[3]).padStart(2, "0");
      return `${m1[1]}-${month}-${day}`;
    }
    return `${m1[1]}-${month}`;
  }

  // Japanese era: "R7-9", "H30/5"
  const m2 = s.match(/^([RH])(\d+)[\/\.\-年](\d{1,2})(?:[\/\.\-月](\d{1,2}))?/i);
  if (m2) {
    const letter = m2[1].toUpperCase();
    const base = letter === "R" ? 2018 : letter === "H" ? 1988 : null;
    if (base) {
      const yr = base + parseInt(m2[2]);
      const month = String(m2[3]).padStart(2, "0");
      if (m2[4]) {
        const day = String(m2[4]).padStart(2, "0");
        return `${yr}-${month}-${day}`;
      }
      return `${yr}-${month}`;
    }
  }

  return null;
}

// ── Cross-Field Sanity ─────────────────────────────────────

function validateCrossField(data, violations, confidence) {
  // shakenExpiry year must be >= year
  const shakenKey = data.shakenExpiry !== undefined ? "shakenExpiry"
    : data.shaken_expiry !== undefined ? "shaken_expiry" : null;
  const yearKey = data.year !== undefined ? "year" : null;

  if (shakenKey && yearKey && data[shakenKey] && data[yearKey]) {
    const shakenStr = String(data[shakenKey]);
    const shakenYearMatch = shakenStr.match(/^(\d{4})/);
    if (shakenYearMatch) {
      const shakenYear = parseInt(shakenYearMatch[1]);
      const vehicleYear = parseInt(data[yearKey]);
      if (!isNaN(shakenYear) && !isNaN(vehicleYear) && shakenYear < vehicleYear) {
        violations.push(`Cross-field: shakenExpiry year (${shakenYear}) is before vehicle year (${vehicleYear})`);
        confidence[shakenKey] = "low";
        if (!confidence[yearKey] || confidence[yearKey] === "high") confidence[yearKey] = "medium";
      }
    }
  }

  // Mileage per year sanity: flag if > 50,000 km/year
  const mileageKey = data.mileageKm !== undefined ? "mileageKm"
    : data.mileage_reading !== undefined ? "mileage_reading"
    : data.mileage_km !== undefined ? "mileage_km" : null;

  if (mileageKey && yearKey && data[mileageKey] != null && data[yearKey] != null) {
    const mileage = parseInt(data[mileageKey]);
    const year = parseInt(data[yearKey]);
    if (!isNaN(mileage) && !isNaN(year) && year < CURRENT_YEAR) {
      const age = Math.max(0.5, CURRENT_YEAR - year);
      const kmPerYear = mileage / age;
      if (kmPerYear > 50000) {
        violations.push(
          `Cross-field: ${Math.round(kmPerYear).toLocaleString()} km/year is unusually high ` +
          `(${mileage.toLocaleString()} km over ${age.toFixed(1)} years)`
        );
        if (!confidence[mileageKey] || confidence[mileageKey] === "high") confidence[mileageKey] = "medium";
        if (!confidence[yearKey] || confidence[yearKey] === "high") confidence[yearKey] = "medium";
      }
    }
  }

  // VIN WMI vs make cross-check
  const vinKey = data.vin !== undefined ? "vin" : null;
  const makeKey = data.make !== undefined ? "make" : null;

  if (vinKey && makeKey && data[vinKey] && data[makeKey]) {
    const vin = String(data[vinKey]).toUpperCase();
    const make = String(data[makeKey]).toLowerCase();

    if (vin.length >= 3) {
      const wmi = vin.slice(0, 3);
      const expectedMake = WMI_MAKE_MAP[wmi];

      if (expectedMake) {
        const expectedLower = expectedMake.toLowerCase();
        const matches = make.includes(expectedLower) ||
          (expectedLower === "mercedes" && make.includes("mercedes")) ||
          (expectedLower === "porsche" && make.includes("porsche")) ||
          (expectedLower === "ferrari" && make.includes("ferrari"));

        if (!matches) {
          violations.push(
            `Cross-field: VIN prefix "${wmi}" indicates ${expectedMake}, but make is "${data[makeKey]}"`
          );
          confidence[makeKey] = "low";
          if (!confidence[vinKey] || confidence[vinKey] === "high") confidence[vinKey] = "medium";
        }
      }
    }
  }
}

// ── Default Confidence ─────────────────────────────────────

/**
 * Assign "high" confidence to any validated field that was not already
 * scored during validation (i.e., fields that passed implicitly).
 */
function assignDefaultConfidence(data, confidence) {
  // Fields we track confidence for
  const trackedFields = [
    "transmission", "fuelType", "fuel_type", "driveSide", "drive_side",
    "drivetrain", "interiorGrade", "interior_grade", "interiorAuxGrade",
    "interior_aux_grade", "mileageUnit", "mileage_unit",
    "year", "mileageKm", "mileage_km", "mileage_reading",
    "overallGrade", "overall_grade", "auctionGrade", "auction_grade",
    "displacementCc", "displacement_cc",
    "recyclingDepositJpy", "recycling_deposit_jpy",
    "seatingCapacity", "seating_capacity", "doorCount", "door_count",
    "vin", "registrationPlate", "registration_plate",
    "shakenExpiry", "shaken_expiry", "colorCode", "color_code",
    "lotNumber", "lot_number", "modelCode", "model_code",
    "make", "model",
  ];

  for (const field of trackedFields) {
    if (data[field] !== undefined && data[field] !== null && !confidence[field]) {
      confidence[field] = "high";
    }
  }
}
