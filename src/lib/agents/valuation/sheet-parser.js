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
    "787": "Mountain Grey Metallic", "799": "Diamond Silver Metallic",
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

// Clean, proven system prompt — short = more attention on the image
const PASS1_SYSTEM = `You are an expert at reading and extracting data from Japanese vehicle auction sheets (USS, TAA, JU, HAA, etc.).`;

// ─────────────────────────────────────────────────────────────
// LEAN PROMPT — optimized for best OCR through OpenRouter API.
// Tested: this outperforms both our original verbose prompt AND the
// Claude.ai native prompt when routed through OpenRouter.
// Reference databases (colors, damage codes, brands) are applied as
// POST-PROCESSING enrichment, not crammed into the prompt.
// Best with: claude-opus-4 (set in claude.js)
// ─────────────────────────────────────────────────────────────
const PASS1_PROMPT = `Extract ALL data from this Japanese vehicle auction sheet. Return ONLY valid JSON.

RULES:
1. Japanese era years: Heisei (H) + 1988 = AD year. Reiwa (R) + 2018. Example: H24 = 2012.
2. Read odometer digit boxes carefully — note km or miles.
3. Auction grades: S/6 (best) → 1 (worst). R/RA = accident history.
4. Interior grades: A (best) → D (worst).
5. Map damage diagram codes to English panel names.
6. If a field is unreadable, use null.

Return this JSON structure:
{
  "auction_house": null, "lot_number": null,
  "make": "", "model": "", "model_code": "", "vin": "",
  "year": null, "year_era": "", "year_calculation": "",
  "displacement_cc": null,
  "mileage_reading": null, "mileage_digits": "",
  "transmission": "", "fuel_type": "", "drive_side": "",
  "exterior_color": "", "exterior_color_japanese": "", "color_code": "",
  "interior_color": "",
  "overall_grade": null, "interior_grade": "",
  "import_type": "", "accident_history": null,
  "service_book_present": null,
  "panel_conditions": {},
  "damage_codes": [{"location":"","code":"","meaning":"","severity":"MINOR|MODERATE|MAJOR"}],
  "equipment_translated": [],
  "sales_points": [], "caution_notes": [], "inspector_notes": [],
  "mechanical_notes": [], "modification_notes": [],
  "recycling_deposit_jpy": null,
  "overall_assessment": "",
  "confidence": 0.0
}`;


// ══════════════════════════════════════════════════════════════
// PASS 2: BLIND VERIFICATION (error-prone fields)
// ══════════════════════════════════════════════════════════════

const VERIFY_SYSTEM = "Read the auction sheet carefully and answer the question.";

// Ultra-simple prompts — less text = more vision attention = better OCR accuracy.
// Claude.ai and ChatGPT read this sheet correctly with simple prompts.
// Our verbose prompts were stealing attention from the image.

const VERIFY_MILEAGE_PROMPT = `What is the exact mileage (走行) shown on this Japanese auction sheet? Read the digit boxes carefully. Return JSON: {"mileageKm": <number>, "confidence": <0.0-1.0>}`;

const VERIFY_YEAR_PROMPT = `What year was this vehicle first registered? Read the 年式 or 初度登録年月 field. Convert Japanese era: H(平成)+1988, R(令和)+2018. Example: H24=2012. Return JSON: {"era": "<e.g. H24>", "western_year": <number>, "confidence": <0.0-1.0>}`;

const VERIFY_COLOR_PROMPT = `What is the exterior color (外色) and color code number (カラーNo.) on this auction sheet? Return JSON: {"japanese_text": "<exact Japanese text>", "color_english": "<English>", "color_code": "<3-digit number or null>", "confidence": <0.0-1.0>}`;

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

  return {
    auction_house: ai.auction_house || null,
    lot_number: ai.lot_number || null,
    auction_date: ai.auction_date || null,

    make: vb.make || null,
    model: vb.model || vb.grade_trim || null,
    model_code: vb.chassis_code || null,
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
    color_code: cond.color_code || null,
    interior_color: cond.interior_color || null,
    color_changed: false,

    overall_grade: cond.auction_grade ? parseFloat(cond.auction_grade) : null,
    interior_grade: cond.interior_grade || null,
    import_type: reg.import_type || null,
    inspection_expiry: reg.inspection_expiry_year ? `${reg.inspection_expiry_year}-${String(reg.inspection_expiry_month || 1).padStart(2, "0")}` : null,

    accident_history: cond.auction_grade === "R" || cond.auction_grade === "RA" ? true : null,
    service_book_present: null,
    one_owner: null,
    registration_plate: reg.registration_plate || null,

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
 * Validate Mercedes-Benz VIN pattern. Mercedes VINs start with WDB, WDD, WDC, WDF, etc.
 */
function validateMercedesVin(vin) {
  if (!vin || typeof vin !== "string") return null;
  const clean = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
  // Mercedes WMI codes: WDB (pre-2014), WDD (2014+), WDC (SUV), WDF (commercial)
  if (/^WD[BCDF]/.test(clean) && clean.length === 17) return clean;
  // Try common OCR corrections: B↔D, 0↔O, 1↔I
  const corrected = clean.replace(/^WDB/, "WDD").replace(/^WDD/, "WDD");
  if (/^WD[BCDF]/.test(corrected) && corrected.length === 17) return corrected;
  return clean; // return as-is if can't validate
}

/**
 * Cross-validate fields from multiple passes to detect inconsistencies.
 * Uses MAJORITY VOTE (2-of-3 or 3-of-3) instead of blind trust.
 * Returns merged result with per-field confidence and anomaly flags.
 */
function crossValidate(pass1, pass2Mileage, pass2MileageB, pass2Year, pass2Color, pass2ColorB, pass3Damage) {
  const anomalies = [];
  const fieldConfidence = {};

  // ── Mileage cross-check: TRIPLE READ + MAJORITY VOTE ──
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
      // All three disagree — flag as LOW confidence, requires HUMAN VERIFICATION
      fieldConfidence.mileage = 0.30;
      // Pick the reading with highest individual confidence from verification passes
      const bestConf = Math.max(pass2Mileage?.confidence || 0, pass2MileageB?.confidence || 0);
      const bestPass = (pass2Mileage?.confidence || 0) >= (pass2MileageB?.confidence || 0) ? pass2Mileage : pass2MileageB;
      if (bestPass?.mileageKm) {
        pass1.mileage_reading = bestPass.mileageKm;
      }
      anomalies.push({
        field: "mileage",
        type: "NO_CONSENSUS",
        readings: mileageReadings.filter(Boolean),
        resolution: "⚠ NO MAJORITY — all 3 reads disagree. Mileage requires HUMAN VERIFICATION. Using highest-confidence read.",
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
        pass1.year_era = `${pass2Year.era_letter}${pass2Year.era_number}`;
        pass1.year_calculation = pass2Year.calculation;
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
          pass1.year_era = `${pass2Year.era_letter}${pass2Year.era_number}`;
          pass1.year_calculation = pass2Year.calculation;
        }
        fieldConfidence.year = 0.55;
      }
    }
  } else {
    fieldConfidence.year = pass1?.year ? 0.75 : 0.0;
  }

  // ── Color cross-check: MANUFACTURER CODE LOOKUP + MAJORITY VOTE ──
  // PRIORITY ORDER:
  // 1. Manufacturer color code database lookup (highest authority)
  // 2. Majority vote from OCR readings (medium authority)
  // 3. Single OCR reading (lowest authority)

  const colorCode = pass1?.color_code || pass2Color?.color_code || pass2ColorB?.color_code;
  const codeLookup = lookupColorByCode(pass1?.make, colorCode);

  if (codeLookup) {
    // COLOR CODE DATABASE HIT — this is the most reliable source
    const ocrColor = pass1?.exterior_color;
    const normalizeColor = (c) => c?.toLowerCase().replace(/[\s\-_]|metallic/g, "").trim() || "";

    if (normalizeColor(ocrColor) !== normalizeColor(codeLookup)) {
      anomalies.push({
        field: "exterior_color",
        type: "CODE_LOOKUP_OVERRIDE",
        ocrReading: ocrColor,
        colorCode: colorCode,
        codeLookupResult: codeLookup,
        resolution: `Color code ${colorCode} = "${codeLookup}" in manufacturer database. OCR read "${ocrColor}" — overriding with database value.`,
      });
    }
    pass1.exterior_color = codeLookup;
    pass1.color_code = colorCode;
    fieldConfidence.color = 0.97; // Manufacturer code lookup is authoritative
  } else {
    // No code lookup — fall back to majority vote
    const colorReadings = [
      pass1?.exterior_color,
      pass2Color?.color_english,
      pass2ColorB?.color_english,
    ].filter(Boolean);

    const normalizeColor = (c) => c?.toLowerCase().replace(/[\s\-_]/g, "") || "";

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
        fieldConfidence.color = winner.count === colorReadings.length ? 0.85 : 0.70;
        pass1.exterior_color = winner.original;
      } else {
        fieldConfidence.color = 0.45;
        anomalies.push({
          field: "exterior_color",
          type: "NO_CONSENSUS",
          readings: colorReadings,
          resolution: "No majority — color reading uncertain",
        });
      }
    } else {
      fieldConfidence.color = pass1?.exterior_color ? 0.50 : 0.0;
    }
  }

  // Enrich with color code from verification passes
  if (colorCode && !pass1.color_code) pass1.color_code = colorCode;

  const colorChanged = pass2Color?.color_changed || pass2ColorB?.color_changed;
  if (colorChanged) {
    pass1.color_changed = true;
    anomalies.push({ field: "color_changed", type: "ALERT", message: "Vehicle has been repainted (色替 detected)" });
  }

  // ── VIN validation (Mercedes-specific pattern check) ──
  if (pass1?.vin && pass1?.make) {
    const isMercedes = /mercedes|benz/i.test(pass1.make);
    if (isMercedes) {
      const validated = validateMercedesVin(pass1.vin);
      if (validated && validated !== pass1.vin) {
        anomalies.push({
          field: "vin",
          type: "FORMAT_CORRECTION",
          original: pass1.vin,
          corrected: validated,
          resolution: "VIN corrected using Mercedes-Benz pattern validation",
        });
        pass1.vin = validated;
      }
    }
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
export async function parseAuctionSheet(image, opts = {}) {
  if (!image) return null;

  const { skipVerification = false, skipDamageDeep = false, quickMode = false } = opts;

  // ── Pass 1: Full comprehensive extraction ──
  const pass1 = await callClaudeVision({
    prompt: PASS1_PROMPT,
    images: [image],
    system: PASS1_SYSTEM,
    maxTokens: 6144,
  });

  if (!pass1 || typeof pass1 !== "object") return null;

  // ── Normalize: map Claude.ai clean schema → our internal field names ──
  const normalized = normalizePass1Output(pass1);

  // Quick mode — return after single pass with basic validation
  if (quickMode) {
    normalized.damage_codes = enrichDamageCodes(normalized.damage_codes);
    normalized._extraction_mode = "quick";
    normalized._passes_completed = 1;
    return validateSheetOutput(normalized);
  }

  // ── Pass 2: Blind verification — TRIPLE mileage read + DUAL color read (all parallel) ──
  let pass2Mileage = null, pass2MileageB = null;
  let pass2Year = null;
  let pass2Color = null, pass2ColorB = null;

  if (!skipVerification) {
    // Run 5 verification calls in parallel:
    // - 2x mileage (for triple read with Pass 1 = 3 total readings)
    // - 1x year
    // - 2x color (for triple read with Pass 1 = 3 total readings)
    const verifyPromises = await Promise.allSettled([
      callClaudeVision({ prompt: VERIFY_MILEAGE_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: "Read the mileage number (走行) from this auction sheet. What number is shown in the digit boxes? Return JSON: {\"mileageKm\": <number>}", images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_YEAR_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_COLOR_PROMPT, images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: "What color (外色) is this vehicle? Also read the color code number (カラーNo.). Return JSON: {\"color_english\": \"<color>\", \"color_code\": \"<3-digit code>\"}", images: [image], system: VERIFY_SYSTEM, maxTokens: 1024 }),
    ]);

    pass2Mileage = verifyPromises[0].status === "fulfilled" ? verifyPromises[0].value : null;
    pass2MileageB = verifyPromises[1].status === "fulfilled" ? verifyPromises[1].value : null;
    pass2Year = verifyPromises[2].status === "fulfilled" ? verifyPromises[2].value : null;
    pass2Color = verifyPromises[3].status === "fulfilled" ? verifyPromises[3].value : null;
    pass2ColorB = verifyPromises[4].status === "fulfilled" ? verifyPromises[4].value : null;
  }

  // ── Pass 3: Deep damage map analysis ──
  let pass3Damage = null;

  if (!skipDamageDeep) {
    try {
      pass3Damage = await callClaudeVision({
        prompt: PASS3_PROMPT,
        images: [image],
        system: PASS3_SYSTEM,
        maxTokens: 4096,
      });
    } catch (e) {
      console.warn("Pass 3 (damage deep) failed:", e.message);
    }
  }

  // ── Cross-validation & merge (majority vote) ──
  const { merged, anomalies, fieldConfidence } = crossValidate(
    normalized, pass2Mileage, pass2MileageB, pass2Year, pass2Color, pass2ColorB, pass3Damage
  );

  // Enrich damage codes with reference database
  merged.damage_codes = enrichDamageCodes(merged.damage_codes);

  // Compute derived metrics
  merged._damage_severity_score = computeDamageSeverityScore(merged.damage_codes);
  merged._tuv_relevant_damage = merged.damage_codes.filter((d) => d.tuvRelevant);
  merged._anomalies = anomalies;
  merged._field_confidence = fieldConfidence;
  merged._extraction_mode = "full";
  merged._passes_completed = 1 + (skipVerification ? 0 : 1) + (skipDamageDeep ? 0 : 1);

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

For JAPANESE AUCTION SHEETS — SCAN THE ENTIRE SHEET for these Japanese labels:

YEAR CONVERSION (初度登録年月 / 年式):
- HEISEI (平成/H): H + 1988 = Western year (H24=2012, H28=2016, H30=2018)
- REIWA (令和/R): R + 2018 = Western year (R1=2019, R3=2021, R5=2023)
- SHOWA (昭和/S): S + 1925 = Western year

BRAND NAMES (車名 in katakana):
メルセデス ベンツ = Mercedes-Benz, フェラーリ = Ferrari, ポルシェ = Porsche,
ランボルギーニ = Lamborghini, ベントレー = Bentley, アストンマーチン = Aston Martin,
ジャガー = Jaguar, マセラティ = Maserati, ロールスロイス = Rolls-Royce,
マクラーレン = McLaren, レンジローバー = Range Rover, ロータス = Lotus,
アルファロメオ = Alfa Romeo, BMW = BMW

FIELDS TO FIND:
- 車名 = brand, グレード = model, 排気量 = displacement cc, 型式 = chassis code
- 走行 = mileage km (digit boxes — read ALL digits left to right), シフト = transmission (AT=AUTOMATIC, MT=MANUAL)
- 外色/色 = exterior color in Japanese (translate), カラーNo. = color code
- 燃料 = fuel (ガソリン=PETROL), ハンドル = steering (左=LHD, 右=RHD)
- 評価点 = grade number, 内装 = interior grade LETTER (A/B/C/D, NOT color)
- 修復歴 = accident (有=Yes, 無=No)
- 装備 = equipment, セールスポイント = sales points, 注意事項 = caution notes

CRITICAL RULES:
1. Read 排気量 EXACTLY from sheet, do NOT guess from model
2. H24 = 2012 (NOT 2024). Use H + 1988. R + 2018.
3. Translate ALL Japanese text to English
4. 内装 grade (A/B/C/D) is condition, NOT color
5. Use Mercedes-Benz (not Mercedes-AMG unless dedicated AMG model like AMG GT)

Return ONLY valid JSON:
{
  "extracted": {
    "make": "<brand or null>",
    "model": "<model/grade or null>",
    "year": <4-digit year or null>,
    "mileageKm": <integer or null>,
    "driveSide": "<LHD/RHD or null>",
    "askingPriceJpy": <JPY integer or null>,
    "exteriorColor": "<English color or null>",
    "interiorColor": "<interior color/material or null>",
    "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG or null>",
    "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC or null>",
    "auctionGrade": <grade number or null>,
    "accidentHistory": <true/false/null>,
    "specificationNotes": "<displacement, equipment, sales points, notes — translated, comma-separated>"
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
export async function extractVehicleData(images) {
  if (!images || images.length === 0) {
    throw new Error("No images provided for extraction");
  }

  // ── Pass 1: Full extraction ──
  const result = await callClaudeVision({
    prompt: EXTRACTION_PROMPT,
    images,
    system: PASS1_SYSTEM,
    maxTokens: 4096,
  });

  if (!result || typeof result !== "object" || !result.extracted) {
    throw new Error("Could not extract data from images");
  }

  const extracted = result.extracted;

  // ── Pass 2: Blind verification of error-prone fields ──
  const hasAuctionSheet = extracted.mileageKm || extracted.auctionGrade || extracted.year;

  if (hasAuctionSheet) {
    const [mileageV, colorV, yearV] = await Promise.allSettled([
      callClaudeVision({ prompt: VERIFY_MILEAGE_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_COLOR_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
      callClaudeVision({ prompt: VERIFY_YEAR_PROMPT, images, system: VERIFY_SYSTEM, maxTokens: 1024 }),
    ]);

    // Apply mileage correction
    if (mileageV.status === "fulfilled" && mileageV.value?.mileageKm) {
      const verified = mileageV.value.mileageKm;
      if (verified !== extracted.mileageKm) {
        console.log(`MILEAGE CORRECTED: ${extracted.mileageKm} → ${verified}`);
        extracted.mileageKm = verified;
      }
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
  }

  // Normalize auction grade
  if (extracted.auctionGrade != null) {
    const g = String(extracted.auctionGrade).toUpperCase();
    if (g === "S") extracted.auctionGrade = 6;
    else extracted.auctionGrade = parseFloat(g) || null;
  }

  // Apply manufacturer color code lookup if available
  const specNotes = extracted.specificationNotes || "";
  const codeMatch = specNotes.match(/Color code:\s*(\d{2,4})/i);
  if (codeMatch && extracted.make) {
    const codeLookup = lookupColorByCode(extracted.make, codeMatch[1]);
    if (codeLookup) {
      console.log(`COLOR CODE OVERRIDE: ${codeMatch[1]} = "${codeLookup}" (manufacturer database)`);
      extracted.exteriorColor = codeLookup;
    }
  }

  return validateExtractionOutput({
    extracted,
    summary: result.summary || null,
  });
}
