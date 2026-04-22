// ISO 3779 VIN check-digit validator. Every legally-issued VIN worldwide
// (post-1981) encodes a check digit at position 9 that must equal a
// weighted sum mod 11 over the other 16 characters. If the read fails
// the check digit, it's *provably wrong* — no Vision model can talk
// around the math. That makes it one of the cheapest ways to convert a
// silent failure into a loud one.
//
// References:
//   - ISO 3779:2009 (vehicle identification number structure)
//   - NHTSA 49 CFR 565 (US implementation of the same rules)

// VIN character → numeric value. I, O, Q are invalid by spec
// (visually confusable with 1, 0, 0). A-H map 1..8, then J-N map 1..5,
// P=7, R=9, S-Z map 2..9.
const TRANSLITERATION = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
};

// Position-by-position weights. Position 9 (the check digit itself)
// has weight 0 — it doesn't contribute to its own computation.
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// World Manufacturer Identifier (WMI) prefixes we expect to see for
// brands our valuation agent handles. Used as a sanity check against
// the sheet-extracted make — if the VIN's first 3 chars don't match
// the claimed manufacturer, something's off.
export const WMI_TO_MAKE = {
  WDB: "Mercedes-Benz", WDC: "Mercedes-Benz", WDD: "Mercedes-Benz", WDF: "Mercedes-Benz",
  "4JG": "Mercedes-Benz",
  WP0: "Porsche", WP1: "Porsche",
  ZFF: "Ferrari",
  ZHW: "Lamborghini",
  SCB: "Bentley",
  SCF: "Aston Martin",
  SCA: "Rolls-Royce",
  WBS: "BMW M", WBA: "BMW", WBY: "BMW",
  "5UM": "BMW M",
  WAU: "Audi", WA1: "Audi",
  SAJ: "Jaguar",
  SAL: "Land Rover",
  ZAM: "Maserati",
  SBM: "McLaren",
  SCC: "Lotus",
  VF9: "Bugatti",
  ZAR: "Alfa Romeo",
};

/**
 * Validate a VIN against ISO 3779.
 *
 * Returns { valid, reason, checkDigit, expected, wmi } — always an
 * object so callers can distinguish "definitely wrong" (valid=false,
 * reason set) from "definitely right" (valid=true).
 */
export function validateVin(rawVin) {
  if (!rawVin || typeof rawVin !== "string") {
    return { valid: false, reason: "VIN is empty or not a string" };
  }
  const vin = rawVin.trim().toUpperCase();

  if (vin.length !== 17) {
    return { valid: false, reason: `VIN length is ${vin.length}, expected 17`, vin };
  }
  if (/[IOQ]/.test(vin)) {
    return { valid: false, reason: "VIN contains forbidden character (I, O, or Q)", vin };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const val = TRANSLITERATION[c];
    if (val === undefined) {
      return { valid: false, reason: `invalid VIN character "${c}" at position ${i + 1}`, vin };
    }
    sum += val * WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  const checkDigit = vin[8];

  if (checkDigit !== expected) {
    return {
      valid: false,
      reason: `check digit mismatch: VIN has "${checkDigit}" at position 9, ISO 3779 says "${expected}"`,
      checkDigit,
      expected,
      vin,
      wmi: vin.slice(0, 3),
    };
  }

  return { valid: true, checkDigit, expected, vin, wmi: vin.slice(0, 3) };
}

/**
 * Given a validated VIN, look up the likely manufacturer from the WMI.
 * Returns null when the WMI isn't in our table — not an error, just
 * means we can't cross-check this one brand-side.
 */
export function makeFromWmi(vin) {
  if (!vin || vin.length < 3) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  return WMI_TO_MAKE[wmi] || null;
}

/**
 * VIN encodes the model year at position 10. 1980-2000 use letters
 * (A-Y skipping I, O, Q, U, Z), 2001-2009 use digits 1-9, 2010 onward
 * restart the A-Y cycle. The mapping repeats every 30 years, so the
 * letter alone is ambiguous between (e.g.) 1983 and 2013 — callers
 * should cross-reference with the sheet-extracted year to disambiguate.
 */
const YEAR_CODE = "ABCDEFGHJKLMNPRSTVWXY123456789";
export function yearFromVin(vin, hintYear = null) {
  if (!vin || vin.length < 10) return null;
  const code = vin[9].toUpperCase();
  const idx = YEAR_CODE.indexOf(code);
  if (idx < 0) return null;
  // Two candidates: 1980 + idx and 2010 + idx.
  const a = 1980 + idx;
  const b = 2010 + idx;
  if (hintYear == null) return [a, b];
  return Math.abs(hintYear - a) <= Math.abs(hintYear - b) ? a : b;
}
