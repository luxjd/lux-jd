// Post-extraction normalisation driven by the auction-sheet calibration set.
// Applied AFTER all OCR passes (parseAuctionSheet + retry + merge) and
// BEFORE validateExtractionOutput splits fields into asked-vs-extracted.
//
// These fixes were distilled from a batch run against real USS sheets —
// every rule here has a specific counter-example in our calibration set.
// If you add a new rule, add a comment linking to the sheet it fixes.

// ─────────────────────────────────────────────────────────────
// AUCTION HOUSE — strip location suffix.
// Calibration: sheet1 returned "USS Tokyo", sheet3 "USS Yokohama",
// sheet5 "USS Shinagawa". The canonical value is just the auction-house
// code; location is a secondary field.
// ─────────────────────────────────────────────────────────────
const AUCTION_HOUSE_CANONICAL = [
  "USS", "TAA", "HAA", "JU", "CAA", "AUCNET", "LAA", "BCN", "NAA", "HERO", "ZIP",
];

// Certain sub-corner labels are exclusive to specific auction houses.
// Without this map, the parser sometimes returns the subtitle (e.g.
// "Import Prime Corner" / "輸入車プライムコーナー") as the auction house
// when it should return "USS" — that phrase is a USS-specific section.
const SUBTITLE_TO_HOUSE = [
  { pattern: /import\s*prime\s*corner|輸入車プライムコーナー|輸入車\s*プライム|輸入車コーナー|one\s*more\s*輸入車|ワンモア\s*輸入車/i, house: "USS" },
  { pattern: /prime\s*corner|プライムコーナー/i, house: "USS" },
];

export function normaliseAuctionHouse(raw) {
  if (!raw) return { normalised: null, location: null };
  const s = String(raw).trim();
  for (const code of AUCTION_HOUSE_CANONICAL) {
    const re = new RegExp(`\\b${code}\\b`, "i");
    if (re.test(s)) {
      // Extract location if "USS Tokyo" / "USS Yokohama" pattern.
      const afterCode = s.replace(re, "").trim();
      const location = afterCode && afterCode.length < 30 ? afterCode.replace(/^[\s,()-]+|[\s,()-]+$/g, "") : null;
      return { normalised: code.toUpperCase(), location: location || null };
    }
  }
  // Check subtitle-based mappings — "Import Prime Corner" → USS.
  for (const { pattern, house } of SUBTITLE_TO_HOUSE) {
    if (pattern.test(s)) {
      return { normalised: house, location: null };
    }
  }
  return { normalised: s, location: null };
}

// ─────────────────────────────────────────────────────────────
// MAKE — upgrade Mercedes-Benz → Mercedes-AMG when the model is an AMG.
// Calibration: sheet3 read make="Mercedes-Benz" + model="CLS" + grade="CLS63 S 4Matic".
// The grade field identifies this as AMG. Same for C63, E63, G63, GT R,
// GT S, S63, SL63, GLE63, etc.
// ─────────────────────────────────────────────────────────────
// AMG displacement codes — numeric badge suffixes unique to AMG models.
// This matters: "SL500" and "SL550" are REGULAR Mercedes (not AMG) while
// "SL55/SL63/SL65" ARE AMG. So the numeric code tells you AMG vs non-AMG
// for the same letter prefix. Using the specific AMG codes avoids the
// false-positive "SL500 → AMG" upgrade.
const AMG_DISPLACEMENT_CODES = "(?:35|43|45|53|55|63|65)";

const AMG_MODEL_PATTERNS = [
  // three-letter compound: CLS63, CLA45, GLE63, GLS63, SLS (no digits)
  new RegExp(`\\b(?:CLS|CLA|GLA|GLC|GLE|GLS|CLK|SLC|SLK)\\s?${AMG_DISPLACEMENT_CODES}\\b`, "i"),
  // SLS AMG (no digit suffix; model name itself is AMG-exclusive)
  /\bSLS\b/i,
  // single/two-letter + AMG displacement: C63, E63, G63, S63, SL63, SLK55
  new RegExp(`\\b(?:[CEGS]|SL)\\s?${AMG_DISPLACEMENT_CODES}\\b`, "i"),
  // explicit "AMG" mention anywhere
  /\bAMG\b/i,
  // AMG GT family — GT alone is AMG (Mercedes sells no non-AMG GT)
  /\bGT\s*(?:R|S|C|Black\s*Series|\d\s*(?:Door|Pro)?)?\b/i,
];

export function upgradeToAMGIfApplicable(extracted) {
  const make = String(extracted.make || "").toLowerCase();
  if (!make.includes("mercedes")) return extracted;
  if (make.includes("amg")) return extracted;  // already correct

  const probe = [extracted.model, extracted.grade, extracted.specificationNotes]
    .filter(Boolean)
    .join(" ");
  const isAMG = AMG_MODEL_PATTERNS.some((p) => p.test(probe));
  if (isAMG) {
    extracted.make = "Mercedes-AMG";
    extracted._makeUpgraded = { from: "Mercedes-Benz", reason: "AMG model pattern detected in model/grade" };
  }
  return extracted;
}

// ─────────────────────────────────────────────────────────────
// IMPORT TYPE — when the sheet says ディーラー並行 (Dealer Parallel),
// parser should return "Dealer" (the primary classification) not "Parallel".
// "Parallel" alone with no Dealer context stays as "Parallel Import".
// Calibration: sheet2 read "Parallel" when sheet showed ディーラー並行.
// ─────────────────────────────────────────────────────────────
export function normaliseImportType(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const lc = s.toLowerCase();
  // Keep original string if it already reads as "Dealer" or "Dealer (...)"
  if (/dealer/i.test(lc) || /ディーラー/.test(s)) return "Dealer";
  if (/parallel/i.test(lc) || /並行/.test(s)) {
    // Japanese usage: ディーラー並行 is "Dealer Parallel" = the car
    // came in through a non-official dealer using parallel import chain,
    // but the entity doing the import IS a dealer. Our taxonomy calls
    // this "Dealer" because the selling entity is a registered dealer.
    // Pure "個人並行" (Private Parallel) would stay as "Parallel".
    if (/個人|private|individual/i.test(s)) return "Parallel";
    return s; // preserve whatever was read if ambiguous
  }
  if (/個人|individual/i.test(s)) return "Individual";
  if (/auction|オークション/i.test(s)) return "Auction";
  return s;
}

// ─────────────────────────────────────────────────────────────
// RECYCLING DEPOSIT — reject grossly implausible values.
// Calibration: sheet6 read 16020 instead of 18030 (small digit mis-OCR).
// Typical range is ~10,000-30,000 JPY. Flag anything outside 5k-60k.
// ─────────────────────────────────────────────────────────────
export function sanityCheckRecyclingDeposit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { value: null, warning: null };
  if (n < 5000) return { value: null, warning: `recycling_deposit ${n} implausibly low (typical 10-30k JPY)` };
  if (n > 60000) return { value: null, warning: `recycling_deposit ${n} implausibly high (typical 10-30k JPY)` };
  return { value: n, warning: null };
}

// ─────────────────────────────────────────────────────────────
// Public: apply all normalisations in one pass. Returns the mutated
// extracted object + an array of notes describing what was changed.
// ─────────────────────────────────────────────────────────────
export function postNormaliseExtraction(extracted) {
  if (!extracted || typeof extracted !== "object") return { extracted, notes: [] };
  const notes = [];

  // Auction house
  if (extracted.auctionHouse) {
    const { normalised, location } = normaliseAuctionHouse(extracted.auctionHouse);
    if (normalised && normalised !== extracted.auctionHouse) {
      notes.push(`auctionHouse normalised "${extracted.auctionHouse}" → "${normalised}"${location ? ` (location="${location}")` : ""}`);
      extracted.auctionHouse = normalised;
      if (location) extracted.auctionHouseLocation = location;
    }
  }

  // Make — upgrade to AMG if model/grade says so
  const beforeMake = extracted.make;
  upgradeToAMGIfApplicable(extracted);
  if (extracted.make !== beforeMake) {
    notes.push(`make upgraded "${beforeMake}" → "${extracted.make}" (AMG pattern detected)`);
  }

  // Import type
  if (extracted.importType) {
    const normalisedImp = normaliseImportType(extracted.importType);
    if (normalisedImp && normalisedImp !== extracted.importType) {
      notes.push(`importType normalised "${extracted.importType}" → "${normalisedImp}"`);
      extracted.importType = normalisedImp;
    }
  }

  // Recycling deposit sanity
  if (extracted.recyclingDepositJpy != null) {
    const { value, warning } = sanityCheckRecyclingDeposit(extracted.recyclingDepositJpy);
    if (value === null && warning) {
      notes.push(`recyclingDepositJpy cleared: ${warning}`);
      extracted.recyclingDepositJpy = null;
      extracted._recyclingDepositWarning = warning;
    }
  }

  return { extracted, notes };
}
