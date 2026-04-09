import { callClaudeVision } from "@/lib/claude";
import { validateSheetOutput } from "./validation";

const SYSTEM_PROMPT = `You are an expert at reading Japanese vehicle auction inspection sheets (検査表/出品票). You have deep knowledge of ALL Japanese auction house formats (USS, HAA, TAA, CAA, JU, AUCNET, ZIP, BCN, HERO, LAA). You read Japanese text fluently and understand every auction condition code, damage code, and grading system. You translate everything to English precisely.`;

const USER_PROMPT = `Analyze this Japanese vehicle auction inspection sheet with MAXIMUM precision. Extract EVERY visible data field.

JAPANESE DAMAGE CODE REFERENCE (translate all codes found):
Scratches: A1=small scratch, A2=scratch, A3=large scratch
Dents: U1=small dent, U2=dent, U3=large dent
Repair/Repaint: W1=repair trace, W2=obvious repair, W3=large repair area
Rust: S1=light surface rust, S2=rust, S3=heavy rust
Cracks: X=crack, XX=large crack
Replacement: P=replaced panel, PP=replaced with non-genuine panel
Holes: H=hole
Waviness: Y=paint waviness (respray indicator)
Corrosion: C1=light corrosion, C2=corrosion
Marks: B1=small mark, B2=mark, B3=large mark
Glass: X1=chipped windscreen, RX=cracked windscreen
Missing: M=missing part
Cut: T=tear/cut

AUCTION GRADE REFERENCE:
S (or 6): Nearly new, minimal use
5: Excellent condition, very minor wear
4.5: Very good, light wear
4: Good, some wear but well maintained
3.5: Average, noticeable wear
3: Below average, significant wear
2: Poor, major issues
1: Very poor, flood/salvage/heavy accident
R: Repaired accident vehicle
RA: Repaired accident, grade A

INTERIOR GRADE: A=excellent, B=good, C=average, D=poor

FIELDS TO EXTRACT:
- 車種名/車名 = vehicle name (top header)
- 年式 = year (H=平成: H28=2016..H31=2019, R=令和: R1=2019..R7=2025)
- シフト = transmission (FA/FAT/AT=AUTOMATIC, F5/F6/MT=MANUAL, DCT, PDK, SMG)
- 排気量 = displacement in cc (read EXACT number)
- 走行 = mileage in km (read EXACT number)
- 色 = exterior color
- 評価点 = auction grade (overall + interior grade)
- 型式 = chassis code
- 燃料 = fuel (ガソリン=PETROL, 軽油=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC)
- ハンドル = steering (左=LHD, 右=RHD)
- 修復歴 = accident history (有=Yes, 無=No)
- 内装 = interior description
- 装備 = equipment list (translate ALL items)
- セールスポイント = sales points (translate)
- 車検 = inspection expiry date
- リサイクル = recycling fee
- スタート/開始 = start price (万円 × 10000 = JPY)
- 落札/商談 = sold/final price (万円 × 10000 = JPY)
- 記録簿 = service book (有=available, 無=not available, indicates service history)

CRITICAL RULES:
1. Read displacement as EXACT cc number from sheet
2. Include full model name with edition/variant
3. Read BOTH overall grade AND interior grade
4. Translate ALL damage codes to English with location
5. Check if 記録簿 (service book) is present — this indicates service history
6. If 修復歴 is 有 (yes) but damage codes show no structural damage, flag this contradiction
7. Multiply 万円 values by 10000 for actual yen

Return ONLY valid JSON:
{
  "overall_grade": <float 1.0-6.0 or null>,
  "interior_grade": "<A/B/C/D or null>",
  "panel_conditions": {
    "front_bumper": "<condition code + English meaning or 'Clean'>",
    "hood": "<condition>",
    "roof": "<condition>",
    "left_front_fender": "<condition>",
    "right_front_fender": "<condition>",
    "left_rear_quarter": "<condition>",
    "right_rear_quarter": "<condition>",
    "left_doors": "<condition>",
    "right_doors": "<condition>",
    "trunk": "<condition>",
    "rear_bumper": "<condition>"
  },
  "mechanical_notes": ["translated observation 1", "..."],
  "modification_notes": ["translated mod 1", "..."],
  "damage_codes": [
    {"location": "panel name", "code": "A2", "meaning": "Scratch on left front fender", "severity": "MINOR/MODERATE/MAJOR"}
  ],
  "accident_indicator": <true/false>,
  "accident_contradiction": "<explain if 修復歴 contradicts damage codes, or null>",
  "mileage_reading": <integer km or null>,
  "displacement_cc": <integer or null>,
  "equipment_notes": ["translated equipment item"],
  "sales_points": ["translated sales point"],
  "service_book_present": <true/false/null>,
  "service_history_indicator": "FULL_DEALER" or "PARTIAL_DEALER" or "INDEPENDENT" or "UNKNOWN",
  "inspection_expiry": "<date string or null>",
  "start_price_jpy": <integer or null>,
  "sold_price_jpy": <integer or null>,
  "chassis_code": "<string or null>",
  "overall_assessment": "2-3 sentence expert summary of condition based on ALL data",
  "confidence": <number 0.0-1.0>
}

If any field is truly not visible or readable on the sheet, use null. But MOST fields ARE present — read very carefully. Do not guess — only report what you can actually see.`;

/**
 * Parse a Japanese auction inspection sheet using Claude Vision.
 * Enhanced with damage code translation, panel diagram, and service history extraction.
 * @param {{data: string, mediaType: string}} image - Base64 encoded auction sheet
 * @returns {object|null} Parsed sheet data or null
 */
export async function parseAuctionSheet(image) {
  if (!image) return null;

  const result = await callClaudeVision({
    prompt: USER_PROMPT,
    images: [image],
    system: SYSTEM_PROMPT,
    maxTokens: 4096,
  });

  return validateSheetOutput(result);
}
