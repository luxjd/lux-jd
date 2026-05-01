/**
 * Expert-Level Japanese Auction Sheet Analyzer
 *
 * Multi-pass extraction pipeline for Japanese vehicle auction inspection sheets
 * (検査表/出品票). Supports ALL major auction houses with per-field confidence
 * scoring, blind verification, deep damage analysis, and cross-validation.
 *
 * Architecture:
 *   Pass 1 — Full comprehensive extraction (all fields)
 *   Pass 2 — Blind verification of error-prone fields (mileage, year, color)
 *   Pass 3 — Deep damage map & panel diagram analysis
 *   Post  — Cross-validation, anomaly detection, confidence scoring
 *
 * Exports:
 *   parseAuctionSheet(image, opts)  — full pipeline for valuation engine
 *   extractVehicleData(images)      — extraction + verification for upload flow
 */

import { callClaudeVision } from "@/lib/claude";
import { validateSheetOutput, validateExtractionOutput } from "./validation";
import { loadPrompt } from "./prompts/loader";
import { ensembleEnabled, ensembleExtract } from "./sheet-ensemble";
import { maybePreprocess } from "./image-preprocess";
import { extractMileageWithZone, zoneExtractorEnabled } from "./sheet-mileage-extractor";
import { extractVinWithZone, vinExtractorEnabled } from "./sheet-vin-extractor";
import { retryMissingSheetFields, retryEnabled, RETRY_ACCEPT_THRESHOLD } from "./sheet-field-retry";
import { postNormaliseExtraction } from "./sheet-post-normalize";

// ══════════════════════════════════════════════════════════════
// ESTIMATION PROVENANCE LABELS
// ══════════════════════════════════════════════════════════════
//
// For every field we return, mark whether it was:
//   EXTRACTED — literally printed on the sheet (grade number, digit
//               mileage, VIN stamp, color code, era-year, etc.)
//   ESTIMATED — AI-inferred from indirect evidence (damage severity
//               from code density, structural concern flag, respray
//               detection from paint notes, etc.)
//   TRANSLATED — Japanese text rendered into English by the LLM
//                (mechanical notes, modification notes, damage-code
//                meanings from the reference dictionary)
//   COMPUTED  — deterministic math over other fields (overall score
//               averages, TÜV-relevant damage counts)
//
// Downstream consumers (UI, report PDF) read `_estimation_labels`
// to render "(Estimated)" or similar annotations next to values.

const LABEL_ESTIMATED = "Estimated";
const LABEL_TRANSLATED = "Translated";
const LABEL_COMPUTED = "Computed";

// Fields that are ALWAYS AI-inferred, not literal on any sheet.
const ALWAYS_ESTIMATED_FIELDS = [
  "overall_assessment",
  "accident_contradiction",
  "service_history_indicator",
  "interior_originality",
  "_damage_severity_score",
  "_damage_distribution",
  "_structural_concern",
  "_structural_reasoning",
  "_respray_detected",
  "_respray_panels",
  "_repair_cost_category",
  "_anomalies",
];

// Fields that are AI-translated from Japanese text.
const ALWAYS_TRANSLATED_FIELDS = [
  "mechanical_notes",
  "modification_notes",
  "equipment_translated",
  "caution_notes",
  "inspector_notes",
];

// Fields computed deterministically from extracted data.
const COMPUTED_FIELDS = ["_tuv_relevant_damage", "_passes_completed"];

/**
 * Build the per-field provenance map. Returns { fieldName: "Estimated" | "Translated" | "Computed" }.
 * Extracted fields are intentionally absent — absence means "this came directly from the sheet".
 */
function buildEstimationLabels(merged, fieldConfidence) {
  const labels = {};

  for (const f of ALWAYS_ESTIMATED_FIELDS) {
    if (merged[f] !== undefined && merged[f] !== null) labels[f] = LABEL_ESTIMATED;
  }
  for (const f of ALWAYS_TRANSLATED_FIELDS) {
    if (Array.isArray(merged[f]) && merged[f].length > 0) labels[f] = LABEL_TRANSLATED;
  }
  for (const f of COMPUTED_FIELDS) {
    if (merged[f] !== undefined) labels[f] = LABEL_COMPUTED;
  }

  // Low-confidence extracted fields — these came from the sheet but the
  // read was uncertain. Mark as Estimated so the operator verifies.
  const conf = fieldConfidence || {};
  for (const [field, c] of Object.entries(conf)) {
    if (typeof c === "number" && c < 0.75 && !labels[field]) {
      labels[field] = LABEL_ESTIMATED;
    }
  }

  // Per-damage-code sub-fields: `code` and `location` are extracted;
  // `meaning` is from the dictionary (Translated), `severity` /
  // `structural` / `tuvRelevant` are classifier outputs (Estimated).
  labels._damage_codes_item = {
    code: null, // extracted
    location: null, // extracted
    meaning: LABEL_TRANSLATED,
    severity: LABEL_ESTIMATED,
    structural: LABEL_ESTIMATED,
    tuvRelevant: LABEL_ESTIMATED,
  };

  return labels;
}

// ══════════════════════════════════════════════════════════════
// REFERENCE DATABASES
// ══════════════════════════════════════════════════════════════

/** Complete Japanese auction damage code database */
export const DAMAGE_CODES = {
  // Scratches
  A1: { en: "Small scratch", severity: "MINOR", category: "scratch", tuvRelevant: false },
  A2: { en: "Scratch", severity: "MODERATE", category: "scratch", tuvRelevant: false },
  A3: { en: "Large scratch", severity: "MAJOR", category: "scratch", tuvRelevant: false },
  // Dents
  U1: { en: "Small dent", severity: "MINOR", category: "dent", tuvRelevant: false },
  U2: { en: "Dent", severity: "MODERATE", category: "dent", tuvRelevant: false },
  U3: { en: "Large dent", severity: "MAJOR", category: "dent", tuvRelevant: true },
  // Repair / Repaint
  W1: { en: "Repair trace", severity: "MODERATE", category: "repair", tuvRelevant: true },
  W2: { en: "Obvious repair", severity: "MAJOR", category: "repair", tuvRelevant: true },
  W3: { en: "Large repair area", severity: "MAJOR", category: "repair", tuvRelevant: true },
  // Rust
  S1: { en: "Light surface rust", severity: "MINOR", category: "rust", tuvRelevant: true },
  S2: { en: "Rust", severity: "MODERATE", category: "rust", tuvRelevant: true },
  S3: { en: "Heavy rust", severity: "MAJOR", category: "rust", tuvRelevant: true },
  // Cracks
  X: { en: "Crack", severity: "MAJOR", category: "crack", tuvRelevant: true },
  XX: { en: "Large crack", severity: "MAJOR", category: "crack", tuvRelevant: true },
  X1: { en: "Chip", severity: "MINOR", category: "crack", tuvRelevant: false },
  RX: { en: "Cracked glass", severity: "MAJOR", category: "crack", tuvRelevant: true },
  // Replacements
  P: { en: "Replaced panel", severity: "MAJOR", category: "replacement", tuvRelevant: true },
  PP: { en: "Non-genuine replacement", severity: "MAJOR", category: "replacement", tuvRelevant: true },
  // Others
  H: { en: "Hole", severity: "MAJOR", category: "hole", tuvRelevant: true },
  Y: { en: "Paint waviness (respray indicator)", severity: "MODERATE", category: "respray", tuvRelevant: true },
  C1: { en: "Light corrosion", severity: "MINOR", category: "corrosion", tuvRelevant: true },
  C2: { en: "Corrosion", severity: "MODERATE", category: "corrosion", tuvRelevant: true },
  B1: { en: "Small mark", severity: "MINOR", category: "mark", tuvRelevant: false },
  B2: { en: "Mark", severity: "MODERATE", category: "mark", tuvRelevant: false },
  B3: { en: "Large mark", severity: "MAJOR", category: "mark", tuvRelevant: false },
  M: { en: "Missing part", severity: "MAJOR", category: "missing", tuvRelevant: true },
  T: { en: "Tear/cut", severity: "MODERATE", category: "tear", tuvRelevant: false },
  E1: { en: "Small dent with paint damage", severity: "MODERATE", category: "dent", tuvRelevant: false },
  E2: { en: "Dent with paint damage", severity: "MAJOR", category: "dent", tuvRelevant: true },
  E3: { en: "Large dent with paint damage", severity: "MAJOR", category: "dent", tuvRelevant: true },
  F: { en: "Fire damage", severity: "MAJOR", category: "fire", tuvRelevant: true },
  // Glass-specific
  "ヒビ": { en: "Glass crack", severity: "MAJOR", category: "crack", tuvRelevant: true },
};

/** Japanese → English color mapping */
export const JAPANESE_COLORS = {
  "ブラック": "Black", "黒": "Black",
  "ホワイト": "White", "白": "White",
  "パールホワイト": "Pearl White", "パール": "Pearl",
  "シルバー": "Silver",
  "グレー": "Grey", "ガンメタ": "Gunmetal Grey",
  "レッド": "Red", "赤": "Red",
  "ブルー": "Blue", "青": "Blue",
  "グリーン": "Green", "緑": "Green",
  "ゴールド": "Gold", "金": "Gold",
  "ブラウン": "Brown", "茶": "Brown",
  "ベージュ": "Beige",
  "アイボリー": "Ivory",
  "ネイビー": "Navy", "紺": "Navy",
  "ワインレッド": "Wine Red",
  // German luxury brand-specific colors
  "カバンサイトブルー": "Cavansite Blue",
  "オブシディアンブラック": "Obsidian Black",
  "セレナイトグレー": "Selenite Grey",
  "イリジウムシルバー": "Iridium Silver",
  "ダイヤモンドホワイト": "Diamond White",
  "ブリリアントブルー": "Brilliant Blue",
  "マグネタイトブラック": "Magnetite Black",
  "デジーノ": "Designo",
  "ポーラーホワイト": "Polar White",
  "モハーベシルバー": "Mojave Silver",
  "ルナーブルー": "Lunar Blue",
  // Italian brand-specific colors
  "ロッソコルサ": "Rosso Corsa",
  "ロッソスクーデリア": "Rosso Scuderia",
  "ネロ": "Nero",
  "ビアンコ": "Bianco",
  "ジアッロ": "Giallo",
  "グリジオ": "Grigio",
  "ブルーツール": "Blu Tour de France",
  "ブルポジ": "Blu Pozzi",
  "アズーロカリフォルニア": "Azzurro California",
  "ヴェルデブリティッシュ": "Verde British Racing",
  // Porsche-specific
  "GTシルバー": "GT Silver",
  "クレヨン": "Crayon",
  "チョーク": "Chalk",
  "マイアミブルー": "Miami Blue",
  "ガーズレッド": "Guards Red",
  "レーシングイエロー": "Racing Yellow",
  "ジェントリアンブルー": "Gentian Blue",
  "アゲートグレー": "Agate Grey",
};

/** Japanese equipment code → English mapping */
export const EQUIPMENT_CODES = {
  "SR": "Sunroof", "AW": "Alloy Wheels", "PS": "Power Steering",
  "PW": "Power Windows", "TV": "TV", "ナビ": "Navigation",
  "カワ": "Leather Seats", "革": "Leather Seats",
  "AAC": "Auto Air Conditioning", "AC": "Air Conditioning",
  "エアB": "Airbag", "AB": "Airbag",
  "RS": "Rear Spoiler", "CD": "CD Player", "MD": "MD Player",
  "ETC": "ETC (Electronic Toll)", "Bカメラ": "Backup Camera",
  "HID": "HID Headlights", "LED": "LED Headlights",
  "キーレス": "Keyless Entry", "スマートキー": "Smart Key",
  "クルコン": "Cruise Control", "ACC": "Adaptive Cruise Control",
  "シートヒーター": "Heated Seats", "SH": "Heated Seats",
  "パワーシート": "Power Seats", "電動シート": "Power Seats",
  "BSM": "Blind Spot Monitor", "LKA": "Lane Keep Assist",
  "衝突軽減": "Collision Mitigation", "AEB": "Auto Emergency Braking",
  "360°カメラ": "360 Camera", "全方位": "360 Camera",
  "HDR": "Head-Up Display", "HUD": "Head-Up Display",
  "パノラマルーフ": "Panoramic Roof", "電動リアゲート": "Power Tailgate",
  "ベンチレーション": "Ventilated Seats", "マッサージ": "Massage Seats",
};

/**
 * Japanese inspector-comment glossary. Auction sheets use terse abbreviations
 * in 注意事項 / 内外装備考 / 指摘事項 fields that OCR+translate frequently
 * gets wrong (e.g. スレ is commonly confused with ガタ). Used for both
 * prompt-level instruction and post-processing verification.
 */
export const INSPECTOR_GLOSSARY = {
  // Defect types
  "スレ": "scuff", "擦れ": "scuff",
  "キズ": "scratch", "傷": "scratch",
  "ヘコミ": "dent", "凹み": "dent", "凹": "dent",
  "ガタ": "looseness", "ぐらつき": "wobble",
  "サビ": "rust", "錆": "rust", "腐食": "corrosion",
  "ヒビ": "crack", "亀裂": "crack", "割れ": "broken",
  "剥がれ": "peeling", "色あせ": "fading", "褪色": "fading",
  "シミ": "stain", "汚れ": "dirt",
  "破れ": "tear", "穴": "hole", "欠け": "chip",
  "曇り": "hazing", "白濁": "cloudiness",
  // Size / severity modifiers
  "小": "minor", "中": "moderate", "大": "major",
  "極小": "very minor", "軽度": "light", "重度": "heavy",
  // Common body-part hints (helps localize the defect in translation)
  "シート": "seat", "ハンドル": "steering wheel", "ステアリング": "steering wheel",
  "天井": "ceiling", "ドア": "door", "バンパー": "bumper",
  "フロント": "front", "リア": "rear", "サイド": "side",
  "ボンネット": "hood", "トランク": "trunk",
  "ホイール": "wheel", "タイヤ": "tyre",
  "ガラス": "glass", "ミラー": "mirror",
};

/** Brand katakana → English mapping */
export const BRAND_KATAKANA = {
  "メルセデスベンツ": "Mercedes-Benz", "メルセデス ベンツ": "Mercedes-Benz",
  "メルセデス・ベンツ": "Mercedes-Benz",
  "フェラーリ": "Ferrari", "ポルシェ": "Porsche",
  "ランボルギーニ": "Lamborghini", "ベントレー": "Bentley",
  "アストンマーチン": "Aston Martin", "アストンマーティン": "Aston Martin",
  "ジャガー": "Jaguar", "マセラティ": "Maserati",
  "ロールスロイス": "Rolls-Royce", "ロールス・ロイス": "Rolls-Royce",
  "マクラーレン": "McLaren", "レンジローバー": "Range Rover",
  "ランドローバー": "Land Rover", "ロータス": "Lotus",
  "アルファロメオ": "Alfa Romeo",
  "ビー・エム・ダブリュー": "BMW", "BMW": "BMW",
  "アウディ": "Audi", "フォルクスワーゲン": "Volkswagen",
  "ブガッティ": "Bugatti", "パガーニ": "Pagani",
  "ケーニグセグ": "Koenigsegg",
};

/** Transmission code → normalized value */
const TRANSMISSION_CODES = {
  "AT": "AUTOMATIC", "FAT": "AUTOMATIC", "FA": "AUTOMATIC",
  "CVT": "AUTOMATIC", "MT": "MANUAL", "F5": "MANUAL", "F6": "MANUAL",
  "DCT": "DCT", "PDK": "PDK", "SMG": "SMG",
  "AMT": "AUTOMATIC", "TC": "AUTOMATIC",
};

/** Fuel code → normalized value */
const FUEL_CODES = {
  "ガソリン": "PETROL", "軽油": "DIESEL", "ディーゼル": "DIESEL",
  "ハイブリッド": "HYBRID", "電気": "ELECTRIC", "LPG": "LPG",
  "CNG": "CNG",
};

/**
 * Manufacturer color code → color name databases.
 * Used as authoritative tiebreaker when OCR reads the 3-digit color code correctly
 * but misreads the katakana color name (common on low-res auction sheets).
 */
export const MANUFACTURER_COLOR_CODES = {
  "Mercedes-Benz": {
    "040": "Black", "149": "Polar White", "183": "Magnetite Black Metallic",
    "191": "Diamond White Metallic", "197": "Obsidian Black Metallic",
    "359": "Tanzanite Blue Metallic", "489": "Selenite Grey Metallic",
    "590": "Selenite Grey Metallic", "662": "Mojave Silver Metallic",
    "696": "Brilliant Blue Metallic", "775": "Iridium Silver Metallic",
    "787": "Mountain Grey Metallic", "799": "Diamond White Bright",
    "890": "Cavansite Blue Metallic", "891": "Cavansite Blue Metallic",
    "896": "Brilliant Blue Metallic", "897": "Designo Diamond White",
    "988": "Diamond White Bright", "992": "Selenite Grey Metallic",
    "033": "Cirrus White", "650": "Lunar Blue Metallic",
    "755": "Tenorite Grey Metallic", "963": "Indium Grey Metallic",
  },
  "Ferrari": {
    "322": "Rosso Corsa", "300": "Rosso Scuderia", "226": "Blu Tour de France",
    "350": "Giallo Modena", "505": "Grigio Silverstone", "100": "Nero",
    "114": "Nero Daytona", "229": "Blu Pozzi", "520": "Grigio Ferro",
    "250": "Bianco Avus", "301": "Rosso Fiorano",
  },
  "Porsche": {
    "1A": "Black", "2T": "GT Silver Metallic", "3S": "Chalk",
    "6A": "White", "6B": "Carrara White Metallic", "6R": "Racing Yellow",
    "84": "Guards Red", "J1": "Gentian Blue Metallic",
    "M7Y": "Miami Blue", "M8S": "Crayon", "2Y": "Agate Grey Metallic",
  },
  "BMW": {
    "475": "Black Sapphire Metallic", "300": "Alpine White",
    "668": "Jet Black", "A90": "Frozen Dark Grey", "C1M": "Frozen Portimao Blue",
  },
};

/**
 * Coarse color family classifier — used to sanity-check that the Japanese
 * color text printed on the sheet is consistent with the result of a
 * manufacturer-code lookup. Returns one of: WHITE / BLACK / SILVER / GREY /
 * RED / BLUE / GREEN / YELLOW / BROWN / ORANGE / null.
 */
function colorFamily(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();
  if (/パール|真珠|白|ホワイト|white|bianco|blanc|polar|diamond.*white|cirrus|ivory|chalk|crayon/.test(t)) return "WHITE";
  if (/黒|ブラック|black|nero|obsidian|magnetite|jet.*black/.test(t)) return "BLACK";
  if (/シルバー|銀|silver|argent|iridium|gt.*silver|mojave/.test(t)) return "SILVER";
  if (/グレー|グレイ|灰|grey|gray|grigio|selenite|tenorite|indium|gunmetal|agate/.test(t)) return "GREY";
  if (/赤|レッド|red|rosso|guards.*red|scuderia|corsa|fiorano/.test(t)) return "RED";
  if (/青|ブルー|blue|blu|cavansite|brilliant.*blue|miami.*blue|gentian|lunar|tour.*de.*france|pozzi/.test(t)) return "BLUE";
  if (/緑|グリーン|green|verde|british.*racing/.test(t)) return "GREEN";
  if (/黄|イエロー|yellow|giallo|racing.*yellow|modena/.test(t)) return "YELLOW";
  if (/茶|ブラウン|brown|bronze|marron/.test(t)) return "BROWN";
  if (/オレンジ|orange|arancio/.test(t)) return "ORANGE";
  return null;
}

/**
 * Look up color name from manufacturer color code.
 * Returns the color name or null if not found.
 */
function lookupColorByCode(make, colorCode) {
  if (!make || !colorCode) return null;
  // Try exact make match
  const db = MANUFACTURER_COLOR_CODES[make];
  if (db && db[String(colorCode)]) return db[String(colorCode)];
  // Try partial make match (e.g., "Mercedes-AMG" → "Mercedes-Benz")
  for (const [dbMake, codes] of Object.entries(MANUFACTURER_COLOR_CODES)) {
    if (make.includes(dbMake.split("-")[0]) || dbMake.includes(make.split("-")[0])) {
      if (codes[String(colorCode)]) return codes[String(colorCode)];
    }
  }
  return null;
}

/** Auction house signatures and layout hints */
const AUCTION_HOUSES = {
  USS: { name: "USS (Used car System Solutions)", corners: ["輸入車プライムコーナー", "セダンコーナー", "SUVコーナー"] },
  HAA: { name: "HAA (Honda Auto Auction)", variants: ["HAA Kobe", "HAA Nagoya"] },
  TAA: { name: "TAA (Toyota Auto Auction)", parent: "Toyota" },
  CAA: { name: "CAA (Central Auto Auction)" },
  JU: { name: "JU (全軽自協)", fullName: "全日本中古自動車販売協会連合会" },
  AUCNET: { name: "AUCNET", format: "online/digital" },
  ZIP: { name: "ZIP Auto Auction" },
  BCN: { name: "BCN Auction" },
  HERO: { name: "HERO Auction" },
  LAA: { name: "LAA (Luxury Auto Auction)" },
  NAA: { name: "NAA (Nippon Auto Auction)" },
};

/** Structural panels — damage here indicates potential accident repair */
const STRUCTURAL_PANELS = [
  "left_front_fender", "right_front_fender",
  "left_rear_quarter", "right_rear_quarter",
  "roof", "floor", "pillars",
  "front_frame", "rear_frame",
];

// ══════════════════════════════════════════════════════════════
// PASS 1: FULL COMPREHENSIVE EXTRACTION
// ══════════════════════════════════════════════════════════════

/**
 * Tool schema for Pass 1 — schema-enforced structured output via OpenRouter
 * tool-use. Eliminates the regex-from-free-text parsing that silently
 * returns null when the model hedges. Field names match the flat schema
 * that normalizePass1Output expects, so the model's tool_call output
 * flows straight through validation.
 */
export const AUCTION_SHEET_TOOL = {
  type: "function",
  function: {
    name: "record_auction_sheet",
    description: "Record all fields extracted from a Japanese vehicle auction inspection sheet. Every field is optional — use null when unreadable — but fill in as many as the sheet contains.",
    parameters: {
      type: "object",
      properties: {
        auction_house:           { type: ["string", "null"], description: "USS / TAA / JU / HAA / CAA / AUCNET / etc." },
        lot_number:              { type: ["string", "null"] },
        make:                    { type: ["string", "null"], description: "Read 車名 field EXACTLY. メルセデスAMG='Mercedes-AMG', メルセデスベンツ='Mercedes-Benz'. Do NOT change make based on grade/model — only report what 車名 prints." },
        model:                   { type: ["string", "null"], description: "Base model name only — e.g. 'GT', 'G63', '488 GTB', '911 Turbo S'. Do NOT include grade/edition here — that goes in 'grade'." },
        grade:                   { type: ["string", "null"], description: "Trim + edition from the グレード field, e.g. 'S 130th Anniversary Edition', 'GT3 RS', 'Edition 1'. PRESERVE multi-digit anniversary numerals verbatim — '130th Anniversary' must NOT be shortened to '10th' or '30th'." },
        model_code:              { type: ["string", "null"], description: "型式 / chassis-code (typically prefixed CBA-/DBA-/ABA-/LDA-, 6–10 chars). DIFFERENT from VIN." },
        vin:                     { type: ["string", "null"], description: "車台No. / VIN — EXACTLY 17 characters. This is DIFFERENT from 型式 (model code, 6–10 chars prefixed CBA-/DBA-). Brand WMI: Mercedes=WDB/WDC/WDD/WDF, Porsche=WP0/WP1, Ferrari=ZFF, Bentley=SCB, Aston Martin=SCF, BMW=WBS/WBA/WBY. Never return the model code here." },
        year:                    { type: ["integer", "null"], description: "Western 4-digit year (H24 = 2012, R5 = 2023)." },
        year_era:                { type: ["string", "null"], description: "Japanese era shorthand, e.g. 'H24' or 'R5'." },
        year_calculation:        { type: ["string", "null"], description: "Calculation used, e.g. 'H24 + 1988 = 2012'." },
        displacement_cc:         { type: ["integer", "null"] },
        mileage_reading:         { type: ["integer", "null"], description: "Read ALL digit boxes left-to-right including leading zeros. Report the RAW number — do NOT convert between units." },
        mileage_digits:          { type: ["string", "null"], description: "Left-to-right digit string including leading zeros, e.g. '009816' or '051170'." },
        mileage_unit:            { type: ["string", "null"], enum: [null, "km", "miles"], description: "Read the unit marker near digit boxes. マイル/Miles/Mile → 'miles'. km or no marker → 'km'. Do NOT convert the mileage_reading value." },
        transmission:            { type: ["string", "null"], enum: [null, "AUTOMATIC", "MANUAL", "DCT", "PDK", "SMG"] },
        fuel_type:               { type: ["string", "null"], enum: [null, "PETROL", "DIESEL", "HYBRID", "ELECTRIC", "LPG", "CNG"] },
        drive_side:              { type: ["string", "null"], enum: [null, "LHD", "RHD"] },
        exterior_color:          { type: ["string", "null"], description: "English translation of exterior color." },
        exterior_color_japanese: { type: ["string", "null"], description: "Exact Japanese text from the 外色 field, verbatim (e.g. 'パール', 'ダイヤモンドホワイト'). Do NOT translate." },
        color_code:              { type: ["string", "null"], description: "Manufacturer color code (カラーNo.), typically 3 digits." },
        interior_color:          { type: ["string", "null"], description: "Interior color. PRESERVE two-tone with '/' separator — 'ブラック/ホワイト' → 'Black/White'. Never collapse to a single color." },
        overall_grade:           { type: ["number", "null"], description: "Auction grade. S/6 (best) → 1. R/RA = accident history." },
        interior_grade:          { type: ["string", "null"], enum: [null, "A", "B", "C", "D"] },
        interior_aux_grade:      { type: ["string", "null"], enum: [null, "A", "B", "C", "D"], description: "内装補助評価 (optional)." },
        import_type:             { type: ["string", "null"] },
        accident_history:        { type: ["boolean", "null"] },
        service_book_present:    { type: ["boolean", "null"] },
        shaken_expiry:           { type: ["string", "null"], description: "車検 expiry as 'YYYY-MM'." },
        registration_plate:      { type: ["string", "null"], description: "登録No. / Japanese plate." },
        dimensions: {
          type: ["object", "null"],
          properties: {
            length_mm: { type: ["integer", "null"] },
            width_mm:  { type: ["integer", "null"] },
            height_mm: { type: ["integer", "null"] },
          },
        },
        damage_codes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              location: { type: "string" },
              code:     { type: "string" },
              meaning:  { type: ["string", "null"] },
              severity: { type: "string", enum: ["MINOR", "MODERATE", "MAJOR"] },
            },
            required: ["location", "code", "severity"],
          },
        },
        equipment_translated:    { type: "array", items: { type: "string" } },
        sales_points:            { type: "array", items: { type: "string" } },
        caution_notes:           { type: "array", items: { type: "string" }, description: "注意事項 — translated to English. Apply glossary: スレ=scuff, ガタ=looseness, キズ=scratch, ヘコミ/凹み=dent, サビ=rust, 小/中/大=minor/moderate/major." },
        inspector_notes:         { type: "array", items: { type: "string" } },
        mechanical_notes:        { type: "array", items: { type: "string" } },
        modification_notes:      { type: "array", items: { type: "string" } },
        recycling_deposit_jpy:   { type: ["integer", "null"] },
        body_type:               { type: ["string", "null"], description: "形状 field: raw code exactly as printed — 3D, 2D, OP, CP, SD, HB, SW. Do NOT translate to English." },
        door_count:              { type: ["integer", "null"], description: "Only if explicitly printed (e.g. '3D'=3, '2D'=2). Do NOT infer from body type or model name." },
        drivetrain:              { type: ["string", "null"], enum: [null, "2WD", "4WD", "AWD", "FF", "FR", "MR", "RR"], description: "Only if explicitly printed in 駆動 field. Do NOT assume." },
        seating_capacity:        { type: ["integer", "null"], description: "乗車定員 — only if explicitly printed." },
        overall_assessment:      { type: ["string", "null"] },
        field_confidence: {
          type: "object",
          description: "Per-field confidence: 'high' (clearly legible), 'medium' (readable, some uncertainty), 'low' (difficult to read). Include every non-null extracted field.",
          additionalProperties: { type: "string", enum: ["high", "medium", "low"] },
        },
        confidence:              { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["make", "model", "confidence"],
    },
  },
};

// Spec §5.1 + §8.1: pass-1 system/user prompts live in
// prompts/sheet_parsing*.txt. The verify/pass-3/extraction prompts below
// remain inline because they're implementation details of our multi-pass
// pipeline (not spec-mandated prompts) and the spec only calls out one
// "sheet_parsing" prompt file in §5.1.
const PASS1_SYSTEM = loadPrompt("sheet_parsing.system");
const PASS1_PROMPT = loadPrompt("sheet_parsing");


// ══════════════════════════════════════════════════════════════
// PASS 2: BLIND VERIFICATION (error-prone fields)
// ══════════════════════════════════════════════════════════════

const VERIFY_SYSTEM = "Read the auction sheet carefully and answer the question.";

// Ultra-simple prompts — less text = more vision attention = better OCR accuracy.
// Claude.ai and ChatGPT read this sheet correctly with simple prompts.
// Our verbose prompts were stealing attention from the image.

// The odometer on a Japanese auction sheet is almost always a row of
// 6 or 7 individual digit boxes (one box per digit), read left-to-right.
// Claude's #1 error here is SKIPPING LEADING ZEROS — reading "045032"
// as 45032, or reading "000089" as 89. The prompt explicitly forces
// per-box reporting to pull attention onto every box including empty
// leading zeros. Also distinguishes km (standard) from miles (import).
const VERIFY_MILEAGE_PROMPT = `Read the odometer / mileage field (走行 / 走行距離) on this Japanese auction sheet with FORENSIC precision.

The mileage is displayed as a row of numeric digit boxes — typically 6 or 7 boxes. Each box contains exactly one digit (including leading zeros). Report every digit, from leftmost to rightmost, even if a leading box shows 0.

COMMON MISTAKES TO AVOID:
- Do NOT drop leading zeros. "045032" is FORTY-FIVE THOUSAND THIRTY-TWO, not 450,320 or 4,503.
- Do NOT confuse the odometer with another number on the sheet (model code, VIN digits, shaken date).
- Look for マイル/Miles/Mile/ml near the digit boxes — imported vehicles often show miles, not km.
- If km-vs-miles is genuinely ambiguous, set unit_unclear=true.
- Do NOT convert between units — report the raw digit reading and the unit separately.

Return ONLY valid JSON:
{
  "digit_count": <6 or 7 or whatever you see>,
  "digits": "<string of every digit left-to-right including leading zeros, e.g. '045032'>",
  "raw_reading": <integer — the raw number from the digit boxes exactly as printed>,
  "mileageKm": <integer — same as raw_reading (do NOT convert miles to km)>,
  "unit_read": "<'km' | 'miles' | 'unclear'>",
  "unit_unclear": <true only if km-vs-miles is genuinely ambiguous on the sheet>,
  "confidence": <0.0-1.0 — lower if any box was smudged or cut off>,
  "field_confidence": "<'high' | 'medium' | 'low'>"
}`;

// Second, independently-worded mileage prompt. Different wording reduces
// correlation between the two reads, which is what makes the triple-read
// majority vote actually useful — if both prompts were identical, failure
// modes would correlate and the vote would be 3-way agreement on a wrong
// answer.
const VERIFY_MILEAGE_PROMPT_B = `Read the number shown in the mileage digit boxes on this auction sheet.

The mileage boxes are a row of small squares, each holding a single digit. Start from the LEFTMOST box — do not skip it even if it shows 0. Concatenate every digit in order to form the mileage.

Worked example: boxes contain (left→right) 0, 4, 5, 0, 3, 2 → mileage = 45,032 km (seventeen-thousand is wrong; four hundred fifty thousand three hundred twenty is also wrong).

Return ONLY valid JSON:
{"digits_read_left_to_right": "<e.g. 045032>", "mileageKm": <integer>, "confidence": <0.0-1.0>}`;

// Returns era_letter + era_number as SEPARATE fields so the cross-validator
// can rebuild year_era as "H24" rather than concatenating undefined values.
// Showa support added — pre-1989 classics carry 昭和 dates (S63 = 1988).
const VERIFY_YEAR_PROMPT = `What year was this vehicle first registered? Read the 年式 or 初度登録年月 field carefully.

Japanese-era conversion:
- 昭和 / S (Showa, 1926-1989): Western year = era_number + 1925. Example: S63 = 1988, S55 = 1980.
- 平成 / H (Heisei, 1989-2019): Western year = era_number + 1988. Example: H24 = 2012, H31 = 2019.
- 令和 / R (Reiwa, 2019-present): Western year = era_number + 2018. Example: R1 = 2019, R5 = 2023.

Bounds:
- Showa era number must be 1-64
- Heisei era number must be 1-31
- Reiwa era number must be 1-${new Date().getFullYear() - 2018}

Return ONLY valid JSON:
{
  "era_letter": "S" | "H" | "R",
  "era_number": <integer>,
  "era_combined": "<e.g. H24, R5, S63>",
  "western_year": <integer — result of the conversion>,
  "calculation": "<show the math, e.g. 'H24: 24 + 1988 = 2012'>",
  "confidence": <0.0-1.0>
}`;

const VERIFY_COLOR_PROMPT = `What is the exterior color (外色) and color code number (カラーNo.) on this auction sheet? Return JSON: {"japanese_text": "<exact Japanese text>", "color_english": "<English>", "color_code": "<3-digit number or null>", "confidence": <0.0-1.0>}`;

const VERIFY_VIN_PROMPT = `Find the chassis number (車台No.) on this Japanese auction sheet. This is the full 17-character VIN — NOT the shorter model code (型式, typically prefixed CBA-/DBA-/ABA-/LDA-). A valid VIN has exactly 17 characters using A–H, J–N, P, R–Z, 0–9. Read every character — do not stop early. Common prefixes: Mercedes=WDB/WDC/WDD/WDF, Porsche=WP0/WP1, Ferrari=ZFF, Lamborghini=ZHW, Bentley=SCB, Aston Martin=SCF, Rolls-Royce=SCA, McLaren=SBM, Jaguar=SAJ, Range Rover=SAL, BMW=WBS/WBA/WBY, Audi=WAU. Return JSON: {"vin": "<exactly 17 characters>", "model_code": "<型式 separately if visible>", "confidence": <0.0-1.0>}`;

// Drive side (ハンドル / 左・右) was an uncorroborated Pass-1 read and
// live-test showed it can be wrong on hand-filled sheets where 左 is
// circled / checkmarked in a way the model misinterprets. Adding this
// second, focused pass converts it from silent-wrong to consensus-
// checked (agree → 0.97 confidence; disagree → flagged).
const VERIFY_DRIVE_SIDE_PROMPT = `Find the steering-wheel side (ハンドル / 左・右) on this Japanese auction sheet.

The field shows two options — 左 (left) and 右 (right) — with ONE visibly selected.
Selection markers vary by auction house. Any of these indicates the SELECTED option:
- circled: ○左 or ○右, or 左 with a circle drawn around it
- BRACKETED: [左] or [右]  — SQUARE BRACKETS INDICATE SELECTION, NOT crossing out
- underlined
- highlighted / boxed
- tick / checkmark next to the character
- bolder / thicker printing than the unselected option

IMPORTANT: On USS / TAA sheets, the selected option is often typeset inside SQUARE BRACKETS. Do NOT interpret brackets as cancellation — they are the selection marker. "[左]・右" means LHD; "左・[右]" means RHD.

Mapping:
- 左 selected → LHD (left-hand drive)
- 右 selected → RHD (right-hand drive)

If neither side has a visible marker, or the marker is genuinely ambiguous, report "unclear" and set confidence below 0.5.

Return ONLY valid JSON:
{
  "marked_character": "<'左' | '右' | 'unclear'>",
  "marker_type": "<'brackets' | 'circle' | 'underline' | 'highlight' | 'checkmark' | 'bold' | 'unclear'>",
  "drive_side": "<'LHD' | 'RHD' | 'unclear'>",
  "reasoning": "<one short sentence explaining why>",
  "confidence": <0.0-1.0>
}`;

// The overall grade drives every downstream verdict (BUY / REVIEW / PASS)
// more than any other single field. Worth a dedicated verification call.
// Note: S is the top tier (spec §2.1 = 6.5). Lower grades often shown
// with 0.5-step increments (e.g. 4.5). R / RA indicate accident history
// and are returned separately — do NOT fold R into the numeric grade.
const VERIFY_GRADE_PROMPT = `Find the overall auction grade (評価点 / 外部評価 / 総合評価) on this Japanese auction sheet.

Grading scale (top → bottom):
- S  = concours / showroom (rare; often shown as a circled S)
- 6  = exceptional, excellent-original
- 5  = very good
- 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1  = stepwise down; 4 is typical for good-condition vehicles
- R or RA = accident history (repair record / 修復歴). Report this in accident_indicator, NOT as a numeric grade.

The grade is usually shown large, near the condition/damage section. Do NOT confuse it with the interior grade (内装 = A/B/C/D) — that's a separate letter. Do NOT confuse S with 5.

Return ONLY valid JSON:
{
  "grade_raw": "<exact character(s) printed: S | 6 | 5 | 4.5 | 3.5 | R | RA | ...>",
  "grade_numeric": <float 1.0-6.0 or 6.5 for S; null if R/RA/unreadable>,
  "interior_grade": "<A | B | C | D | null>",
  "accident_indicator": <true if grade is R/RA, false if visibly no accident mark, null if unclear>,
  "confidence": <0.0-1.0>
}`;

// ══════════════════════════════════════════════════════════════
// PASS 3: DEEP DAMAGE MAP ANALYSIS
// ══════════════════════════════════════════════════════════════

const PASS3_SYSTEM = "You are an expert auction vehicle damage assessor. Your specialty is reading panel damage diagrams on Japanese auction inspection sheets with forensic precision.";

const PASS3_PROMPT = `Focus EXCLUSIVELY on the PANEL DAMAGE DIAGRAM / BODY MAP on this auction sheet.

This is the vehicle outline drawing with damage codes written on or near each panel. Read EVERY single code with its exact panel location.

PANEL LOCATIONS (map codes to these standard names):
- front_bumper, hood, roof, windshield, rear_glass
- left_front_fender, right_front_fender
- left_front_door, right_front_door
- left_rear_door, right_rear_door (if applicable — coupes may not have these)
- left_rear_quarter, right_rear_quarter
- trunk/tailgate, rear_bumper
- left_side_skirt, right_side_skirt
- left_headlight, right_headlight
- left_mirror, right_mirror
- floor/undercarriage (if noted)
- pillars (A/B/C pillars if noted)

DAMAGE CODES TO LOOK FOR:
A1/A2/A3 = scratches (small/medium/large)
U1/U2/U3 = dents (small/medium/large)
W1/W2/W3 = repair traces (small/obvious/large)
S1/S2/S3 = rust (light/medium/heavy)
X/XX = crack/large crack, X1 = chip, RX = cracked
P = replaced panel, PP = non-genuine replacement
H = hole, Y = paint waviness (respray indicator)
C1/C2 = corrosion, B1/B2/B3 = marks
E1/E2/E3 = dent with paint damage, M = missing, T = tear/cut
F = fire damage

STRUCTURAL ANALYSIS:
After listing all damage codes, assess whether any damage suggests:
1. Frame/structural damage (codes on pillars, floor, quarter panels — especially W2, W3, P on structural areas)
2. Previous collision repair (clusters of W codes on one side)
3. Respray (Y codes indicating paint waviness)
4. Flood/water damage (widespread rust or corrosion patterns)

Return ONLY valid JSON:
{
  "total_damage_points": <count of all damage codes found on the diagram>,
  "damage_codes": [
    {"panel": "exact panel name", "code": "A2", "meaning": "Scratch", "severity": "MINOR|MODERATE|MAJOR", "is_structural": false}
  ],
  "clean_panels": ["panel names with NO damage codes"],
  "damaged_panels": ["panel names WITH damage codes"],
  "structural_concern": <true|false>,
  "structural_reasoning": "<explanation if structural_concern is true, or null>",
  "respray_detected": <true|false>,
  "respray_panels": ["panels with Y codes or W codes suggesting respray"],
  "worst_damage": {"panel": "<most damaged panel>", "code": "<worst code>", "severity": "MAJOR"},
  "damage_distribution": "<SYMMETRIC (both sides) | LEFT_BIASED | RIGHT_BIASED | FRONT_BIASED | REAR_BIASED | SCATTERED | CLEAN>",
  "estimated_repair_cost_category": "<NONE|LOW|MEDIUM|HIGH|VERY_HIGH>",
  "confidence": <0.0-1.0>
}`;

// ══════════════════════════════════════════════════════════════
// CROSS-VALIDATION & ANOMALY DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Pick the most common value from an array of readings using majority vote.
 * Returns { value, votes, total } or null if no readings.
 */
/**
 * Normalize the Claude.ai clean-schema output to our internal field names.
 * Handles both the new clean schema and the old verbose schema (backward compat).
 */
function normalizePass1Output(raw) {
  // If it already uses our internal field names (old schema), return as-is
  if (raw.mileage_reading !== undefined || raw.overall_grade !== undefined) return raw;

  // Map Claude.ai clean schema → internal fields
  const ai = raw.auction_info || {};
  const vb = raw.vehicle_basic || {};
  const reg = raw.registration || {};
  const cond = raw.condition || {};
  const insp = raw.inspector_notes || {};
  const dmg = raw.damage_diagram || {};
  const fin = raw.financials || {};
  const dim = raw.dimensions || {};

  // Normalize whitespace in identifier-like strings — SL550 vs "SL 550"
  // vs "SL-550" are the same trim level; collapse internal whitespace so
  // downstream equality checks (and the snake_case API shape) don't fail
  // on cosmetic formatting.
  const compactIdent = (s) => {
    if (!s || typeof s !== "string") return s;
    const trimmed = s.trim();
    // Collapse whitespace inside alphanumeric runs: "SL 550" → "SL550",
    // but keep legitimate word separations ("GT R", "488 GTB") intact.
    // Heuristic: collapse only when a single whitespace is sandwiched
    // between a letter and a digit (or vice versa).
    return trimmed.replace(/([A-Za-z])\s+(\d)/g, "$1$2").replace(/(\d)\s+([A-Za-z])/g, "$1$2");
  };

  return {
    auction_house: ai.auction_house || null,
    lot_number: ai.lot_number || null,
    auction_date: ai.auction_date || null,

    make: vb.make || null,
    model: compactIdent(vb.model) || null,
    grade: compactIdent(vb.grade_trim || vb.grade) || null,
    model_code: vb.chassis_code || vb.model_code || null,
    vin: reg.chassis_number || null,
    displacement_cc: vb.displacement_cc ? parseInt(vb.displacement_cc) : null,
    displacement_liters: vb.displacement_cc ? `${(parseInt(vb.displacement_cc) / 1000).toFixed(1)}L` : null,
    door_count: vb.doors ? parseInt(vb.doors) : null,
    seating_capacity: vb.seating_capacity ? parseInt(vb.seating_capacity) : null,

    year: reg.first_registration_year ? parseInt(reg.first_registration_year) : null,
    year_month: reg.first_registration_month ? parseInt(reg.first_registration_month) : null,
    year_calculation: null, // not provided in clean schema

    mileage_reading: cond.odometer_km ? parseInt(String(cond.odometer_km).replace(/,/g, "")) : null,
    transmission: vb.transmission === "AT" ? "AUTOMATIC" : vb.transmission === "MT" ? "MANUAL" : (TRANSMISSION_CODES[vb.transmission] || vb.transmission || null),
    fuel_type: FUEL_CODES[vb.fuel_type] || vb.fuel_type || null,
    drive_side: vb.steering === "Left" ? "LHD" : vb.steering === "Right" ? "RHD" : (vb.steering || null),

    exterior_color: cond.exterior_color || null,
    exterior_color_japanese: cond.exterior_color_japanese || null,
    color_code: cond.color_code || null,
    interior_color: cond.interior_color || null,
    color_changed: false,

    overall_grade: cond.auction_grade ? parseFloat(cond.auction_grade) : null,
    interior_grade: cond.interior_grade || null,
    interior_aux_grade: cond.interior_aux_grade || null,
    import_type: reg.import_type || null,
    shaken_expiry: reg.inspection_expiry_year ? `${reg.inspection_expiry_year}-${String(reg.inspection_expiry_month || 1).padStart(2, "0")}` : null,

    accident_history: cond.auction_grade === "R" || cond.auction_grade === "RA" ? true : null,
    service_book_present: null,
    one_owner: null,
    registration_plate: reg.registration_plate || null,
    dimensions: (dim.length_cm || dim.width_cm || dim.height_cm) ? {
      length_mm: dim.length_cm ? parseInt(dim.length_cm) * 10 : (dim.length_mm ? parseInt(dim.length_mm) : null),
      width_mm:  dim.width_cm  ? parseInt(dim.width_cm)  * 10 : (dim.width_mm  ? parseInt(dim.width_mm)  : null),
      height_mm: dim.height_cm ? parseInt(dim.height_cm) * 10 : (dim.height_mm ? parseInt(dim.height_mm) : null),
    } : null,

    // Panel conditions from damage diagram
    panel_conditions: null,
    damage_codes: (dmg.locations || []).map((d) => ({
      location: d.location || "unknown",
      code: d.code || "?",
      meaning: DAMAGE_CODES[d.code]?.en || d.code || "Unknown",
      severity: DAMAGE_CODES[d.code]?.severity || "MODERATE",
      structural: false,
    })),

    equipment_notes: raw.features || [],
    equipment_translated: raw.features || [],
    sales_points: [],
    caution_notes: insp.damage_items || [],
    inspector_notes: insp.raw_notes ? [insp.raw_notes] : [],
    mechanical_notes: [],
    modification_notes: [],

    start_price_jpy: null,
    sold_price_jpy: null,
    recycling_deposit_jpy: fin.recycle_fee_jpy ? parseInt(String(fin.recycle_fee_jpy).replace(/,/g, "")) : null,

    overall_assessment: raw.notes || null,
    confidence: 0.85,

    // Preserve raw output for debugging
    _raw_pass1: raw,
  };
}

function majorityVote(readings) {
  const valid = readings.filter((r) => r != null);
  if (valid.length === 0) return null;
  const counts = {};
  for (const v of valid) {
    const key = String(v);
    counts[key] = (counts[key] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { value: valid.find((v) => String(v) === sorted[0][0]), votes: sorted[0][1], total: valid.length };
}

/**
 * World Manufacturer Identifier (WMI) — first 3 chars of every 17-char VIN.
 * Used to distinguish 車台No. (VIN, 17 chars, starts with a brand WMI) from
 * 型式 (model code, typically 6–10 chars prefixed CBA-/DBA-/ABA-).
 */
export const VIN_WMI_PATTERNS = {
  "Mercedes-Benz": /^WD[BCDF]/,
  "Mercedes-AMG":  /^WD[BCDF]/,
  Porsche:         /^WP[01]/,
  Ferrari:         /^ZFF/,
  Lamborghini:     /^ZHW/,
  Bentley:         /^SCB/,
  "Aston Martin":  /^SCF/,
  "Rolls-Royce":   /^SCA/,
  McLaren:         /^SBM/,
  Maserati:        /^ZAM/,
  "Alfa Romeo":    /^ZAR/,
  Jaguar:          /^SAJ/,
  "Range Rover":   /^SAL/,
  "Land Rover":    /^SAL/,
  BMW:             /^WB[ASY4]/,
  "BMW M":         /^WB[SY]/,
  Audi:            /^WAU/,
  Bugatti:         /^VF9/,
  Lotus:           /^SCC/,
};

/**
 * Validate a VIN/chassis number against expected brand patterns.
 *
 * A valid VIN is always exactly 17 characters using A–H, J–N, P, R–Z, 0–9
 * (I, O, Q are excluded to avoid digit confusion). Anything shorter is
 * almost certainly the 型式 (model code) being misread as the chassis No.
 *
 * Returns { valid, clean, reason }.
 *   - valid=true + clean=<17-char VIN> if it matches
 *   - valid=false + reason=<why> if it doesn't
 *   - null if input is empty
 */
export function validateVin(vin, make) {
  if (!vin || typeof vin !== "string") return null;
  const clean = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();

  if (clean.length !== 17) {
    return {
      valid: false,
      clean,
      reason: `VIN must be exactly 17 chars, got ${clean.length} ("${clean}"). This is almost certainly the 型式 (model code) being mis-read as the 車台No. (chassis number).`,
    };
  }

  if (make) {
    for (const [brand, pattern] of Object.entries(VIN_WMI_PATTERNS)) {
      if (make === brand || make.includes(brand.split("-")[0]) || brand.includes(make.split("-")[0])) {
        if (!pattern.test(clean)) {
          return {
            valid: false,
            clean,
            reason: `VIN prefix "${clean.substring(0, 3)}" does not match ${make} WMI pattern ${pattern}.`,
          };
        }
        return { valid: true, clean };
      }
    }
  }

  return { valid: true, clean };
}

/**
 * Cross-validate fields from multiple passes to detect inconsistencies.
 * Uses MAJORITY VOTE (2-of-3 or 3-of-3) instead of blind trust.
 * Returns merged result with per-field confidence and anomaly flags.
 */
function crossValidate(pass1, pass2Mileage, pass2MileageB, pass2Year, pass2Color, pass2ColorB, pass2Vin, pass3Damage, pass2Grade, pass2DriveSide, pass2ZoneMileage) {
  const anomalies = [];
  const fieldConfidence = {};

  // ── Zone-cropped mileage extractor (highest-priority mileage signal) ──
  // When the zone extractor achieved 2+ model consensus on its own, trust
  // that over the whole-sheet triple-read. The zone extractor sees digit
  // boxes at ~250 px tall vs the whole-sheet read at ~15 px, so its
  // per-digit OCR is categorically more reliable.
  let zoneMileageAccepted = false;
  if (pass2ZoneMileage && pass2ZoneMileage.mileage_km != null) {
    const zoneAgree = pass2ZoneMileage.agreement || "";
    // Accept:
    //   3-of-3 / 2-of-3 model consensus on the zoomed crop (highest quality)
    //   1-of-3-zone-unit-corrected — only one model read the crop, but the
    //     locator's unit marker resolved ambiguity → still more reliable
    //     than whole-sheet triple-read at 15 px per digit.
    if (zoneAgree.startsWith("3-of-3")
        || zoneAgree.startsWith("2-of-3")
        || zoneAgree.startsWith("unit-majority")
        || zoneAgree === "1-of-3-zone-unit-corrected"
        || zoneAgree === "1-of-3-zone") {
      pass1.mileage_reading = pass2ZoneMileage.mileage_km;
      if (pass2ZoneMileage.mileage_unit) {
        pass1.mileage_unit = pass2ZoneMileage.mileage_unit;
      }
      pass1._mileage_zone_extraction = {
        value: pass2ZoneMileage.mileage_km,
        unit: pass2ZoneMileage.mileage_unit || "km",
        agreement: pass2ZoneMileage.agreement,
        confidence: pass2ZoneMileage.confidence,
        rationale: pass2ZoneMileage.rationale,
        zoneUnit: pass2ZoneMileage.zone?.unitVisible,
      };
      fieldConfidence.mileage = pass2ZoneMileage.confidence;
      anomalies.push({
        field: "mileage",
        type: "ZONE_CROP_CONSENSUS",
        value: pass2ZoneMileage.mileage_km,
        agreement: pass2ZoneMileage.agreement,
        resolution: `Zone-cropped multi-model read achieved ${pass2ZoneMileage.agreement}. ${pass2ZoneMileage.rationale}`,
      });
      zoneMileageAccepted = true;
    }
  }

  // ── Mileage cross-check: TRIPLE READ + MAJORITY VOTE ──
  // Skipped when the zone extractor already produced a high-agreement read.
  if (!zoneMileageAccepted) {
  const mileageReadings = [
    pass1?.mileage_reading,
    pass2Mileage?.mileageKm,
    pass2MileageB?.mileageKm,
  ];
  const mileageVote = majorityVote(mileageReadings);

  if (mileageVote) {
    const allAgree = mileageVote.votes === mileageVote.total;
    const majorityAgree = mileageVote.votes >= 2;

    if (allAgree) {
      fieldConfidence.mileage = 0.98;
    } else if (majorityAgree) {
      fieldConfidence.mileage = 0.90;
      if (pass1.mileage_reading !== mileageVote.value) {
        anomalies.push({
          field: "mileage",
          type: "MAJORITY_CORRECTION",
          readings: mileageReadings.filter(Boolean),
          winner: mileageVote.value,
          votes: `${mileageVote.votes}/${mileageVote.total}`,
          resolution: "Majority vote correction applied",
        });
      }
    } else {
      // All three disagree — flag as LOW confidence and route to human.
      // Fallback strategy (in priority order):
      //   1. Prefer a read that explicitly identified its unit (km/miles).
      //      A read that saw "マイル" and did the ×1.60934 conversion is
      //      more trustworthy than one that just reported a number.
      //   2. Prefer the highest individual confidence among Pass-2 reads.
      //   3. Take the MEDIAN of the three to reduce wild-outlier damage.
      fieldConfidence.mileage = 0.30;

      const unitAware = [pass2Mileage, pass2MileageB].find(
        (p) => p?.mileageKm && (p.unit_read === "km" || p.unit_read === "miles")
      );

      let fallback = null;
      if (unitAware) {
        fallback = unitAware.mileageKm;
      } else {
        const bestPass = (pass2Mileage?.confidence || 0) >= (pass2MileageB?.confidence || 0) ? pass2Mileage : pass2MileageB;
        fallback = bestPass?.mileageKm ?? null;
      }

      // Sanity: if fallback is >500,000 km it's almost certainly wrong —
      // use the median of the three reads as a last-ditch guess.
      const nums = mileageReadings.filter((n) => typeof n === "number" && n > 0).sort((a, b) => a - b);
      const median = nums.length ? nums[Math.floor(nums.length / 2)] : null;
      if (fallback == null || fallback > 500_000) {
        fallback = median;
      }

      if (fallback != null) {
        pass1.mileage_reading = fallback;
      }

      anomalies.push({
        field: "mileage",
        type: "NO_CONSENSUS",
        readings: mileageReadings.filter(Boolean),
        unitAwareUsed: !!unitAware,
        fallbackStrategy: unitAware ? "unit-aware" : (median === fallback ? "median" : "highest-confidence"),
        resolution: "⚠ NO MAJORITY — all 3 reads disagree. Mileage requires HUMAN VERIFICATION. " +
                    (unitAware ? "Used unit-aware read as fallback." : median === fallback ? "Used median as fallback." : "Used highest-confidence read."),
        humanVerificationRequired: true,
      });
      // Store all readings so the UI can show them for manual selection
      pass1._mileage_all_readings = mileageReadings.filter(Boolean);
    }
    pass1.mileage_reading = mileageVote.votes >= 2 ? mileageVote.value : pass1.mileage_reading;

    // Build digit string from the winning verification pass
    const winningPass = pass2Mileage?.mileageKm === mileageVote.value ? pass2Mileage
      : pass2MileageB?.mileageKm === mileageVote.value ? pass2MileageB : null;
    if (winningPass) {
      pass1.mileage_digits = `${winningPass.digit_1}-${winningPass.digit_2}-${winningPass.digit_3}-${winningPass.digit_4}-${winningPass.digit_5}${winningPass.digit_6 != null ? `-${winningPass.digit_6}` : ""}`;
      pass1.mileage_digit_count = winningPass.box_count;
    }
  } else {
    fieldConfidence.mileage = pass1?.mileage_reading ? 0.60 : 0.0;
  }
  } // end if (!zoneMileageAccepted)

  // ── Year cross-check with PLAUSIBILITY GUARD ──
  // Don't let verification override a correct Pass 1 when verification misreads the era number
  if (pass1?.year && pass2Year?.western_year) {
    if (pass1.year === pass2Year.western_year) {
      fieldConfidence.year = 0.97;
    } else {
      // Plausibility check: if Pass 1 has a valid calculation string that shows correct math,
      // and the verification result is implausible (e.g., year < 2000 for a modern luxury car),
      // keep Pass 1's year
      const pass1Plausible = pass1.year >= 2000 && pass1.year <= new Date().getFullYear() + 1;
      const pass2Plausible = pass2Year.western_year >= 2000 && pass2Year.western_year <= new Date().getFullYear() + 1;
      const pass1HasValidCalc = pass1.year_calculation && /\d+\s*\+\s*\d+\s*=\s*\d+/.test(pass1.year_calculation);

      // Rebuild year_era from Pass-2 components if present, else fall back
      // to the combined string the prompt now also emits. The old code
      // silently produced "undefinedundefined" when the prompt returned
      // only `era` without split components.
      const pass2Era =
        (pass2Year.era_letter && pass2Year.era_number != null)
          ? `${pass2Year.era_letter}${pass2Year.era_number}`
          : (pass2Year.era_combined || pass2Year.era || null);

      if (pass1Plausible && !pass2Plausible) {
        // Pass 1 is plausible, verification is not — keep Pass 1
        anomalies.push({
          field: "year",
          type: "VERIFICATION_REJECTED",
          pass1Value: pass1.year,
          pass2Value: pass2Year.western_year,
          reason: `Verification result ${pass2Year.western_year} implausible for modern vehicle. Keeping Pass 1 (${pass1.year}).`,
        });
        fieldConfidence.year = 0.80; // Pass 1 was plausible, verification failed
      } else if (!pass1Plausible && pass2Plausible) {
        // Verification is plausible, Pass 1 is not — use verification
        pass1.year = pass2Year.western_year;
        if (pass2Era) pass1.year_era = pass2Era;
        pass1.year_calculation = pass2Year.calculation || pass1.year_calculation;
        fieldConfidence.year = 0.75;
      } else {
        // Both plausible or both implausible — use verification but lower confidence
        anomalies.push({
          field: "year",
          type: "VERIFICATION_MISMATCH",
          pass1Value: pass1.year,
          pass2Value: pass2Year.western_year,
          pass2Calculation: pass2Year.calculation,
          resolution: pass1HasValidCalc ? "Keeping Pass 1 (has valid calculation)" : "Using verification",
        });
        if (!pass1HasValidCalc) {
          pass1.year = pass2Year.western_year;
          if (pass2Era) pass1.year_era = pass2Era;
          pass1.year_calculation = pass2Year.calculation || pass1.year_calculation;
        }
        fieldConfidence.year = 0.55;
      }
    }
  } else {
    fieldConfidence.year = pass1?.year ? 0.75 : 0.0;
  }

  // ── Color cross-check: SHEET TEXT WINS, code lookup is reference ──
  // PRIORITY ORDER (reversed from earlier behaviour):
  // 1. What the sheet literally says — if the sheet prints "パール"
  //    (Pearl), exterior_color = "Pearl". This matches both ChatGPT and
  //    claude.ai reference extractions, and is a more faithful
  //    rendering than substituting the manufacturer marketing name.
  // 2. Manufacturer code lookup is exposed separately as
  //    exterior_color_catalog (e.g. code 799 → "Diamond White Bright").
  //    Useful reference, but not a replacement for the sheet reading.
  // 3. If the sheet reading disagrees with the catalog on COLOR FAMILY
  //    (white vs silver vs grey), raise a CODE_COLOR_MISMATCH anomaly so
  //    the operator can check — without silently overwriting anything.
  // 4. If no sheet reading is available at all, fall back to the catalog.

  const colorCode = pass1?.color_code || pass2Color?.color_code || pass2ColorB?.color_code;
  const catalogName = lookupColorByCode(pass1?.make, colorCode);
  const jpText = pass1?.exterior_color_japanese
    || pass2Color?.japanese_text
    || pass2ColorB?.japanese_text
    || null;

  // Always expose the catalog name as a reference field.
  if (catalogName) pass1.exterior_color_catalog = catalogName;
  if (colorCode) pass1.color_code = colorCode;

  const colorReadings = [
    pass1?.exterior_color,
    pass2Color?.color_english,
    pass2ColorB?.color_english,
  ].filter(Boolean);
  const normalizeColor = (c) => c?.toLowerCase().replace(/[\s\-_]/g, "") || "";

  // Step 1: determine the sheet's color via majority vote if we have ≥2 reads.
  let sheetColor = null;
  if (colorReadings.length >= 2) {
    const colorGroups = {};
    for (const c of colorReadings) {
      const norm = normalizeColor(c);
      if (!colorGroups[norm]) colorGroups[norm] = { original: c, count: 0 };
      colorGroups[norm].count++;
    }
    const sorted = Object.values(colorGroups).sort((a, b) => b.count - a.count);
    const winner = sorted[0];
    if (winner.count >= 2) {
      sheetColor = winner.original;
      fieldConfidence.color = winner.count === colorReadings.length ? 0.92 : 0.80;
    } else {
      // No majority — still take pass1 but flag low confidence
      sheetColor = pass1?.exterior_color || winner.original;
      fieldConfidence.color = 0.55;
      anomalies.push({
        field: "exterior_color",
        type: "NO_CONSENSUS",
        readings: colorReadings,
        resolution: "No majority among color reads — using Pass 1 reading, verify manually.",
      });
    }
  } else if (colorReadings.length === 1) {
    sheetColor = colorReadings[0];
    fieldConfidence.color = 0.65;
  }

  // Step 2: commit the sheet's reading as the primary color.
  if (sheetColor) {
    pass1.exterior_color = sheetColor;

    // Step 3: cross-check against the catalog — raise anomaly on family mismatch,
    // but DO NOT overwrite the sheet text.
    if (catalogName) {
      const sheetFamily = colorFamily(jpText) || colorFamily(sheetColor);
      const catalogFamily = colorFamily(catalogName);
      if (sheetFamily && catalogFamily && sheetFamily !== catalogFamily) {
        anomalies.push({
          field: "exterior_color",
          type: "CODE_COLOR_MISMATCH",
          sheetColor,
          sheetJapanese: jpText,
          sheetFamily,
          colorCode,
          catalogName,
          catalogFamily,
          resolution: `Sheet says ${sheetFamily} ("${jpText || sheetColor}") but code ${colorCode} = ${catalogFamily} ("${catalogName}"). Sheet reading retained; verify whether code digits or reference table is wrong.`,
          humanVerificationRequired: true,
        });
        fieldConfidence.color = Math.min(fieldConfidence.color ?? 0.55, 0.55);
      }
    }
  } else if (catalogName) {
    // No sheet reading at all — fall back to the manufacturer catalog.
    pass1.exterior_color = catalogName;
    fieldConfidence.color = 0.70;
    anomalies.push({
      field: "exterior_color",
      type: "CATALOG_FALLBACK",
      colorCode,
      catalogName,
      resolution: `Sheet color text unreadable — used catalog lookup (code ${colorCode} = "${catalogName}"). Verify against photos if possible.`,
    });
  } else {
    fieldConfidence.color = pass1?.exterior_color ? 0.55 : 0.0;
  }

  const colorChanged = pass2Color?.color_changed || pass2ColorB?.color_changed;
  if (colorChanged) {
    pass1.color_changed = true;
    anomalies.push({ field: "color_changed", type: "ALERT", message: "Vehicle has been repainted (色替 detected)" });
  }

  // ── VIN validation (Mercedes-specific pattern check) ──
  if (pass1?.vin && pass1?.make) {
    const result = validateVin(pass1.vin, pass1.make);
    if (result) {
      if (!result.valid) {
        // Most common failure: agent returned the 型式 (model code, 6–10
        // chars) instead of the 17-char chassis number. Clear the field
        // so downstream code (missing-fields UI, verification pass) can
        // recover it.
        const verifyVin = pass2Vin?.vin && pass2Vin.vin !== pass1.vin;
        anomalies.push({
          field: "vin",
          type: "INVALID_VIN",
          original: pass1.vin,
          cleaned: result.clean,
          make: pass1.make,
          reason: result.reason,
          resolution: verifyVin
            ? `Replacing with VERIFY_VIN pass result "${pass2Vin.vin}".`
            : "Cleared — requires HUMAN VERIFICATION. VIN must be exactly 17 chars starting with the brand's WMI.",
          humanVerificationRequired: !verifyVin,
        });
        pass1.vin = verifyVin ? pass2Vin.vin : null;
        fieldConfidence.vin = verifyVin ? 0.75 : 0.0;
      } else if (result.clean !== pass1.vin) {
        anomalies.push({
          field: "vin",
          type: "FORMAT_CORRECTION",
          original: pass1.vin,
          corrected: result.clean,
          resolution: `VIN cleaned (stripped invalid chars / case-normalized) and validated against ${pass1.make} WMI pattern.`,
        });
        pass1.vin = result.clean;
        fieldConfidence.vin = 0.95;
      } else {
        fieldConfidence.vin = 0.95;
      }
    }
  } else if (pass2Vin?.vin) {
    // Pass 1 didn't catch a VIN but the verification pass did
    const result = validateVin(pass2Vin.vin, pass1?.make);
    if (result && result.valid) {
      pass1.vin = result.clean;
      fieldConfidence.vin = 0.85;
    }
  }

  // ── Drive-side cross-check (Pass 1 vs dedicated drive-side pass) ──
  // Policy: when Pass 1 and the verification pass DISAGREE, do NOT silently
  // overwrite. Both reads are single-shot LLM judgments on the same image;
  // there is no principled way to pick a winner. Flag the field, drop
  // confidence, and let the downstream "sheetValidationFailed" guardrail
  // force REVIEW. Silent overwriting (which we originally did) produces
  // worse outcomes than leaving Pass 1 visible and flagged.
  if (pass2DriveSide) {
    const p1ds = pass1?.drive_side ? String(pass1.drive_side).toUpperCase() : null;
    const p2ds = pass2DriveSide.drive_side
      ? String(pass2DriveSide.drive_side).toUpperCase()
      : null;
    const p2Conf = pass2DriveSide.confidence || 0;

    if (p1ds && p2ds && p2ds !== "UNCLEAR" && p1ds !== "UNCLEAR") {
      if (p1ds === p2ds) {
        fieldConfidence.drive_side = 0.97;
      } else {
        // Disagreement — keep Pass 1, flag, drop confidence so the
        // global sheet-confidence drops and guardrails engage.
        anomalies.push({
          field: "drive_side",
          type: "DRIVE_SIDE_DISAGREEMENT",
          pass1Value: p1ds,
          pass2Value: p2ds,
          pass2MarkedChar: pass2DriveSide.marked_character,
          pass2Reasoning: pass2DriveSide.reasoning,
          pass2Confidence: p2Conf,
          resolution: "Drive-side readings disagree. Keeping Pass 1 but flagging for human verification.",
          humanVerificationRequired: true,
        });
        fieldConfidence.drive_side = 0.45;
      }
    } else if (p2ds && p2ds !== "UNCLEAR" && !p1ds) {
      // Pass 1 missed it, fill from verification — only case where we
      // accept the verification read unilaterally.
      pass1.drive_side = p2ds;
      fieldConfidence.drive_side = 0.78;
    } else if (p1ds) {
      fieldConfidence.drive_side = 0.70;
    }
  } else if (pass1?.drive_side) {
    fieldConfidence.drive_side = 0.65;
  }

  // ── Damage cross-check (Pass 1 vs Pass 3) ──
  if (pass3Damage) {
    const p1Codes = pass1?.damage_codes || [];
    const p3Codes = pass3Damage.damage_codes || [];

    // Pass 3 (focused damage read) takes precedence for damage details
    if (p3Codes.length > p1Codes.length) {
      pass1.damage_codes = p3Codes;
      anomalies.push({
        field: "damage_codes",
        type: "ENRICHMENT",
        message: `Deep damage analysis found ${p3Codes.length} codes vs ${p1Codes.length} in initial pass`,
      });
    }

    // Merge structural analysis
    pass1._structural_concern = pass3Damage.structural_concern || false;
    pass1._structural_reasoning = pass3Damage.structural_reasoning || null;
    pass1._respray_detected = pass3Damage.respray_detected || false;
    pass1._respray_panels = pass3Damage.respray_panels || [];
    pass1._damage_distribution = pass3Damage.damage_distribution || null;
    pass1._worst_damage = pass3Damage.worst_damage || null;
    pass1._repair_cost_category = pass3Damage.estimated_repair_cost_category || null;
    pass1._clean_panels = pass3Damage.clean_panels || [];

    fieldConfidence.damage = Math.max(pass3Damage.confidence || 0.7, 0.80);
  } else {
    fieldConfidence.damage = pass1?.damage_codes?.length ? 0.65 : 0.5;
  }

  // ── Accident history vs damage codes consistency ──
  const accidentFlag = pass1?.accident_history;
  const hasStructuralRepair = (pass1?.damage_codes || []).some((d) => {
    const isStructural = STRUCTURAL_PANELS.some((sp) => d.panel?.includes(sp) || d.location?.includes(sp));
    const isRepairCode = ["W2", "W3", "P", "PP"].includes(d.code);
    return isStructural && isRepairCode;
  });

  if (accidentFlag === true && !hasStructuralRepair && !pass1._structural_concern) {
    pass1.accident_contradiction = "Accident history marked YES (修復歴有) but no structural repair codes found in damage diagram. Possible frame repair not visible on surface, or minor repair categorized as accident.";
    anomalies.push({
      field: "accident_history",
      type: "CONTRADICTION",
      message: "修復歴=有 but no structural repair codes found",
    });
  } else if (accidentFlag === false && (hasStructuralRepair || pass1._structural_concern)) {
    pass1.accident_contradiction = "Accident history marked NO (修復歴無) but structural repair indicators found in damage diagram. This is a RED FLAG — possible undisclosed accident repair.";
    anomalies.push({
      field: "accident_history",
      type: "RED_FLAG",
      message: "修復歴=無 but structural repair codes detected — possible undisclosed accident",
    });
  } else {
    pass1.accident_contradiction = null;
  }

  // ── Era-math auto-correction ──
  // If year_era is present and yields a VALID era number (H1-31, R1-current,
  // S1-64), its arithmetic is closed-form. A disagreement with year means
  // `year` was misread (most common: a 2-year typo). Prefer the era-derived
  // value — it's math, not OCR, and can't be wrong if the era string parsed.
  if (pass1?.year_era && pass1?.year) {
    const m = String(pass1.year_era).toUpperCase().match(/^([SHR])\s*(\d{1,2})/);
    if (m) {
      const base = { S: 1925, H: 1988, R: 2018 }[m[1]];
      const eraNum = parseInt(m[2], 10);
      const maxEra = { S: 64, H: 31, R: Math.max(1, new Date().getFullYear() - 2018) }[m[1]];
      if (base && eraNum >= 1 && eraNum <= maxEra) {
        const eraDerivedYear = base + eraNum;
        if (eraDerivedYear !== pass1.year) {
          anomalies.push({
            field: "year",
            type: "ERA_MATH_CORRECTION",
            sheetYear: pass1.year,
            eraDerivedYear,
            era: pass1.year_era,
            resolution: `year_era=${pass1.year_era} (${m[1] === "S" ? "Showa" : m[1] === "H" ? "Heisei" : "Reiwa"}) implies ${eraDerivedYear}, but the year field read as ${pass1.year}. Era math wins (closed-form arithmetic over valid era number).`,
          });
          pass1.year = eraDerivedYear;
          fieldConfidence.year = 0.88;
        }
      }
    }
  }

  // ── Grade verification cross-check (Pass 1 vs dedicated grade pass) ──
  // Accepts Pass 1 when Pass 2 agrees or is silent. Lowers confidence
  // when they disagree; trusts Pass 2 when Pass 1 was null. Also handles
  // the R / RA accident marker — that's not a numeric grade.
  if (pass2Grade) {
    const p1g = typeof pass1?.overall_grade === "number" ? pass1.overall_grade : null;
    const p2gRaw = typeof pass2Grade.grade_raw === "string" ? pass2Grade.grade_raw.toUpperCase().trim() : null;
    const p2gNumeric = typeof pass2Grade.grade_numeric === "number" ? pass2Grade.grade_numeric : null;

    // R / RA = accident marker, not a grade.
    if (p2gRaw === "R" || p2gRaw === "RA") {
      pass1.accident_history = true;
      anomalies.push({
        field: "accident_history",
        type: "GRADE_R_DETECTED",
        message: "Grade verification pass read R/RA — forcing accident_history=true.",
      });
      // Don't overwrite a numeric grade if Pass 1 had one; the R marker
      // exists alongside, but for scoring we still need the number.
      if (p1g != null) fieldConfidence.overall_grade = Math.max(fieldConfidence.overall_grade ?? 0.7, 0.7);
    } else if (p2gNumeric != null && p1g != null) {
      if (Math.abs(p2gNumeric - p1g) < 0.1) {
        fieldConfidence.overall_grade = 0.97;
      } else {
        anomalies.push({
          field: "overall_grade",
          type: "GRADE_DISAGREEMENT",
          pass1Value: p1g,
          pass2Value: p2gNumeric,
          pass2Raw: p2gRaw,
          resolution: `Pass 2 dedicated grade read disagrees with Pass 1. Averaging to ${((p1g + p2gNumeric) / 2).toFixed(2)}; verify manually.`,
          humanVerificationRequired: true,
        });
        // When Pass 2 confidence is notably higher, prefer Pass 2.
        if ((pass2Grade.confidence || 0) > 0.80) {
          pass1.overall_grade = p2gNumeric;
          fieldConfidence.overall_grade = 0.65;
        } else {
          fieldConfidence.overall_grade = 0.55;
        }
      }
    } else if (p2gNumeric != null && p1g == null) {
      // Pass 1 missed the grade; fill from Pass 2.
      pass1.overall_grade = p2gNumeric;
      fieldConfidence.overall_grade = 0.78;
    } else if (p1g != null) {
      fieldConfidence.overall_grade = 0.75;
    }

    // Interior grade corroboration — A/B/C/D single letter.
    if (pass2Grade.interior_grade && !pass1.interior_grade) {
      pass1.interior_grade = pass2Grade.interior_grade;
      fieldConfidence.interior_grade = 0.78;
    } else if (pass2Grade.interior_grade && pass1.interior_grade && pass2Grade.interior_grade !== pass1.interior_grade) {
      anomalies.push({
        field: "interior_grade",
        type: "DISAGREEMENT",
        pass1Value: pass1.interior_grade,
        pass2Value: pass2Grade.interior_grade,
        resolution: "Pass 1 / Pass 2 disagree on A/B/C/D interior grade — verify manually.",
      });
      fieldConfidence.interior_grade = 0.55;
    }
  } else if (pass1?.overall_grade != null) {
    fieldConfidence.overall_grade = 0.70;
  }

  // ── Grade vs condition consistency ──
  if (pass1?.overall_grade) {
    const majorDamageCount = (pass1.damage_codes || []).filter((d) => d.severity === "MAJOR").length;
    if (pass1.overall_grade >= 4.5 && majorDamageCount > 2) {
      anomalies.push({
        field: "grade_vs_damage",
        type: "INCONSISTENCY",
        message: `High grade (${pass1.overall_grade}) with ${majorDamageCount} MAJOR damage codes — verify grade reading`,
      });
    }
    if (pass1.overall_grade <= 3 && majorDamageCount === 0) {
      anomalies.push({
        field: "grade_vs_damage",
        type: "INCONSISTENCY",
        message: `Low grade (${pass1.overall_grade}) with no MAJOR damage codes — may indicate mechanical issues not visible on panel map`,
      });
    }
  }

  // ── Service history inference ──
  let serviceHistoryIndicator = "UNKNOWN";
  if (pass1?.service_book_present === true) {
    const hasFullDealerNotes = (pass1.sales_points || []).some((s) =>
      /dealer|ディーラー|full.*service|記録簿.*有/i.test(s)
    );
    serviceHistoryIndicator = hasFullDealerNotes ? "FULL_DEALER" : "PARTIAL_DEALER";
  } else if (pass1?.service_book_present === false) {
    serviceHistoryIndicator = "UNKNOWN";
  }
  pass1.service_history_indicator = serviceHistoryIndicator;

  return { merged: pass1, anomalies, fieldConfidence };
}

/**
 * Enrich damage codes with data from our reference database.
 */
function enrichDamageCodes(codes) {
  if (!Array.isArray(codes)) return [];
  return codes.map((d) => {
    const ref = DAMAGE_CODES[d.code];
    return {
      ...d,
      location: d.location || d.panel || "unknown",
      meaning: ref?.en || d.meaning || d.code,
      severity: ref?.severity || d.severity || "MODERATE",
      category: ref?.category || "unknown",
      tuvRelevant: ref?.tuvRelevant || false,
      structural: d.is_structural || d.structural || false,
    };
  });
}

/**
 * Compute damage severity score (0-10 scale, 0=pristine, 10=totaled).
 */
function computeDamageSeverityScore(damageCodes) {
  if (!damageCodes || damageCodes.length === 0) return 0;
  const weights = { MINOR: 0.5, MODERATE: 1.5, MAJOR: 3.0 };
  const total = damageCodes.reduce((sum, d) => sum + (weights[d.severity] || 1), 0);
  return Math.min(10, Number((total * 0.8).toFixed(1)));
}

// ══════════════════════════════════════════════════════════════
// MAIN PIPELINE: parseAuctionSheet
// ══════════════════════════════════════════════════════════════

/**
 * Parse a Japanese auction inspection sheet using multi-pass Claude Vision extraction.
 *
 * @param {{data: string, mediaType: string}} image - Base64 encoded auction sheet
 * @param {object} [opts] - Options
 * @param {boolean} [opts.skipVerification=false] - Skip Pass 2 blind verification
 * @param {boolean} [opts.skipDamageDeep=false] - Skip Pass 3 deep damage analysis
 * @param {boolean} [opts.quickMode=false] - Single-pass only (fastest, least accurate)
 * @returns {object|null} Parsed sheet data with confidence scores, or null
 */
export async function parseAuctionSheet(rawImage, opts = {}) {
  if (!rawImage) return null;

  const { skipVerification = false, skipDamageDeep = false, quickMode = false } = opts;

  // ── Pre-Pass: image preprocessing (flag-gated) ──
  // When SHEET_PREPROCESS=1, run the raw image through sharp: EXIF
  // auto-rotate, upscale small images, adaptive contrast, light sharpen,
  // PNG output. All downstream passes (Pass 1, 2×6 verifications, Pass 3)
  // consume the SAME preprocessed image so they agree on pixel geometry.
  const preprocessResult = await maybePreprocess(rawImage, opts.forcePreprocess ? { force: true } : {});
  const image = preprocessResult.image;
  if (preprocessResult.preprocessed) {
    console.log(`[sheet-parser] preprocessing applied: ${preprocessResult.applied.join(", ")}`);
  }

  // ── Pass 1: Full comprehensive extraction ──
  // Tool-use enforces the schema (no regex-from-text parsing), extended
  // thinking gives the model room to reason through ambiguous OCR, and
  // prompt caching makes the system prompt cheap on subsequent calls.
  //
  // If SHEET_ENSEMBLE=1, Pass-1 routes through a 3-model consensus
  // (Claude + GPT-5 + Gemini via OpenRouter) instead of a single call.
  // Attaches per-field confidence from cross-model agreement — this is
  // the single biggest silent-failure reducer available without training
  // new models. All three vision providers are reachable with the same
  // OPENROUTER_API_KEY we already have.
  const pass1 = ensembleEnabled()
    ? await ensembleExtract(image, { prompt: PASS1_PROMPT, system: PASS1_SYSTEM, maxTokens: 16000 })
    : await callClaudeVision({
        prompt: PASS1_PROMPT,
        images: [image],
        system: PASS1_SYSTEM,
        tools: [AUCTION_SHEET_TOOL],
        toolChoice: { type: "function", function: { name: "record_auction_sheet" } },
        reasoning: { max_tokens: 8000 },
        maxTokens: 16000,
        cacheSystem: true,
      });

  if (!pass1 || typeof pass1 !== "object") return null;

  // ── Normalize: map Claude.ai clean schema → our internal field names ──
  const normalized = normalizePass1Output(pass1);

  // Apply whitespace compaction to identifier-like fields regardless of
  // which extraction path was used. normalizePass1Output returns early
  // for the tool-use path, so we need this here too.
  const compactIdent = (s) => {
    if (!s || typeof s !== "string") return s;
    return s.trim().replace(/([A-Za-z])\s+(\d)/g, "$1$2").replace(/(\d)\s+([A-Za-z])/g, "$1$2");
  };
  if (normalized.model) normalized.model = compactIdent(normalized.model);
  if (normalized.grade) normalized.grade = compactIdent(normalized.grade);

  // Quick mode — return after single pass with basic validation
  if (quickMode) {
    normalized.damage_codes = enrichDamageCodes(normalized.damage_codes);
    normalized._extraction_mode = "quick";
    normalized._passes_completed = 1;
    return validateSheetOutput(normalized);
  }

  // ── Pass 2: Blind verification — TRIPLE mileage + DUAL color + YEAR + VIN + GRADE (all parallel) ──
  let pass2Mileage = null, pass2MileageB = null;
  let pass2Year = null;
  let pass2Color = null, pass2ColorB = null;
  let pass2Vin = null;
  let pass2Grade = null;
  let pass2DriveSide = null;
  let pass2ZoneMileage = null;

  if (!skipVerification) {
    // 8 verification calls in parallel. Drive-side + grade are the two
    // most recent additions — live-testing showed they're fields that
    // silently fail most often on hand-filled sheets.
    const verifyPromises = await Promise.allSettled([
      callClaudeVision({ prompt: VERIFY_MILEAGE_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_MILEAGE_PROMPT_B, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_YEAR_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_COLOR_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: "What color (外色) is this vehicle? Also read the color code number (カラーNo.). Return JSON: {\"color_english\": \"<color>\", \"color_code\": \"<3-digit code>\"}", images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_VIN_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_GRADE_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_DRIVE_SIDE_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 512 }),
    ]);

    pass2Mileage = verifyPromises[0].status === "fulfilled" ? verifyPromises[0].value : null;
    pass2MileageB = verifyPromises[1].status === "fulfilled" ? verifyPromises[1].value : null;
    pass2Year = verifyPromises[2].status === "fulfilled" ? verifyPromises[2].value : null;
    pass2Color = verifyPromises[3].status === "fulfilled" ? verifyPromises[3].value : null;
    pass2ColorB = verifyPromises[4].status === "fulfilled" ? verifyPromises[4].value : null;
    pass2Vin = verifyPromises[5].status === "fulfilled" ? verifyPromises[5].value : null;
    pass2Grade = verifyPromises[6].status === "fulfilled" ? verifyPromises[6].value : null;
    pass2DriveSide = verifyPromises[7].status === "fulfilled" ? verifyPromises[7].value : null;

    // Zone-cropped mileage extractor (flag-gated).
    if (zoneExtractorEnabled()) {
      console.log("[sheet-parser] zone-mileage flag ON, attempting extraction...");
      try {
        pass2ZoneMileage = await extractMileageWithZone(image, normalized?.year || null);
        if (pass2ZoneMileage) {
          console.log(`[sheet-parser] zone mileage result: ${pass2ZoneMileage.mileage_km} km, agreement=${pass2ZoneMileage.agreement}, conf=${pass2ZoneMileage.confidence?.toFixed(2)}`);
          if (pass2ZoneMileage.allScores) {
            for (const s of pass2ZoneMileage.allScores) {
              console.log(`  • ${s.model}: ${s.km} km (${Math.round(s.kmPerYr || 0)} km/yr, score ${s.score.toFixed(2)}) — ${s.reason}`);
            }
          } else if (pass2ZoneMileage.reads) {
            for (const r of pass2ZoneMileage.reads) {
              console.log(`  • ${r.name || "?"}: km=${r.mileage_km}, unit=${r.unit}, conf=${r.confidence}`);
            }
          }
          console.log(`  zone bbox: ${JSON.stringify(pass2ZoneMileage.zone?.bbox)}, unitVisible=${pass2ZoneMileage.zone?.unitVisible}`);
        } else {
          console.log("[sheet-parser] zone mileage returned null (locator or crop failed)");
        }
      } catch (e) {
        console.warn("[sheet-parser] zone mileage extractor threw:", e.message);
      }
    }
  }

  // ── VIN zone extraction (parallel with Pass 3) ──
  let pass2ZoneVin = null;
  const vinZonePromise = (!skipVerification && vinExtractorEnabled()) ? (async () => {
    try {
      console.log("[sheet-parser] VIN zone extractor running...");
      pass2ZoneVin = await extractVinWithZone(image, normalized?.make || null);
    } catch (e) {
      console.warn("[sheet-parser] VIN zone extractor threw:", e.message);
    }
  })() : Promise.resolve();

  // ── Pass 3: Deep damage map analysis ──
  let pass3Damage = null;

  if (!skipDamageDeep) {
    try {
      pass3Damage = await callClaudeVision({
        prompt: PASS3_PROMPT,
        images: [image],
        system: PASS3_SYSTEM,
        reasoning: { max_tokens: 6000 },
        maxTokens: 12000,
        cacheSystem: true,
      });
    } catch (e) {
      console.warn("Pass 3 (damage deep) failed:", e.message);
    }
  }

  // Wait for VIN zone extraction to complete (runs parallel with Pass 3)
  await vinZonePromise;

  // ── Cross-validation & merge (majority vote) ──
  const { merged, anomalies, fieldConfidence } = crossValidate(
    normalized, pass2Mileage, pass2MileageB, pass2Year, pass2Color, pass2ColorB, pass2Vin, pass3Damage, pass2Grade, pass2DriveSide, pass2ZoneMileage
  );

  // ── VIN zone override (highest-quality VIN signal) ──
  if (pass2ZoneVin && pass2ZoneVin.vin && pass2ZoneVin.confidence >= 0.75) {
    const zoneVin = pass2ZoneVin.vin;
    if (merged.vin !== zoneVin) {
      console.log(`[sheet-parser] VIN zone override: "${merged.vin}" → "${zoneVin}" (conf=${pass2ZoneVin.confidence}, agreement=${pass2ZoneVin.agreement})`);
      anomalies.push({
        field: "vin",
        type: "ZONE_CROP_OVERRIDE",
        oldValue: merged.vin,
        newValue: zoneVin,
        agreement: pass2ZoneVin.agreement,
        confidence: pass2ZoneVin.confidence,
      });
    }
    merged.vin = zoneVin;
    fieldConfidence.vin = Math.max(fieldConfidence.vin || 0, pass2ZoneVin.confidence);
  }

  // Enrich damage codes with reference database
  merged.damage_codes = enrichDamageCodes(merged.damage_codes);

  // Compute derived metrics
  merged._damage_severity_score = computeDamageSeverityScore(merged.damage_codes);
  merged._tuv_relevant_damage = merged.damage_codes.filter((d) => d.tuvRelevant);
  merged._anomalies = anomalies;
  merged._field_confidence = fieldConfidence;
  merged._extraction_mode = "full";
  merged._passes_completed = 1 + (skipVerification ? 0 : 1) + (skipDamageDeep ? 0 : 1);
  merged._preprocessing = preprocessResult.preprocessed
    ? {
        applied: preprocessResult.applied,
        inputWidth: preprocessResult.meta?.width,
        outputWidth: preprocessResult.outMeta?.width,
        warning: preprocessResult.warning || null,
      }
    : null;

  // Per-field provenance labels — downstream UI renders "(Estimated)"
  // next to any field listed here. Absent = directly extracted.
  merged._estimation_labels = buildEstimationLabels(merged, fieldConfidence);

  // Normalize backward-compatible fields
  merged.accident_indicator = merged.accident_history;
  merged.mechanical_notes = merged.mechanical_notes || [];
  merged.modification_notes = merged.modification_notes || [];
  merged.equipment_notes = merged.equipment_translated || merged.equipment_codes || [];
  merged.sales_points = merged.sales_points || [];
  merged.caution_notes = merged.caution_notes || [];

  // Build panel_conditions as flat object (backward compat with real-engine.js)
  if (merged.panel_conditions) {
    // Already present from Pass 1 — merge with Pass 3 damage data
    if (pass3Damage?.damaged_panels) {
      for (const panel of pass3Damage.damaged_panels) {
        const key = panel.replace(/\s+/g, "_").toLowerCase();
        if (merged.panel_conditions[key] === "Clean") {
          // Pass 3 found damage that Pass 1 missed
          const codes = (merged.damage_codes || [])
            .filter((d) => d.location === panel || d.location === key)
            .map((d) => `${d.code}: ${d.meaning}`)
            .join(", ");
          if (codes) merged.panel_conditions[key] = codes;
        }
      }
    }
  }

  return validateSheetOutput(merged);
}

// ══════════════════════════════════════════════════════════════
// EXTRACTION PIPELINE: extractVehicleData
// Used by the extract-data API route (upload flow)
// ══════════════════════════════════════════════════════════════

/** Extraction-specific prompt — returns form-friendly field structure */
const EXTRACTION_PROMPT = `Analyze ALL the provided images carefully and extract every piece of vehicle data you can find.

STRICT RULES:
- EXTRACT ONLY values explicitly printed on the sheet. Never infer or guess.
- If a field is not present → null. If present but unreadable → "uncertain".
- Do NOT assume values from common knowledge (e.g. do NOT assume door count or drivetrain from model name).
- PRESERVE ORIGINAL UNITS — if mileage shows マイル/Miles, report the raw number and set mileageUnit="miles". Do NOT convert.
- Report per-field confidence in fieldConfidence: "high" / "medium" / "low".
- Never fabricate color codes, VIN characters, dates, or specs you cannot clearly read.

For JAPANESE AUCTION SHEETS — SCAN THE ENTIRE SHEET for these Japanese labels:

YEAR CONVERSION (初度登録年月 / 年式):
- HEISEI (平成/H): H + 1988 = Western year (H24=2012, H28=2016, H30=2018)
- REIWA (令和/R): R + 2018 = Western year (R1=2019, R3=2021, R5=2023)
- SHOWA (昭和/S): S + 1925 = Western year

BRAND NAMES (車名 in katakana):
メルセデスAMG = Mercedes-AMG, メルセデス ベンツ / メルセデス・ベンツ = Mercedes-Benz,
フェラーリ = Ferrari, ポルシェ = Porsche, ランボルギーニ = Lamborghini,
ベントレー = Bentley, アストンマーチン = Aston Martin, ジャガー = Jaguar,
マセラティ = Maserati, ロールスロイス = Rolls-Royce, マクラーレン = McLaren,
レンジローバー = Range Rover, アウディ = Audi, ロータス = Lotus,
アルファロメオ = Alfa Romeo, BMW = BMW

FIELDS TO FIND:
- 車名 = brand (make), モデル / model-name = base model (e.g. "GT"), グレード = trim + edition (e.g. "S 130th Anniversary Edition")
- 出品番号 / Lot No. = lotNumber, 開催場 / 会場 = auctionHouse (USS/TAA/JU/HAA/CAA/AUCNET/etc.)
- 排気量 = displacement cc, 型式 = model code (chassis code, NOT VIN)
- 走行 = mileage (digit boxes — read ALL digits left to right). CHECK for マイル/Miles next to digit boxes — if present, unit is "miles" (imported vehicles often show miles)
- シフト = transmission (AT=AUTOMATIC, MT=MANUAL, CVT, DCT, PDK, SMG)
- 駆動 / 駆動方式 = drivetrain (2WD / 4WD / AWD)
- ドア / 形状 = doorCount + bodyType (e.g. "3D" = 3-door, "2D" = 2-door, "coupe"/"sedan"/"SUV")
- 乗車定員 / 定員 = seatingCapacity (integer)
- 外色/色 = exterior color in Japanese (preserve verbatim; translate for exteriorColor), カラーNo. = color code
- 色替 / 色変 / arrow (→) next to color = colorChanged (true if repainted)
- 燃料 = fuel (ガソリン=PETROL), ハンドル = steering (左=LHD, 右=RHD)
- 評価点 = grade number (1-6, S), 内装 = interior grade LETTER (A/B/C/D, NOT color)
- 内装補助 = interior aux grade (A/B/C/D, optional)
- 修復歴 = accident (有=Yes, 無=No)
- 輸入 / 輸入区分 = importType (Dealer / Individual / Auction / etc.)
- 車台No. = chassis/VIN (17 chars), 登録No. = registration plate (e.g. "杉並 300 た 8546"), 車検 = shaken expiry (YYYY-MM-DD when day present)
- 長さ/幅/高さ = length/width/height (mm; sheets may print cm — convert ×10)
- リサイクル預託金 = recycling deposit (JPY)
- 装備 = equipment codes (array: SR, AW, PS, PW, AB, TV, ナビ, etc.)
- セールスポイント = sales points (array, translated)
- 注意事項 = caution/modification notes (array, translated with inspector glossary)
- 検査員 / 車両状態 / inspector remarks = inspector notes (array, translated)

CRITICAL RULES:
1. Read 排気量 EXACTLY from sheet, do NOT guess from model.
2. H24 = 2012 (NOT 2024). Use H + 1988. R + 2018.
3. Translate ALL Japanese text to English.
4. 内装 grade (A/B/C/D) is condition, NOT color.
5. Read 車名 field EXACTLY. メルセデスAMG="Mercedes-AMG", メルセデスベンツ="Mercedes-Benz". Do NOT change make based on the grade/model — only report what 車名 prints.
6. グレード / edition: preserve multi-digit anniversary numerals. "130th Anniversary" must NOT be shortened to "10th" or "30th". Read the full number.
7. Interior color: preserve two-tone strings with "/" separator. "ブラック/ホワイト" → "Black/White". Never collapse a two-tone interior to a single color.
8. Inspector abbreviations: スレ = scuff, ガタ = looseness, キズ = scratch, ヘコミ/凹み = dent, サビ = rust, 小/中/大 = minor/moderate/major. "シートハンドル小スレ" = "minor scuff on seat handle" (NOT "looseness").
9. 車台No. (VIN) is EXACTLY 17 characters using A–H, J–N, P, R–Z, 0–9 — never return anything shorter. It is DIFFERENT from 型式 (model code, 6–10 chars prefixed CBA-/DBA-/ABA-/LDA-). Brand WMI prefixes: Mercedes=WDB/WDC/WDD/WDF, Porsche=WP0/WP1, Ferrari=ZFF, Lamborghini=ZHW, Bentley=SCB, Aston Martin=SCF, BMW=WBS/WBA/WBY, Audi=WAU, Jaguar=SAJ, Range Rover=SAL. If unsure, scan every row labelled 車台 and copy the full 17-character string.
10. Exterior color: return what the SHEET literally says in "exteriorColor" (e.g. if it says パール, put "Pearl" — do NOT substitute the manufacturer catalog name like "Diamond White Bright"). Put the verbatim Japanese text in exteriorColorJapanese.
11. Grade vs model: "model" is the base model name (e.g. "GT"). "grade" is the trim + edition (e.g. "S 130th Anniversary Edition"). Split them — do NOT merge "model" and "grade" into one field.
12. MILES DETECTION: Look for マイル/Miles/Mile/ml near the mileage digit boxes. Imported vehicles often show miles. If found, set mileageUnit="miles" and report the RAW digit reading — do NOT convert to km.
13. VOID GRADE: If the grade box shows 無効 (void/invalid), set auctionGrade=null. This is common in 事故・現状コーナー (accident/as-is) sheets.
14. COLOR CHANGE: If 外色 shows "レッド→クロ" (arrow between colors), the car was repainted. Report the ORIGINAL color (before arrow) and set colorChanged=true.
15. 型式 showing フメイ or 不明 means the model code is unknown — return null.

Return ONLY valid JSON:
{
  "extracted": {
    "make": "<brand or null>",
    "model": "<base model name, e.g. 'GT' — NOT the grade/edition. null if unreadable>",
    "grade": "<trim + edition, e.g. 'S 130th Anniversary Edition'. Preserve full anniversary numerals. null if absent>",
    "modelCode": "<型式, e.g. 'CBA-190378'. null if absent>",
    "year": <4-digit year or null>,
    "displacement": <integer cc from 排気量 field, e.g. 4000, 3000, 5200. Only if printed>,
    "mileageKm": <integer — raw digit reading, regardless of unit>,
    "mileageUnit": "<'km' | 'miles' — check for マイル/Miles near digit boxes; default 'km'>",
    "driveSide": "<LHD/RHD or null>",
    "drivetrain": "<2WD|4WD|AWD or null>",
    "bodyType": "<raw code from 形状 field: 3D, 2D, OP, CP, SD, HB, SW, etc. Report the printed code, not an English word>",
    "doorCount": <integer or null>,
    "seatingCapacity": <integer or null>,
    "askingPriceJpy": <JPY integer or null>,
    "exteriorColor": "<English color matching what the SHEET says, e.g. 'Pearl' if sheet says パール. Do NOT substitute catalog name. null if unreadable>",
    "exteriorColorJapanese": "<exact Japanese characters from sheet, verbatim, or null>",
    "colorCode": "<3-digit / alphanumeric color code or null>",
    "colorChanged": <true if 色替/色変/→ arrow next to color indicates repaint, else false, else null>,
    "interiorColor": "<interior color/material, PRESERVE '/' for two-tone (e.g. 'Black/White'), or null>",
    "interiorGrade": "<A|B|C|D or null>",
    "interiorAuxGrade": "<A|B|C|D or null>",
    "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG or null>",
    "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC or null>",
    "auctionGrade": <grade number 1-6, S=6.5, or null if R/RA/無効/void>,
    "accidentHistory": <true/false/null>,
    "serviceBookPresent": <true if 保証書付/新車整備手帳 shows 有, false if 無, null if unclear>,
    "importType": "<Dealer|Individual|Auction|etc., or null>",
    "vin": "<17-character chassis/VIN. null if cannot read full 17 chars — do NOT return the model code here>",
    "registrationPlate": "<登録No., verbatim with kanji (e.g. '杉並 300 た 8546'), or null>",
    "shakenExpiry": "<YYYY-MM-DD if day is visible, else YYYY-MM, or null>",
    "dimensions": {"length_mm": <integer or null>, "width_mm": <integer or null>, "height_mm": <integer or null>},
    "lotNumber": "<auction lot number, or null>",
    "auctionHouse": "<USS|TAA|JU|HAA|CAA|AUCNET|etc., or null>",
    "recyclingDepositJpy": <integer or null>,
    "featureCodes": ["<equipment codes translated, e.g. 'Sunroof', 'Alloy Wheels', 'Navigation', 'Leather Seats', 'Airbag'>"],
    "salesPoints": ["<each セールスポイント bullet, translated, as a separate array entry>"],
    "modifications": ["<each aftermarket/modification note, translated>"],
    "cautionNotes": ["<each 注意事項 item, translated with inspector glossary applied>"],
    "inspectorNotes": ["<free-form inspector remarks, translated>"],
    "specificationNotes": "<short catch-all for anything not covered above; can be empty>",
    "fieldConfidence": {
      "<fieldName>": "<'high' | 'medium' | 'low' — for every non-null extracted field>"
    }
  },
  "summary": "<2-3 sentence description>"
}`;

/**
 * Extract vehicle data from uploaded images (auction sheets + photos).
 * Used by the extract-data API route. Runs full extraction + blind verification.
 *
 * @param {Array<{data: string, mediaType: string}>} images - Base64 encoded images
 * @returns {object} { extracted, summary, verified }
 */
export async function extractVehicleData(rawImages) {
  if (!rawImages || rawImages.length === 0) {
    throw new Error("No images provided for extraction");
  }

  // ── Pre-Pass: preprocess every uploaded image in parallel ──
  // Upload flow ingests auction sheets, service booklets, photos — run
  // them all through the same pipeline so the downstream extraction sees
  // uniformly enhanced images.
  const images = await Promise.all(rawImages.map(async (img) => {
    const r = await maybePreprocess(img);
    return r.image;
  }));

  // ── Pass 1: Full extraction ──
  const result = await callClaudeVision({
    prompt: EXTRACTION_PROMPT,
    images,
    system: PASS1_SYSTEM,
    reasoning: { max_tokens: 6000 },
    maxTokens: 12000,
    cacheSystem: true,
  });

  if (!result || typeof result !== "object" || !result.extracted) {
    throw new Error("Could not extract data from images");
  }

  const extracted = result.extracted;

  // ── Pass 2: Blind verification of error-prone fields ──
  const hasAuctionSheet = extracted.mileageKm || extracted.auctionGrade || extracted.year;

  if (hasAuctionSheet) {
    const [mileageV, colorV, yearV, vinV] = await Promise.allSettled([
      callClaudeVision({ prompt: VERIFY_MILEAGE_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_COLOR_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_YEAR_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_VIN_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
    ]);

    // Apply mileage correction
    if (mileageV.status === "fulfilled" && mileageV.value?.mileageKm) {
      const verified = mileageV.value.mileageKm;
      if (verified !== extracted.mileageKm) {
        console.log(`MILEAGE CORRECTED: ${extracted.mileageKm} → ${verified}`);
        extracted.mileageKm = verified;
      }
      // Propagate the unit detection from verification pass — preserve original unit
      if (mileageV.value.unit_read === "miles" || mileageV.value.unit_read === "km") {
        extracted.mileageUnit = mileageV.value.unit_read;
      }
      // If verification saw miles, use the raw_reading (not the converted mileageKm)
      if (mileageV.value.unit_read === "miles" && mileageV.value.raw_reading) {
        extracted.mileageKm = mileageV.value.raw_reading;
      }
    }
    if (!extracted.mileageUnit) {
      extracted.mileageUnit = extracted.mileageUnit || "km";
    }

    // Apply color correction
    if (colorV.status === "fulfilled" && colorV.value?.color_english) {
      const verified = colorV.value.color_english;
      if (verified !== extracted.exteriorColor) {
        console.log(`COLOR CORRECTED: "${extracted.exteriorColor}" → "${verified}"`);
        extracted.exteriorColor = verified;
      }
      if (colorV.value.color_code) {
        extracted.specificationNotes = extracted.specificationNotes
          ? `${extracted.specificationNotes}, Color code: ${colorV.value.color_code}`
          : `Color code: ${colorV.value.color_code}`;
      }
      if (colorV.value.color_changed) {
        extracted.specificationNotes = extracted.specificationNotes
          ? `${extracted.specificationNotes}, Vehicle has been repainted (色替)`
          : "Vehicle has been repainted (色替)";
      }
    }

    // Apply year correction WITH PLAUSIBILITY GUARD
    if (yearV.status === "fulfilled" && yearV.value?.western_year) {
      const verified = yearV.value.western_year;
      if (verified !== extracted.year) {
        const extractedPlausible = extracted.year >= 2000 && extracted.year <= new Date().getFullYear() + 1;
        const verifiedPlausible = verified >= 2000 && verified <= new Date().getFullYear() + 1;
        if (extractedPlausible && !verifiedPlausible) {
          // Keep extracted — verification result implausible
          console.log(`YEAR KEPT: ${extracted.year} (verification ${verified} implausible)`);
        } else {
          console.log(`YEAR CORRECTED: ${extracted.year} → ${verified}`);
          extracted.year = verified;
        }
      }
    }

    // Apply VIN correction — a 17-char VIN from the verification pass
    // ALWAYS beats a shorter value from Pass 1 (the most common Pass-1
    // failure is returning the 型式 / model code in place of the VIN).
    if (vinV.status === "fulfilled" && vinV.value?.vin) {
      const verifiedVin = String(vinV.value.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
      const current = extracted.vin ? String(extracted.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase() : "";
      const verifyIs17 = verifiedVin.length === 17;
      const currentIs17 = current.length === 17;
      if (verifyIs17 && !currentIs17) {
        console.log(`VIN CORRECTED: "${extracted.vin || "(empty)"}" → "${verifiedVin}"`);
        extracted.vin = verifiedVin;
      } else if (verifyIs17 && currentIs17 && verifiedVin !== current) {
        console.log(`VIN CONFLICT: pass1="${current}", verify="${verifiedVin}" — keeping verification (more careful read)`);
        extracted.vin = verifiedVin;
      } else if (verifyIs17) {
        extracted.vin = verifiedVin;
      }
      // If the verification separately read the model code, surface it
      if (vinV.value.model_code && !extracted.modelCode) {
        extracted.modelCode = String(vinV.value.model_code).trim();
      }
    }

    // Post-verification VIN validation: if after all corrections we still
    // have a non-17-char value, clear it so missing-fields UI recovers it
    if (extracted.vin) {
      const v = String(extracted.vin).replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
      if (v.length !== 17) {
        console.log(`VIN REJECTED: "${extracted.vin}" is ${v.length} chars, not 17 — cleared for human verification`);
        extracted.vin = null;
      } else {
        extracted.vin = v;
      }
    }
  }

  // Normalize auction grade.
  // Spec §2.1: the Japanese auction scale is 1.0-6.0 *plus* an S grade
  // that sits ABOVE 6. S is an independent tier, not an alias for 6 —
  // a concours-quality S vehicle is noticeably better than a grade-6
  // vehicle. Per our own validation rule, S = 6.5 so it sorts above
  // 6.0 numerically while staying inside the normalized float range.
  if (extracted.auctionGrade != null) {
    const g = String(extracted.auctionGrade).toUpperCase().trim();
    if (g === "S") {
      extracted.auctionGrade = 6.5;
    } else if (g === "R" || g === "RA") {
      // R / RA grades indicate accident history — they're a separate
      // axis, not a numeric grade. Null out and set accident_history.
      extracted.auctionGrade = null;
      extracted.accidentHistory = true;
    } else {
      extracted.auctionGrade = parseFloat(g) || null;
    }
  }

  // Manufacturer catalog-name lookup — kept as REFERENCE only. The sheet's
  // own text (e.g. "Pearl" from パール) is authoritative in exteriorColor.
  // The catalog name goes into exteriorColorCatalog for cross-reference.
  const codeForLookup = extracted.colorCode
    || (extracted.specificationNotes || "").match(/Color code:\s*([A-Za-z0-9]{2,4})/i)?.[1]
    || null;
  if (codeForLookup && extracted.make) {
    const catalogName = lookupColorByCode(extracted.make, codeForLookup);
    if (catalogName) {
      extracted.exteriorColorCatalog = catalogName;
      // If the sheet reading is totally missing, fall back to the catalog name.
      if (!extracted.exteriorColor) {
        console.log(`COLOR CATALOG FALLBACK: ${codeForLookup} = "${catalogName}"`);
        extracted.exteriorColor = catalogName;
      }
    }
  }

  // ── Defensive-stack merge ──
  // extractVehicleData originally ran a single whole-sheet prompt for speed.
  // But that path skipped the zone-mileage extractor, post-validation, VIN
  // check-digit, and reality constraints — which means the UI's review
  // screen could show demonstrably-wrong data (e.g. 35,433 km instead of
  // 137,565 km because the odometer digit boxes got misread).
  //
  // Fix: run the FULL parseAuctionSheet pipeline on the primary image and
  // merge its fields with confidence-weighted preference. This converts the
  // upload flow to use the same defensive stack as the valuation flow, so
  // whatever the user sees on the review screen is the same quality that
  // would drive a BUY verdict.
  try {
    const primaryImage = images[0];
    const deepParsed = await parseAuctionSheet(primaryImage);
    if (deepParsed && typeof deepParsed === "object") {
      // Map parseAuctionSheet's internal field names → extractVehicleData's
      // UI-friendly field names. parseAuctionSheet values win for fields it
      // extracts with the zone/ensemble/post-validation stack.
      const mapIfBetter = (uiKey, deepValue, predicate = (v) => v != null && v !== "") => {
        if (predicate(deepValue)) {
          extracted[uiKey] = deepValue;
        }
      };
      mapIfBetter("mileageKm", deepParsed.mileage_reading, (v) => typeof v === "number" && v > 0);
      mapIfBetter("mileageUnit", deepParsed.mileage_unit);
      mapIfBetter("year", deepParsed.year, (v) => typeof v === "number" && v >= 1990);
      mapIfBetter("yearEra", deepParsed.year_era);
      mapIfBetter("auctionGrade", deepParsed.overall_grade, (v) => typeof v === "number" && v > 0);
      mapIfBetter("interiorGrade", deepParsed.interior_grade);
      // VIN: only overwrite if deep-parse value is exactly 17 chars AND
      // passes the WMI check. Otherwise keep whatever the upload read.
      if (deepParsed.vin && typeof deepParsed.vin === "string") {
        const cleanVin = deepParsed.vin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
        if (cleanVin.length === 17) {
          extracted.vin = cleanVin;
        }
      }
      // Shaken era-math has been applied inside parseAuctionSheet.
      mapIfBetter("shakenExpiry", deepParsed.shaken_expiry);
      mapIfBetter("driveSide", deepParsed.drive_side);
      mapIfBetter("transmission", deepParsed.transmission);
      mapIfBetter("fuelType", deepParsed.fuel_type);
      mapIfBetter("lotNumber", deepParsed.lot_number);
      mapIfBetter("auctionHouse", deepParsed.auction_house);
      mapIfBetter("modelCode", deepParsed.model_code);
      mapIfBetter("displacement", deepParsed.displacement_cc);
      mapIfBetter("accidentHistory", deepParsed.accident_history, (v) => typeof v === "boolean");
      mapIfBetter("registrationPlate", deepParsed.registration_plate);
      mapIfBetter("colorCode", deepParsed.color_code);
      mapIfBetter("bodyType", deepParsed.body_type);
      mapIfBetter("serviceBookPresent", deepParsed.service_book_present, (v) => typeof v === "boolean");
      mapIfBetter("doorCount", deepParsed.door_count, (v) => typeof v === "number" && v >= 1);

      // Color: prefer the MORE SPECIFIC name over generic truncation.
      // "Pearl White" > "White"; "Selenite Grey Metallic" > "Grey".
      const prefFromSpec = (a, b) => {
        if (!a) return b;
        if (!b) return a;
        return String(b).length > String(a).length ? b : a;
      };
      extracted.exteriorColor = prefFromSpec(extracted.exteriorColor, deepParsed.exterior_color);
      if (deepParsed.exterior_color_japanese) extracted.exteriorColorJapanese = deepParsed.exterior_color_japanese;
      extracted.interiorColor = prefFromSpec(extracted.interiorColor, deepParsed.interior_color);

      // Carry over the defensive diagnostics so downstream can render
      // "confirm these" badges for anything parseAuctionSheet flagged.
      extracted._deepParseAnomalies = Array.isArray(deepParsed._anomalies) ? deepParsed._anomalies : [];
      extracted._deepParseFieldConfidence = deepParsed._field_confidence || {};
      extracted._deepParseValidation = deepParsed._validation || null;
      extracted._preprocessingApplied = deepParsed._preprocessing || null;
    }
  } catch (e) {
    console.warn("[extract] deep parseAuctionSheet merge failed, continuing with lightweight extraction:", e.message);
  }

  // ── Model/grade reassembly ──
  // Pass 1 sometimes splits a compact model name like "SL550" into
  // model="SL" + grade="550" because the sheet prints "SL 550" with a
  // space separator. Detect: short model (≤3 chars) + digit-prefixed grade
  // = probably split. Reassemble and clear grade since 550 isn't a trim.
  if (extracted.model && extracted.grade) {
    const modelCompact = String(extracted.model).trim();
    const gradeStr = String(extracted.grade).trim();
    const isShortModel = modelCompact.length <= 3 && /^[A-Za-z]+$/.test(modelCompact);
    const gradeStartsWithDigits = /^\d{2,4}\b/.test(gradeStr);
    if (isShortModel && gradeStartsWithDigits) {
      const digitPart = gradeStr.match(/^(\d{2,4})/)[1];
      const rest = gradeStr.slice(digitPart.length).trim();
      extracted.model = modelCompact + digitPart;        // "SL" + "550" = "SL550"
      extracted.grade = rest || null;                    // anything after (e.g. "AMG", "Edition") stays as grade
      console.log(`[extract] model/grade reassembled: "${modelCompact}"+"${digitPart}" → "${extracted.model}"${rest ? `, grade="${rest}"` : ", grade cleared"}`);
    }
  }

  // ── Post-normalisation pass ──
  // Apply the calibration-set-learned rules: auction-house location
  // stripping ("USS Tokyo" → "USS"), Mercedes-Benz → Mercedes-AMG when an
  // AMG model code is present, import-type canonicalisation, recycling-
  // deposit plausibility. These are small but high-confidence fixes that
  // eliminate the systematic errors we measured across 6 real sheets.
  const { notes: normaliseNotes } = postNormaliseExtraction(extracted);
  if (normaliseNotes.length > 0) {
    console.log(`[extract] post-normalise: ${normaliseNotes.join(" | ")}`);
  }

  // ── Focused-retry pass ──
  // Before handing back to the UI, check which sheet-derivable fields are
  // still missing and attempt focused per-field reads with a 3-model
  // ensemble. This converts a "we didn't see it, please tell us" question
  // into "we didn't see it on first pass, tried again, got it" success —
  // which is the key UX principle: only ask the user for information that
  // genuinely isn't on the sheet or that we truly couldn't read.
  let initialValidation = validateExtractionOutput({
    extracted,
    summary: result.summary || null,
  });

  if (retryEnabled() && images.length > 0 && initialValidation.missingSheetFields?.length > 0) {
    // Use the first image as the primary sheet — auction sheets are
    // typically the first upload. (Future: run retry against every sheet
    // image and take the first successful read.)
    const primaryImage = images[0];
    const keysToRetry = initialValidation.missingSheetFields.map((f) => f.key);
    console.log(`[extract] retrying ${keysToRetry.length} missing sheet fields: ${keysToRetry.join(", ")}`);

    const retryResults = await retryMissingSheetFields(primaryImage, keysToRetry);

    // Accept any retry result whose confidence clears the threshold.
    const recovered = [];
    const stillMissing = [];
    for (const [key, r] of Object.entries(retryResults)) {
      if (r && r.value !== null && r.confidence >= RETRY_ACCEPT_THRESHOLD) {
        extracted[key] = r.value;
        recovered.push({ key, value: r.value, confidence: r.confidence, votes: r.votes });
      } else {
        stillMissing.push({ key, reason: r ? `low confidence ${(r.confidence * 100).toFixed(0)}% (votes ${r.votes})` : "no retry response" });
      }
    }
    if (recovered.length) console.log(`[extract] recovered ${recovered.length} fields via retry: ${recovered.map((r) => `${r.key}=${JSON.stringify(r.value)} (${r.votes})`).join(", ")}`);
    if (stillMissing.length) console.log(`[extract] still missing after retry (will ask user): ${stillMissing.map((s) => `${s.key} (${s.reason})`).join(", ")}`);

    // Re-apply post-normalise so retry-recovered values are canonicalised too.
    postNormaliseExtraction(extracted);

    // Re-run validation now that retries have populated some fields.
    // Any field still missing goes to the user-ask panels.
    const finalValidation = validateExtractionOutput({
      extracted,
      summary: result.summary || null,
    });
    finalValidation._retryAudit = { recovered, stillMissing };
    return finalValidation;
  }

  return initialValidation;
}
