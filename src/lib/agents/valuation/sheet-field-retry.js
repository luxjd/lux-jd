// Focused per-field retry for sheet-derivable fields that Pass 1 missed.
//
// Philosophy: "only ask the user when the agent failed or the field
// isn't on the sheet." Pass 1 is a whole-sheet extraction — it spreads
// attention across ~30 fields, and small/handwritten fields get lost.
// A focused retry with a single-question prompt consistently recovers
// fields that were in the image but under-attended in the wide pass.
//
// Strategy per field:
//   1. Build a field-specific prompt that describes where to look on a
//      Japanese auction sheet (label, layout, character conventions).
//   2. Run it through three Anthropic tiers (Opus / Sonnet / Haiku) so
//      different parameter scales read the same region independently.
//   3. Arbitrate:
//        - strict match on 2/3 models → accept with high confidence
//        - unanimous agreement → accept at confidence 0.96
//        - single-model read with plausible value → accept at 0.72
//        - no clean answer → leave field missing, user must provide
//
// Cost: ~$0.02 per missing field × 3 models = ~$0.06 per retry.
// Typical sheet has 0-3 missing sheet fields, so $0-0.20 total.

import { callClaudeVision } from "@/lib/claude";

const RETRY_MODELS = (process.env.SHEET_RETRY_MODELS
  ? process.env.SHEET_RETRY_MODELS.split(",").map((id) => ({ id: id.trim(), name: id.trim().split("/").pop() }))
  : [
      { id: "anthropic/claude-opus-4-7",    name: "opus" },
      { id: "anthropic/claude-sonnet-4",    name: "sonnet" },
      { id: "anthropic/claude-haiku-4.5",   name: "haiku" },
    ]);

const VERIFY_SYSTEM = "Read the auction sheet carefully and answer the specific question. Return ONLY valid JSON.";

// ─────────────────────────────────────────────────────────────
// Field-specific prompts. Each returns { value, confidence }.
// Prompts are TERSE and pointed at ONE question — the model doesn't
// need to answer anything else. Short prompts = more attention on the
// image region.
// ─────────────────────────────────────────────────────────────

const FIELD_PROMPTS = {
  make: `What is the vehicle brand (車名 / 車体) shown on this Japanese auction sheet?
Map common katakana: メルセデスベンツ=Mercedes-Benz, フェラーリ=Ferrari, ポルシェ=Porsche, ランボルギーニ=Lamborghini, ベントレー=Bentley, アストンマーチン=Aston Martin, マセラティ=Maserati, BMW=BMW.
Return JSON: {"make": "<English brand>", "confidence": 0.0-1.0}`,

  model: `What is the model name on this Japanese auction sheet?
Look for モデル / 車種 / the model text near 車名. This is the BASE model only (e.g. "488 GTB", "911 Turbo", "SL550", "GT R") — NOT the trim/edition/grade string.
Return JSON: {"model": "<string>", "confidence": 0.0-1.0}`,

  year: `What YEAR was this vehicle first registered?
Read 初度登録年月 or 年式. Convert Japanese era: H(平成)+1988, R(令和)+2018, S(昭和)+1925. Example: H24=2012, R5=2023.
Return JSON: {"year": <4-digit integer>, "era": "<e.g. H24>", "confidence": 0.0-1.0}`,

  mileageKm: `What is the odometer reading on this Japanese auction sheet?
Read every digit box left-to-right, including leading zeros. Check for マイル/Miles near the digit boxes. Report the RAW number and the unit — do NOT convert between units.
Return JSON: {"mileageKm": <integer — raw digit reading>, "unit_read": "km|miles|unclear", "confidence": 0.0-1.0, "field_confidence": "high|medium|low"}`,

  driveSide: `Is this a LEFT-HAND-DRIVE or RIGHT-HAND-DRIVE vehicle?
Look at ハンドル. The SELECTED option is marked by a circle, bracket [左], underline, or checkmark. 左=LHD, 右=RHD. Brackets are SELECTION, not cancellation.
Return JSON: {"driveSide": "LHD|RHD", "confidence": 0.0-1.0}`,

  exteriorColor: `What is the EXTERIOR color (外色) on this Japanese auction sheet?
Return the color in English. Preserve the Japanese text verbatim. If the sheet shows a color code (カラーNo.), report it too.
Common: パール=Pearl, ブラック=Black, ホワイト=White, シルバー=Silver, グレー=Grey.
Return JSON: {"exteriorColor": "<English>", "exteriorColorJapanese": "<verbatim JP>", "colorCode": "<3-digit code or null>", "confidence": 0.0-1.0}`,

  interiorColor: `What is the INTERIOR color (内装色) on this Japanese auction sheet?
Preserve two-tone strings with "/" separator — "ブラック/ホワイト" → "Black/White". Never collapse to one color.
Return JSON: {"interiorColor": "<English>", "confidence": 0.0-1.0}`,

  interiorGrade: `What is the INTERIOR grade (内装) on this Japanese auction sheet?
It's a single letter: A (best) / B / C / D (worst). Do NOT confuse with the numeric overall grade.
Return JSON: {"interiorGrade": "A|B|C|D", "confidence": 0.0-1.0}`,

  transmission: `What is the TRANSMISSION (シフト) on this Japanese auction sheet?
AT/FAT/CVT = AUTOMATIC. MT/F5/F6 = MANUAL. DCT/PDK/SMG = DCT/PDK/SMG.
Return JSON: {"transmission": "AUTOMATIC|MANUAL|DCT|PDK|SMG", "confidence": 0.0-1.0}`,

  fuelType: `What is the FUEL (燃料) on this Japanese auction sheet?
ガソリン=PETROL, 軽油/ディーゼル=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC.
Return JSON: {"fuelType": "PETROL|DIESEL|HYBRID|ELECTRIC", "confidence": 0.0-1.0}`,

  auctionGrade: `What is the OVERALL auction grade (評価点) on this Japanese auction sheet?
Scale: S (top, = 6.5) > 6 > 5 > 4.5 > 4 > 3.5 > 3 > 2 > 1. R/RA means accident history.
Return JSON: {"auctionGrade": <number 1.0-6.5>, "accidentIndicator": <true|false>, "confidence": 0.0-1.0}`,

  accidentHistory: `Does this vehicle have accident history (修復歴)?
Look at 修復歴. 有=Yes, 無=No. R/RA grade also implies Yes.
Return JSON: {"accidentHistory": <true|false>, "confidence": 0.0-1.0}`,

  vin: `What is the 17-character CHASSIS NUMBER / VIN (車台No) on this Japanese auction sheet?
Exactly 17 characters using A-H, J-N, P, R-Z, 0-9. Do NOT return the 型式 (model code, 6-10 chars). Brand WMIs: Mercedes=WDB/WDC/WDD/WDF, Porsche=WP0/WP1, Ferrari=ZFF, Bentley=SCB, BMW=WBA/WBS/WBY.
Return JSON: {"vin": "<exactly 17 chars>", "confidence": 0.0-1.0}`,

  modelCode: `What is the MODEL CODE (型式) on this Japanese auction sheet?
Typically 6-10 chars prefixed CBA-/DBA-/ABA-/LDA-/etc. DIFFERENT from the 17-char VIN.
Return JSON: {"modelCode": "<string>", "confidence": 0.0-1.0}`,

  registrationPlate: `What is the Japanese REGISTRATION PLATE (登録No) on this auction sheet?
Format: prefecture + 3-digit class + hiragana + 4-digit number (e.g. "三重 302 な 2598"). Copy verbatim with spaces.
Return JSON: {"registrationPlate": "<string>", "confidence": 0.0-1.0}`,

  shakenExpiry: `When does the SHAKEN (車検) expire?
Read the expiry date near 車検. Convert Japanese era: H+1988, R+2018, S+1925. Format: YYYY-MM (or YYYY-MM-DD if day present).
Return JSON: {"shakenExpiry": "YYYY-MM[-DD]", "confidence": 0.0-1.0}`,

  lotNumber: `What is the LOT NUMBER (出品番号 / 出品NO) on this Japanese auction sheet?
Usually top-left corner, numeric.
Return JSON: {"lotNumber": "<string>", "confidence": 0.0-1.0}`,

  auctionHouse: `Which AUCTION HOUSE issued this inspection sheet?
Look at the header. USS (輸入車プライムコーナー / USS logo), TAA (Toyota), HAA (Honda), JU, CAA, AUCNET, LAA, BCN, NAA, HERO, ZIP.
Return JSON: {"auctionHouse": "<abbreviation>", "confidence": 0.0-1.0}`,

  recyclingDepositJpy: `What is the RECYCLING DEPOSIT (リサイクル預託金) in JPY on this auction sheet?
Numeric value next to リサイクル預託金 label.
Return JSON: {"recyclingDepositJpy": <integer>, "confidence": 0.0-1.0}`,

  colorCode: `What is the manufacturer COLOR CODE (カラーNo.) on this auction sheet?
3-4 character alphanumeric code next to カラーNo. label.
Return JSON: {"colorCode": "<string>", "confidence": 0.0-1.0}`,

  importType: `How was this vehicle imported (輸入区分)?
Options: Dealer (ディーラー), Parallel (並行), Individual (個人), Auction (オークション). The selected option is bracketed / circled / underlined.
Return JSON: {"importType": "<string>", "confidence": 0.0-1.0}`,

  drivetrain: `What is the drivetrain (駆動 / 駆動方式)?
2WD / 4WD / AWD / FF / FR / RR / MR.
Return JSON: {"drivetrain": "2WD|4WD|AWD", "confidence": 0.0-1.0}`,

  seatingCapacity: `What is the SEATING CAPACITY (乗車定員 / 定員) on this auction sheet?
Integer.
Return JSON: {"seatingCapacity": <integer>, "confidence": 0.0-1.0}`,

  doorCount: `How many doors (ドア / 形状)?
Look for "3D"=3-door, "2D"=2-door, "5D", etc., or body-shape labels (coupe=2, sedan=4).
Return JSON: {"doorCount": <integer>, "confidence": 0.0-1.0}`,

  grade: `What is the GRADE / EDITION (グレード) on this Japanese auction sheet?
This is the trim + edition string (e.g. "S 130th Anniversary Edition", "GT3 RS", "Edition 1"). PRESERVE multi-digit anniversary numerals — "130th" is NOT "10th" or "30th".
Return JSON: {"grade": "<string>", "confidence": 0.0-1.0}`,

  colorChanged: `Has this vehicle been REPAINTED (色替 / 色変)?
Look for 色替 label, an arrow (→) next to the color, or explicit change markers.
Return JSON: {"colorChanged": <true|false>, "confidence": 0.0-1.0}`,

  serviceBookPresent: `Does this auction sheet indicate a SERVICE BOOK is present?
Look for 新車整備手帳 or 保証書付 with 有 (present) or 無 (absent) circled or marked.
Return JSON: {"serviceBookPresent": <true|false>, "confidence": 0.0-1.0}`,

  bodyType: `What is the BODY TYPE code (形状) on this Japanese auction sheet?
Return the EXACT code printed: 3D, 2D, OP, CP, SD, HB, SW, etc. Do NOT translate to English.
Return JSON: {"bodyType": "<code>", "confidence": 0.0-1.0}`,

  displacement: `What is the ENGINE DISPLACEMENT (排気量) in cc on this Japanese auction sheet?
Read the number next to 排気量. Report the exact integer (e.g. 4000, 3000, 5200).
Return JSON: {"displacement": <integer>, "confidence": 0.0-1.0}`,

  auctionResult: `What is the AUCTION RESULT (セリ結果) on this sheet?
Look at the header row for: 落札 (sold), 流れ (unsold/passed), 商談 (negotiating). Only if printed.
Return JSON: {"auctionResult": "sold|unsold|negotiating|null", "confidence": 0.0-1.0}`,

  startPriceMan: `What is the START PRICE (スタート金額) in 万円 on this sheet?
Look at the header row for a number labelled スタート金額. The number is in 万円 (×10,000 JPY). Only if printed.
Return JSON: {"startPriceMan": <integer or null>, "confidence": 0.0-1.0}`,

  soldPriceMan: `What is the SOLD/HAMMER PRICE (落札額) in 万円 on this sheet?
Look at the header row. Only if printed.
Return JSON: {"soldPriceMan": <integer or null>, "confidence": 0.0-1.0}`,

  serviceRecordEntries: `Extract SERVICE RECORD HISTORY (記録簿) from this Japanese auction sheet.
Look in the ◎注意事項 section for entries like: "記録簿 R4.2 (4,598km) R5.2 (8,236km)..." or "H29, H30, H31年ディーラー記録簿" or "ヤナセ記録簿7枚(最終R7)".
Convert era dates: R4.2 = 2022-02, H30 = 2018.
Return JSON: {"serviceRecordEntries": [{"date": "YYYY-MM", "mileageKm": <int or null>}], "serviceRecordCount": <int or null>, "serviceRecordDealer": "<name or null>", "confidence": 0.0-1.0}`,
};

// ─────────────────────────────────────────────────────────────
// Read + arbitrate
// ─────────────────────────────────────────────────────────────

async function readFieldAcrossModels(image, fieldKey) {
  const prompt = FIELD_PROMPTS[fieldKey];
  if (!prompt) return null;

  const tasks = RETRY_MODELS.map(async ({ id, name }) => {
    try {
      const r = await callClaudeVision({
        prompt,
        images: [image],
        system: VERIFY_SYSTEM,
        model: id,
        maxTokens: 512,
      });
      return { name, model: id, result: r };
    } catch (e) {
      return { name, model: id, result: null, error: e.message };
    }
  });
  return Promise.all(tasks);
}

// Extract the field's value from a model response — the JSON key varies
// per field so we look up the canonical key.
const FIELD_KEYS = {
  make: "make", model: "model", year: "year", mileageKm: "mileageKm",
  driveSide: "driveSide", exteriorColor: "exteriorColor", interiorColor: "interiorColor",
  interiorGrade: "interiorGrade", interiorAuxGrade: "interiorAuxGrade",
  transmission: "transmission", fuelType: "fuelType",
  auctionGrade: "auctionGrade", accidentHistory: "accidentHistory",
  vin: "vin", modelCode: "modelCode", registrationPlate: "registrationPlate",
  shakenExpiry: "shakenExpiry", lotNumber: "lotNumber", auctionHouse: "auctionHouse",
  recyclingDepositJpy: "recyclingDepositJpy", colorCode: "colorCode",
  importType: "importType", drivetrain: "drivetrain",
  seatingCapacity: "seatingCapacity", doorCount: "doorCount",
  grade: "grade", colorChanged: "colorChanged",
  serviceBookPresent: "serviceBookPresent", bodyType: "bodyType",
  displacement: "displacement",
  auctionResult: "auctionResult", startPriceMan: "startPriceMan",
  soldPriceMan: "soldPriceMan", serviceRecordEntries: "serviceRecordEntries",
  serviceRecordCount: "serviceRecordCount", serviceRecordDealer: "serviceRecordDealer",
};

function normaliseValue(val, fieldKey) {
  if (val == null || val === "") return null;
  if (typeof val === "string") {
    const s = val.trim();
    if (!s) return null;
    // Canonicalise common enum misspellings so equal-value clustering works.
    if (fieldKey === "driveSide") {
      const u = s.toUpperCase();
      if (u === "LHD" || u === "LEFT") return "LHD";
      if (u === "RHD" || u === "RIGHT") return "RHD";
    }
    if (fieldKey === "transmission") {
      const u = s.toUpperCase();
      if (["AT", "FAT", "CVT"].includes(u)) return "AUTOMATIC";
      if (["MT", "F5", "F6"].includes(u)) return "MANUAL";
      if (["AUTOMATIC", "MANUAL", "DCT", "PDK", "SMG"].includes(u)) return u;
    }
    if (fieldKey === "fuelType") {
      const u = s.toUpperCase();
      if (u === "GASOLINE" || u === "GAS" || u === "PETROL") return "PETROL";
      if (["DIESEL", "HYBRID", "ELECTRIC"].includes(u)) return u;
    }
    if (fieldKey === "make") {
      // Prefer "Mercedes-Benz" over "Mercedes Benz"/"mercedes benz".
      if (/^mercedes[\s-]?benz$/i.test(s)) return "Mercedes-Benz";
      return s;
    }
    return s;
  }
  return val;
}

function arbitrateField(reads, fieldKey) {
  const jsonKey = FIELD_KEYS[fieldKey];
  const values = reads.map((r) => ({
    name: r.name,
    raw: r.result?.[jsonKey],
    value: normaliseValue(r.result?.[jsonKey], fieldKey),
    confidence: r.result?.confidence ?? 0,
    error: r.error || null,
  }));

  const valid = values.filter((v) => v.value !== null && v.value !== undefined);
  if (valid.length === 0) {
    return { value: null, confidence: 0, votes: "0/3", reads: values };
  }

  // Bucket by canonical string representation.
  const buckets = new Map();
  for (const v of valid) {
    const key = typeof v.value === "number" ? String(Math.round(v.value)) : String(v.value).toLowerCase();
    if (!buckets.has(key)) buckets.set(key, { rawValue: v.value, members: [] });
    buckets.get(key).members.push(v);
  }
  const top = [...buckets.values()].sort((a, b) => b.members.length - a.members.length)[0];
  const agree = top.members.length;
  const total = reads.length;

  // Confidence ladder.
  let confidence;
  if (agree === total) confidence = 0.96;
  else if (agree >= 2) confidence = 0.88;
  else {
    // Single-model read — trust it if the read's own confidence is high.
    confidence = Math.max(0.55, Math.min(0.82, top.members[0].confidence));
  }

  return {
    value: top.rawValue,
    confidence,
    votes: `${agree}/${total}`,
    reads: values,
  };
}

// ─────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────

/**
 * Retry a single missing field against the auction sheet image.
 * Returns { value, confidence, votes, reads } or null if we can't find it.
 */
export async function retrySheetField(image, fieldKey) {
  if (!FIELD_PROMPTS[fieldKey]) return null;
  const reads = await readFieldAcrossModels(image, fieldKey);
  if (!reads) return null;
  return arbitrateField(reads, fieldKey);
}

/**
 * Retry multiple missing fields in parallel. Returns a map
 *   { [fieldKey]: { value, confidence, votes } | null }
 *
 * Cost: one set of 3 model calls per missing field. 5 missing fields =
 * 15 calls (~$0.30). All calls run in parallel so wall-clock ≈ one call.
 */
export async function retryMissingSheetFields(image, fieldKeys) {
  const candidates = fieldKeys.filter((k) => FIELD_PROMPTS[k]);
  const results = await Promise.all(candidates.map((k) => retrySheetField(image, k).then((r) => [k, r])));
  const out = {};
  for (const [k, r] of results) out[k] = r;
  return out;
}

export function retryEnabled() {
  // On by default when we have an auction sheet image. Disable with
  // SHEET_RETRY=0 for a quick-return debug mode.
  return process.env.SHEET_RETRY !== "0";
}

// Minimum confidence to accept a retry result without asking the user.
export const RETRY_ACCEPT_THRESHOLD = 0.75;

export { FIELD_PROMPTS };
