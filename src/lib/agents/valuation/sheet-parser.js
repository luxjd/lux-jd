import { callClaudeVision } from "@/lib/claude";
import { validateSheetOutput } from "./validation";

const SYSTEM_PROMPT = `You are an expert at reading Japanese vehicle auction inspection sheets (検査表/出品票). You have deep knowledge of ALL Japanese auction house formats — every auction house uses a DIFFERENT layout but the same Japanese field labels. You can read:
- USS (輸入車プライムコーナー, セダンコーナー, etc.)
- HAA Kobe/Nagoya
- TAA (Toyota Auto Auction)
- CAA (Central Auto Auction)
- JU (全軽自協)
- AUCNET (online format)
- ZIP, BCN, HERO, LAA, NAA, and all others

You read ALL Japanese text (kanji, hiragana, katakana, handwritten) fluently. You translate everything to English precisely.`;

const USER_PROMPT = `Analyze this Japanese vehicle auction inspection sheet with MAXIMUM precision. Extract EVERY visible data field.

IMPORTANT: Auction sheets come in MANY different layouts depending on the auction house. Do NOT expect fields in specific positions. Instead, SCAN THE ENTIRE SHEET and look for these Japanese labels WHEREVER they appear:

YEAR CONVERSION (年式 or 初度登録年月 or 登録年月):
Convert Japanese era dates to Western calendar:
- HEISEI (平成/H): year + 1988 = Western year
  H1=1989, H5=1993, H10=1998, H12=2000, H15=2003, H18=2006, H20=2008, H21=2009, H22=2010, H23=2011, H24=2012, H25=2013, H26=2014, H27=2015, H28=2016, H29=2017, H30=2018, H31=2019
- REIWA (令和/R): year + 2018 = Western year
  R1=2019, R2=2020, R3=2021, R4=2022, R5=2023, R6=2024, R7=2025, R8=2026
- SHOWA (昭和/S): year + 1925 = Western year
  S60=1985, S63=1988

JAPANESE BRAND NAMES (車名 field, written in katakana):
メルセデス ベンツ/メルセデスベンツ = Mercedes-Benz, フェラーリ = Ferrari,
ポルシェ = Porsche, ランボルギーニ = Lamborghini, ベントレー = Bentley,
アストンマーチン/アストンマーティン = Aston Martin, ジャガー = Jaguar,
マセラティ = Maserati, ロールスロイス = Rolls-Royce, マクラーレン = McLaren,
レンジローバー = Range Rover, ランドローバー = Land Rover, ロータス = Lotus,
アルファロメオ = Alfa Romeo, ビー・エム・ダブリュー/BMW = BMW

FIELDS TO FIND (scan entire sheet — locations vary by auction house):

Vehicle Identity:
- 車名 = brand name in katakana (see translations above)
- グレード/型式/車種 = model/grade name (e.g. SL550, 488GTB, 911カレラS)
- 型式 = chassis/model code (e.g. CBA-231473, ABA-F142, etc.)
- 初度登録年月/年式 = registration date in Japanese era (see conversion above)
- 排気量 = displacement in cc (read EXACT number as written)
- 車台No./シリアルNo. = chassis/VIN number

Specs:
- 走行 = mileage in km — may be in DIGIT BOXES like |8|5|4|8|3| = 85483. Read ALL digits left to right
- シフト = transmission — AT/FAT/FA=AUTOMATIC, MT/F5/F6=MANUAL, DCT, PDK, SMG, CVT
- 外色/色 = exterior color in Japanese (translate to English)
- 燃料 = fuel — ガソリン=PETROL, 軽油=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC, LPG
- ハンドル = steering — 左=LHD, 右=RHD
- 車検/有効期限 = inspection expiry (in Japanese era format)
- 輸入区分 = import type — ディーラー=Dealer, 並行=Parallel

Condition:
- 評価点/総合評価 = overall auction grade (number: 1-5, 4.5, S, R, RA)
- 内装点/内装 = interior grade LETTER (A/B/C/D) — NOT the interior color
- 修復歴 = accident history — 有=Yes, 無=No, なし=No
- 記録簿 = service book — 有=present, 無=not present
- 装備 = equipment (SR=Sunroof, AW=Alloy Wheels, PS=Power Steering, PW=Power Windows, TV, ナビ=Navi, カワ/革=Leather, AAC=Auto A/C, エアB=Airbag, RS=Rear Spoiler, CD, MD, ETC, Bカメラ=Backup Camera)
- セールスポイント = sales points — TRANSLATE ALL Japanese text to English
- 注意事項/出品者コメント = caution notes — TRANSLATE ALL to English
- 検査員報告 = inspector report — TRANSLATE ALL to English

Prices:
- スタート/開始/出品金額 = start price (万円 × 10000)
- 落札/商談/成約 = sold price (万円 × 10000)
- リサイクル預託金 = recycling deposit

Panel Diagram / Damage Map:
- Look for the vehicle body outline drawing with damage codes marked on it
- Read EVERY code on the diagram and map it to the panel location

JAPANESE DAMAGE CODE REFERENCE:
Scratches: A1=small scratch, A2=scratch, A3=large scratch
Dents: U1=small dent, U2=dent, U3=large dent
Repair/Repaint: W1=repair trace, W2=obvious repair, W3=large repair area
Rust: S1=light surface rust, S2=rust, S3=heavy rust
Cracks: X=crack, XX=large crack
Glass cracks: ヒビ=crack, X1=chip, RX=cracked
Replacement: P=replaced panel, PP=non-genuine replacement
Holes: H=hole
Waviness: Y=paint waviness (respray indicator)
Corrosion: C1=light corrosion, C2=corrosion
Marks: B1=small mark, B2=mark, B3=large mark
Missing: M=missing part
Tear/Cut: T=tear/cut
Dent with paint damage: E1=small, E2=medium, E3=large
Fire damage: F=fire damage

COMMON JAPANESE COLOR TRANSLATIONS:
ブラック/黒=Black, ホワイト/白/パールホワイト=Pearl White, シルバー=Silver,
グレー/ガンメタ=Grey, レッド/赤=Red, ブルー/青=Blue, グリーン/緑=Green,
ゴールド/金=Gold, パール=Pearl, ワインレッド=Wine Red, ブラウン/茶=Brown,
ベージュ=Beige, アイボリー=Ivory, ネイビー/紺=Navy,
カバンサイトブルー=Cavansite Blue, オブシディアンブラック=Obsidian Black,
セレナイトグレー=Selenite Grey, イリジウムシルバー=Iridium Silver,
ロッソコルサ=Rosso Corsa, ネロ=Nero, ビアンコ=Bianco,
ジアッロ=Giallo, グリジオ=Grigio

CRITICAL RULES:
1. Read displacement as the EXACT cc number on the sheet. Do NOT infer from model name
2. For year: H24 = 2012 (NOT 2024). Use formula: H + 1988. R + 2018
3. For mileage digit boxes: read EVERY digit carefully left-to-right
4. Translate ALL Japanese text in notes/comments/sales points to English
5. The 内装 grade (A/B/C/D) is condition, not color. Report it as interior_grade
6. If 修復歴=有 but damage codes show no structural repair, flag the contradiction
7. If no price is visible, use null — do NOT guess
8. Read ALL damage codes from the panel diagram including codes on glass areas

Return ONLY valid JSON:
{
  "overall_grade": <float 1.0-6.0 or null>,
  "interior_grade": "<A/B/C/D or null>",
  "panel_conditions": {
    "front_bumper": "<code + English meaning, or 'Clean'>",
    "hood": "<condition>",
    "roof": "<condition>",
    "windshield": "<condition — check for X, XX, ヒビ cracks>",
    "left_front_fender": "<condition>",
    "right_front_fender": "<condition>",
    "left_rear_quarter": "<condition>",
    "right_rear_quarter": "<condition>",
    "left_doors": "<condition>",
    "right_doors": "<condition>",
    "trunk": "<condition>",
    "rear_bumper": "<condition>"
  },
  "mechanical_notes": ["translated note 1", "..."],
  "modification_notes": ["translated modification 1", "..."],
  "damage_codes": [
    {"location": "panel name", "code": "A2", "meaning": "Scratch on left front fender", "severity": "MINOR/MODERATE/MAJOR"}
  ],
  "accident_indicator": <true/false/null>,
  "accident_contradiction": "<explain if 修復歴 contradicts damage codes, or null>",
  "mileage_reading": <integer km or null>,
  "displacement_cc": <integer or null>,
  "equipment_notes": ["translated equipment item"],
  "sales_points": ["translated sales point — from セールスポイント section"],
  "caution_notes": ["translated caution — from 注意事項 and 検査員報告 sections"],
  "service_book_present": <true/false/null>,
  "service_history_indicator": "FULL_DEALER" or "PARTIAL_DEALER" or "INDEPENDENT" or "UNKNOWN",
  "inspection_expiry": "<Western date string or null>",
  "import_type": "<Dealer or Parallel or null>",
  "start_price_jpy": <integer or null>,
  "sold_price_jpy": <integer or null>,
  "chassis_code": "<string or null>",
  "vin": "<chassis/VIN number or null>",
  "overall_assessment": "2-3 sentence expert summary covering condition, notable features, and any red flags",
  "confidence": <number 0.0-1.0>
}

If any field is truly not visible or readable, use null. But MOST fields ARE present — scan the ENTIRE sheet carefully. Do not guess — only report what you can actually see.`;

/**
 * Parse a Japanese auction inspection sheet using Claude Vision.
 * Works with ALL auction house formats (USS, HAA, TAA, CAA, JU, AUCNET, etc.)
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
