/**
 * Option code → market-value matcher.
 *
 * Spec §6.3.2 step 2: "List every factory option with original option code and
 * current market value of the specification."
 *
 * The DE Market TVR already carries `optionPremiums` per model (e.g. Ferrari
 * "Daytona seats" → €6k premium, Porsche "PCCB" → €7.5k premium). This matcher
 * joins those premiums to whatever options the vehicle actually has —
 * extracted from `specNotes`, `specificationNotes`, option arrays, or photo
 * analysis — and produces a structured list the description generator can
 * surface verbatim in the listing specification sheet.
 */

/**
 * Pull candidate option strings out of a vehicle record. Looks at free-text
 * notes, structured option arrays if present, and any photo-analysis notable
 * features the Vision pass spotted upstream.
 */
function collectVehicleOptions(vehicle) {
  const candidates = new Set();

  const textFields = [
    vehicle.specNotes,
    vehicle.specificationNotes,
    vehicle.auctionSheetNotes,
    vehicle.conditionNotes,
  ].filter((t) => typeof t === "string" && t.length > 0);

  for (const text of textFields) {
    for (const piece of text.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean)) {
      if (piece.length > 2 && piece.length < 80) candidates.add(piece);
    }
  }

  // Structured arrays (spec propagates these through some upstream paths).
  const arrays = [vehicle.options, vehicle.factoryOptions, vehicle.notableOptions, vehicle.notableFeatures];
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        if (typeof entry === "string") candidates.add(entry);
        else if (entry && typeof entry === "object" && entry.name) candidates.add(entry.name);
      }
    }
  }

  // Photo-analysis output from JP Sourcing's Vision pass.
  if (Array.isArray(vehicle.notableFeatures)) {
    for (const f of vehicle.notableFeatures) candidates.add(f);
  }
  if (vehicle.photoAnalysis?.notableFeatures) {
    for (const f of vehicle.photoAnalysis.notableFeatures) candidates.add(f);
  }

  return [...candidates];
}

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Match a candidate string against the TVR's `optionPremiums` map. Uses
 * normalized substring comparison in both directions so e.g. "Carbon ceramic
 * brakes" matches "PCCB (Carbon Ceramic Brakes)".
 */
function matchPremium(candidate, optionPremiums) {
  if (!optionPremiums || typeof optionPremiums !== "object") return null;
  const normCandidate = normalize(candidate);
  if (!normCandidate) return null;

  for (const [optionName, premium] of Object.entries(optionPremiums)) {
    const normOption = normalize(optionName);
    if (!normOption) continue;
    if (normCandidate.includes(normOption) || normOption.includes(normCandidate)) {
      return { optionName, ...premium };
    }
  }
  return null;
}

/**
 * Build the enriched notable-options list for a vehicle against its TVR.
 * Each entry: { option, premiumEur, modifier, reason, source }.
 * `source` = "tvr_matched" when the TVR had a premium for this option,
 *            "vehicle_only" when we know the vehicle has it but no premium data.
 */
export function matchOptionsToMarketValue(vehicle, tvr) {
  const candidates = collectVehicleOptions(vehicle);
  const optionPremiums = tvr?.marketValue?.optionPremiums || tvr?.optionPremiums || {};
  const matched = [];
  const unmatchedWithKnownValue = new Set(Object.keys(optionPremiums));

  for (const candidate of candidates) {
    const premium = matchPremium(candidate, optionPremiums);
    if (premium) {
      matched.push({
        option: candidate,
        canonicalName: premium.optionName,
        premiumEur: premium.premium_eur ?? null,
        modifier: premium.modifier ?? null,
        reason: premium.reason || null,
        source: "tvr_matched",
      });
      unmatchedWithKnownValue.delete(premium.optionName);
    } else if (candidate.length <= 60) {
      matched.push({
        option: candidate,
        canonicalName: null,
        premiumEur: null,
        modifier: null,
        reason: null,
        source: "vehicle_only",
      });
    }
  }

  // Dedupe on canonical name when TVR-matched, else on candidate text.
  const seen = new Set();
  const deduped = matched.filter((m) => {
    const key = m.canonicalName || m.option.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    matchedOptions: deduped,
    totalPremiumEur: deduped.reduce((s, m) => s + (m.premiumEur || 0), 0),
    tvrOptionCount: Object.keys(optionPremiums).length,
    matchedTvrOptionCount: deduped.filter((m) => m.source === "tvr_matched").length,
  };
}
