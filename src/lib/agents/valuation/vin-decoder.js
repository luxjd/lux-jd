// NHTSA's vPIC API is the only free, no-auth, no-quota VIN decoder
// available worldwide. It's US-centric (built for 49 CFR compliance)
// but the decoder itself understands any ISO 3779 VIN — the WMI and
// VDS fields are universal. For JP-market vehicles the Model and
// BodyClass may be partial but Make and ModelYear are almost always
// present because those come from the WMI + year-code lookup that
// NHTSA maintains for every registered manufacturer globally.
//
// Docs: https://vpic.nhtsa.dot.gov/api/
//
// Cache the response for the session — VIN → vehicle data is
// immutable so a 24h cache is fine. Failures return null (the
// caller treats "can't reach NHTSA" as "no external signal",
// not as "VIN is bad").

const NHTSA_ENDPOINT = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

// Our make taxonomy uses compound names (Mercedes-AMG, BMW M, Range Rover)
// while NHTSA returns the factory name (Mercedes-Benz, BMW, Land Rover).
// This mapping lets us say "match" when the VIN-decoded make is the
// manufacturer behind the performance sub-brand on the sheet.
const MAKE_ALIASES = {
  "mercedes-benz": ["mercedes-amg", "mercedes-benz"],
  "bmw": ["bmw", "bmw m"],
  "land rover": ["land rover", "range rover"],
};

/**
 * Decode a VIN via NHTSA. Returns:
 *   { make, model, year, manufacturer, bodyClass, engineL, source:"nhtsa" }
 * Or null on network / empty response.
 */
export async function decodeVinNhtsa(vin) {
  if (!vin || vin.length !== 17) return null;

  const cached = cache.get(vin);
  if (cached && Date.now() - cached.t < TTL_MS) return cached.v;

  try {
    const res = await fetch(`${NHTSA_ENDPOINT}/${encodeURIComponent(vin)}?format=json`, {
      // Small timeout — if NHTSA is slow we proceed without external signal.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.Results?.[0];
    if (!result) return null;

    // NHTSA returns ErrorCode "0" on clean decode, non-zero on partial
    // or failed. We accept partial reads (field-level `result.X` is
    // still useful) but surface the flag so callers can weight it.
    const errorCode = result.ErrorCode || "0";

    const decoded = {
      make: result.Make ? String(result.Make).trim() : null,
      model: result.Model ? String(result.Model).trim() : null,
      year: result.ModelYear ? parseInt(result.ModelYear, 10) : null,
      manufacturer: result.Manufacturer ? String(result.Manufacturer).trim() : null,
      bodyClass: result.BodyClass ? String(result.BodyClass).trim() : null,
      engineL: result.DisplacementL ? parseFloat(result.DisplacementL) : null,
      cylinders: result.EngineCylinders ? parseInt(result.EngineCylinders, 10) : null,
      fuelType: result.FuelTypePrimary ? String(result.FuelTypePrimary).trim() : null,
      errorCode,
      errorText: result.ErrorText ? String(result.ErrorText).trim() : null,
      source: "nhtsa",
    };
    cache.set(vin, { t: Date.now(), v: decoded });
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Compare NHTSA-decoded vehicle metadata against what the auction
 * sheet extractor produced. Returns an array of disagreements —
 * empty array = everything matches (high-confidence corroboration).
 *
 * Disagreements are the high-value signal. When NHTSA says "2015
 * Mercedes-Benz C-Class" and the sheet says "2017 Porsche 911",
 * something has gone very wrong with the extraction and we need to
 * stop trusting it.
 */
export function compareVinDecodeWithSheet(decoded, sheet) {
  if (!decoded || !sheet) return [];
  const out = [];

  // Year check — tolerant of ±1 because NHTSA sometimes returns the
  // registration year while the sheet shows the model year.
  if (decoded.year && sheet.year && Math.abs(decoded.year - sheet.year) > 1) {
    out.push({
      field: "year",
      severity: "HIGH",
      sheet: sheet.year,
      external: decoded.year,
      source: "nhtsa",
      message: `Year mismatch: sheet says ${sheet.year}, NHTSA-decoded VIN says ${decoded.year}`,
    });
  }

  // Make check — fuzzy match against the alias table.
  if (decoded.make && sheet.make) {
    const s = sheet.make.toLowerCase();
    const d = decoded.make.toLowerCase();
    const aliases = MAKE_ALIASES[d] || [d];
    const matches = aliases.includes(s) || s.startsWith(d) || d.startsWith(s);
    if (!matches) {
      out.push({
        field: "make",
        severity: "HIGH",
        sheet: sheet.make,
        external: decoded.make,
        source: "nhtsa",
        message: `Make mismatch: sheet says "${sheet.make}", NHTSA-decoded VIN says "${decoded.make}"`,
      });
    }
  }

  // Engine displacement check — if both say it, they should agree
  // to the nearest 0.1L.
  if (decoded.engineL && sheet.displacement_cc) {
    const sheetL = sheet.displacement_cc / 1000;
    if (Math.abs(decoded.engineL - sheetL) > 0.3) {
      out.push({
        field: "displacement",
        severity: "MEDIUM",
        sheet: `${sheetL.toFixed(1)}L`,
        external: `${decoded.engineL.toFixed(1)}L`,
        source: "nhtsa",
        message: `Displacement mismatch: sheet ${sheetL.toFixed(1)}L vs NHTSA ${decoded.engineL.toFixed(1)}L`,
      });
    }
  }

  return out;
}
