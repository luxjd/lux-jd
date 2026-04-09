import { callClaudeVision, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert vehicle data extraction AI for a luxury car import business (Japan → Germany). You can read Japanese auction inspection sheets (検査表/出品票), vehicle photographs, and vehicle documentation with exceptional accuracy. You have deep knowledge of ALL Japanese auction house formats (USS, HAA, TAA, CAA, JU, AUCNET, ZIP, BCN, HERO, LAA, NAA) and luxury vehicle specifications. You read ALL Japanese text (kanji, hiragana, katakana, handwritten) fluently. You are extremely precise — financial decisions worth €50,000-€400,000 depend on your accuracy.`;

const EXTRACTION_PROMPT = `Analyze ALL the provided images carefully and extract every piece of vehicle data you can find. These images may include auction sheets, vehicle photos, or documents.

For JAPANESE AUCTION SHEETS (検査表/出品票):

IMPORTANT: Different auction houses use DIFFERENT layouts. Do NOT assume field positions. SCAN THE ENTIRE SHEET and find these Japanese labels wherever they appear:

YEAR CONVERSION (初度登録年月 / 年式):
The year is in Japanese era format. Convert using these formulas:
- HEISEI (平成/H): H + 1988 = Western year
  H1=1989, H5=1993, H10=1998, H12=2000, H15=2003, H18=2006, H20=2008, H21=2009, H22=2010, H23=2011, H24=2012, H25=2013, H26=2014, H27=2015, H28=2016, H29=2017, H30=2018, H31=2019
- REIWA (令和/R): R + 2018 = Western year
  R1=2019, R2=2020, R3=2021, R4=2022, R5=2023, R6=2024, R7=2025, R8=2026
- SHOWA (昭和/S): S + 1925 = Western year

BRAND NAMES (車名 is written in katakana):
メルセデス ベンツ/メルセデスベンツ = Mercedes-Benz, フェラーリ = Ferrari,
ポルシェ = Porsche, ランボルギーニ = Lamborghini, ベントレー = Bentley,
アストンマーチン = Aston Martin, ジャガー = Jaguar, マセラティ = Maserati,
ロールスロイス = Rolls-Royce, マクラーレン = McLaren,
レンジローバー = Range Rover, ランドローバー = Land Rover, ロータス = Lotus,
アルファロメオ = Alfa Romeo, ビー・エム・ダブリュー/BMW = BMW

FIELDS TO FIND (scan entire sheet):
- 車名 = brand name in katakana
- グレード = model/grade (e.g. SL550, 488GTB, 911カレラS)
- 排気量 = displacement in cc (read EXACT number)
- 型式 = chassis code
- 走行 = mileage in km
- シフト = transmission (AT/FAT=AUTOMATIC, MT/F5/F6=MANUAL, DCT, PDK, SMG)
- 外色/色 = exterior color in Japanese
- カラーNo. = color code
- 燃料 = fuel (ガソリン=PETROL, 軽油=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC)
- ハンドル = steering (左=LHD, 右=RHD)
- 評価点 = overall grade (number in dedicated box area)
- 内装 = interior grade LETTER (A/B/C/D) — this is NOT the interior color
- 修復歴 = accident history (有=Yes, 無=No)
- 装備 = equipment (SR=Sunroof, AW=Alloy Wheels, PS, PW, TV, ナビ=Navi, カワ/革=Leather, AAC=Auto A/C, エアB=Airbag)
- セールスポイント = sales points
- 注意事項 = caution notes
- 検査員報告 = inspector report
- スタート/落札/商談 = price (万円 × 10000 = JPY)

COLOR TRANSLATIONS:
ブラック/黒=Black, ホワイト/白=White, パールホワイト=Pearl White, シルバー=Silver,
グレー=Grey, レッド/赤=Red, ブルー/青=Blue, グリーン/緑=Green, ゴールド/金=Gold,
パール=Pearl, ブラウン/茶=Brown, ベージュ=Beige, ネイビー/紺=Navy,
カバンサイトブルー=Cavansite Blue, オブシディアンブラック=Obsidian Black,
セレナイトグレー=Selenite Grey, イリジウムシルバー=Iridium Silver,
ダイヤモンドホワイト=Diamond White, ロッソコルサ=Rosso Corsa, ネロ=Nero,
ビアンコ=Bianco, ジアッロ=Giallo, グリジオ=Grigio, アルピンホワイト=Alpine White,
ミネラルホワイト=Mineral White, ブリリアントブルー=Brilliant Blue

For VEHICLE PHOTOS: identify make/model from badges, color from bodywork, condition from visible wear/damage.

CRITICAL RULES:
1. IGNORE text outside the auction sheet (user-added titles, captions, watermarks)
2. Read displacement from 排気量 EXACTLY — do NOT infer from model name
3. Read color from 外色/色 label — do NOT guess from photos
4. For year: H24 = 2012 (24 + 1988), NOT 2024
5. If price is not shown, return null — do NOT guess
6. Translate ALL Japanese text to English
7. Use Mercedes-Benz (not Mercedes-AMG unless dedicated AMG model like AMG GT)

Return ONLY valid JSON:
{
  "extracted": {
    "make": "<brand in English or null>",
    "model": "<model/grade name as on sheet or null>",
    "year": <4-digit Western calendar year or null>,
    "mileageKm": <integer from sheet or null>,
    "driveSide": "<LHD or RHD or null>",
    "askingPriceJpy": <integer JPY if on sheet, or null>,
    "exteriorColor": "<color translated from 外色/色 field or null>",
    "interiorColor": "<interior color/material or null>",
    "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG or null>",
    "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC or null>",
    "auctionGrade": <grade number or null>,
    "accidentHistory": <true or false or null>,
    "specificationNotes": "<ALL: displacement, equipment, sales points, caution notes, inspector notes — translated, comma-separated>"
  },
  "summary": "<2-3 sentence vehicle description with condition notes>"
}`;

// ── PASS 2: Focused verification of error-prone fields ──

const VERIFY_PROMPT = (firstPassData) => `I previously extracted data from this auction sheet and got these results. Some fields are commonly misread. Please CAREFULLY RE-READ the following fields from the sheet and verify or correct them:

MY FIRST-PASS EXTRACTION:
- Mileage: ${firstPassData.mileageKm} km
- Exterior Color: ${firstPassData.exteriorColor}
- Year: ${firstPassData.year}
- Displacement: ${firstPassData.specificationNotes?.match(/\d{3,5}cc/)?.[0] || "unknown"}

VERIFICATION TASKS — re-read each field independently:

1. MILEAGE (走行):
   - Find the 走行 label on the sheet
   - The mileage digits are usually in INDIVIDUAL BOXES — one digit per box
   - Read EACH box from left to right and write them out: "Box 1: __, Box 2: __, Box 3: __, Box 4: __, Box 5: __"
   - Combine into the full number
   - Sanity check: for a ${firstPassData.year || "20XX"} vehicle, typical mileage would be ${firstPassData.year ? `${(2026 - firstPassData.year) * 8000}-${(2026 - firstPassData.year) * 15000} km` : "varies"}

2. EXTERIOR COLOR (外色/色):
   - Find the 外色 or 色 label on the sheet
   - Read the EXACT Japanese text written next to it — character by character
   - Write out the Japanese characters you see: "I see: ________"
   - Translate to English
   - Also note カラーNo. (color code) if visible nearby

3. YEAR (初度登録年月 or 年式):
   - Find the era code (H=Heisei or R=Reiwa) and number
   - Write what you see: "I see: ___"
   - Convert: H + 1988, R + 2018

Return ONLY valid JSON:
{
  "mileage_boxes": "<what you see in each digit box, e.g. '8, 5, 4, 8, 3'>",
  "mileageKm": <verified integer>,
  "color_japanese": "<exact Japanese text you see next to 外色/色>",
  "exteriorColor": "<verified English translation>",
  "color_code": "<カラーNo. if visible, or null>",
  "year_raw": "<what you see, e.g. 'H24/8'>",
  "year": <verified 4-digit Western year>,
  "corrections": "<explain what was wrong in the first pass, or 'No corrections needed'>"
}`;

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json({ error: "AI service not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    // Convert all files to base64 images
    const images = [];
    for (const file of files) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = file.type || "image/jpeg";
        images.push({ data: base64, mediaType });
      }
    }

    if (images.length === 0) {
      return Response.json({ error: "No valid files provided" }, { status: 400 });
    }

    // ═══════════════════════════════════════
    // PASS 1: Full extraction
    // ═══════════════════════════════════════
    const result = await callClaudeVision({
      prompt: EXTRACTION_PROMPT,
      images,
      system: SYSTEM_PROMPT,
      maxTokens: 4096,
    });

    if (!result || typeof result !== "object" || !result.extracted) {
      return Response.json({ error: "Could not extract data from images" }, { status: 422 });
    }

    const extracted = result.extracted;

    // ═══════════════════════════════════════
    // PASS 2: Verify error-prone fields
    // Only run if we detected an auction sheet (has mileage or grade)
    // ═══════════════════════════════════════
    const hasAuctionSheet = extracted.mileageKm || extracted.auctionGrade || extracted.year;

    if (hasAuctionSheet) {
      try {
        const verification = await callClaudeVision({
          prompt: VERIFY_PROMPT(extracted),
          images,
          system: "You are a verification specialist. Your ONLY job is to re-read specific fields from this auction sheet with extreme precision. Focus on the digit boxes for mileage and the exact Japanese text for color. Take your time and be accurate.",
          maxTokens: 2048,
        });

        if (verification && typeof verification === "object") {
          // Apply corrections
          if (verification.mileageKm && verification.mileageKm !== extracted.mileageKm) {
            console.log(`Mileage corrected: ${extracted.mileageKm} → ${verification.mileageKm} (boxes: ${verification.mileage_boxes})`);
            extracted.mileageKm = verification.mileageKm;
          }
          if (verification.exteriorColor && verification.exteriorColor !== extracted.exteriorColor) {
            console.log(`Color corrected: ${extracted.exteriorColor} → ${verification.exteriorColor} (Japanese: ${verification.color_japanese})`);
            extracted.exteriorColor = verification.exteriorColor;
          }
          if (verification.year && verification.year !== extracted.year) {
            console.log(`Year corrected: ${extracted.year} → ${verification.year} (raw: ${verification.year_raw})`);
            extracted.year = verification.year;
          }
          if (verification.color_code) {
            // Append color code to spec notes
            const codeNote = `Color code: ${verification.color_code}`;
            extracted.specificationNotes = extracted.specificationNotes
              ? `${extracted.specificationNotes}, ${codeNote}`
              : codeNote;
          }
          if (verification.corrections && verification.corrections !== "No corrections needed") {
            console.log(`Verification notes: ${verification.corrections}`);
          }
        }
      } catch (verifyErr) {
        console.warn("Verification pass failed (non-critical):", verifyErr.message);
        // Continue with first-pass data
      }
    }

    // Normalize auction grade
    if (extracted.auctionGrade != null) {
      const g = String(extracted.auctionGrade).toUpperCase();
      if (g === "S") extracted.auctionGrade = 6;
      else extracted.auctionGrade = parseFloat(g) || null;
    }

    // Identify missing required fields
    const requiredFields = [
      { key: "make", label: "Vehicle brand/make", question: "What is the vehicle brand? (e.g. Ferrari, Porsche, Mercedes-Benz)" },
      { key: "model", label: "Model name", question: "What is the exact model name? (e.g. 488 GTB, 911 Turbo S, SL550)" },
      { key: "year", label: "Year of manufacture", question: "What year was the vehicle manufactured?" },
      { key: "mileageKm", label: "Mileage in km", question: "What is the current mileage in kilometers?" },
      { key: "driveSide", label: "Drive side", question: "Is the vehicle LHD (left-hand drive) or RHD (right-hand drive)?" },
      { key: "askingPriceJpy", label: "Asking price in JPY", question: "What is the asking price in Japanese Yen (JPY)?" },
      { key: "exteriorColor", label: "Exterior color", question: "What is the exterior color of the vehicle?" },
    ];

    const optionalFields = [
      { key: "interiorColor", label: "Interior color", question: "What is the interior color/material?" },
      { key: "transmission", label: "Transmission type", question: "What transmission does it have? (Automatic, Manual, DCT, PDK, SMG)" },
      { key: "fuelType", label: "Fuel type", question: "What fuel type? (Petrol, Diesel, Hybrid, Electric)" },
      { key: "auctionGrade", label: "Auction grade", question: "What is the auction inspection grade? (e.g. 3.5, 4, 4.5, 5)" },
      { key: "accidentHistory", label: "Accident history", question: "Does the vehicle have any accident/repair history?" },
      { key: "specificationNotes", label: "Notable specifications", question: "Any notable specifications or options? (e.g. carbon brakes, sport exhaust, special edition)" },
    ];

    const missingRequired = requiredFields.filter(f => !extracted[f.key] && extracted[f.key] !== false && extracted[f.key] !== 0);
    const missingOptional = optionalFields.filter(f => !extracted[f.key] && extracted[f.key] !== false && extracted[f.key] !== 0);

    return Response.json({
      extracted,
      summary: result.summary || null,
      missingRequired,
      missingOptional,
      complete: missingRequired.length === 0,
    });
  } catch (err) {
    console.error("Data extraction error:", err);
    return Response.json({ error: "Failed to extract data from files" }, { status: 500 });
  }
}
