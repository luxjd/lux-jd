import { callClaudeVision, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert at reading Japanese vehicle auction inspection sheets (検査表/出品票). You have deep knowledge of ALL Japanese auction house formats (USS, HAA, TAA, CAA, JU, AUCNET, ZIP, BCN, HERO, LAA) and can precisely read their structured data fields including handwritten Japanese text, damage codes, and panel diagrams. You read Japanese (kanji, hiragana, katakana) fluently.`;

const USER_PROMPT = `Read this Japanese vehicle auction sheet carefully and extract EVERY data field visible.

CRITICAL — read the ACTUAL text/numbers on the sheet. Do NOT guess or infer specs from the model name.

YEAR CONVERSION (年式 or 初度登録年月):
The year is in Japanese era format. Convert using these formulas:
- HEISEI (平成/H): H + 1988 = Western year
  H1=1989, H5=1993, H10=1998, H15=2003, H20=2008, H21=2009, H22=2010, H23=2011, H24=2012, H25=2013, H26=2014, H27=2015, H28=2016, H29=2017, H30=2018, H31=2019
- REIWA (令和/R): R + 2018 = Western year
  R1=2019, R2=2020, R3=2021, R4=2022, R5=2023, R6=2024, R7=2025, R8=2026
- SHOWA (昭和/S): S + 1925 = Western year (older vehicles)
  S60=1985, S63=1988
- Example: H24/8月 = August 2012. R5年 = 2023. NOT H24=2024.

FIELD LOCATIONS ON AUCTION SHEETS:

TOP HEADER:
- 排気量 = engine displacement in cc (read EXACT number, e.g. 4660)
- 型式 = chassis/model code (e.g. CBA-231473)
- 評価点 = auction grade (number in top-right area: 1, 2, 3, 3.5, 4, 4.5, 5, S)
- 内装 grade = interior grade LETTER next to 評価点 (A/B/C/D) — this is NOT interior color

VEHICLE IDENTITY:
- 初度登録年月 or 年式 = first registration date (in Japanese era — see conversion above)
- 車名 = vehicle name in KATAKANA:
  メルセデス ベンツ = Mercedes-Benz, フェラーリ = Ferrari, ポルシェ = Porsche,
  ランボルギーニ = Lamborghini, ベントレー = Bentley, アストンマーチン = Aston Martin,
  ジャガー = Jaguar, マセラティ = Maserati, ロールスロイス = Rolls-Royce,
  マクラーレン = McLaren, レンジローバー = Range Rover
- グレード = model/trim name (e.g. SL550, 488GTB, カレラS)

SPECS:
- 走行 = mileage in km — may be in INDIVIDUAL DIGIT BOXES like |8|5|4|8|3| — read ALL digits left-to-right = 85483
- シフト = transmission — AT/FAT/FA=Automatic, MT/F5/F6=Manual, DCT, PDK, SMG
- 外色/色 = exterior color (translate Japanese color names to English)
- カラーNo. = color code number
- 冷房 = A/C type (AAC = Auto Air Conditioning)
- 燃料 = fuel type — ガソリン=PETROL, 軽油=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC
- ハンドル = steering — 左=LHD, 右=RHD
- 輸入区分 = import type — ディーラー=Dealer import, 並行=Parallel import
- 車検 = inspection expiry date (in Japanese era format)

CONDITION:
- 修復歴 = accident/repair history — 有=Yes, 無=No
- 装備 = equipment list (SR=Sunroof, AW=Alloy Wheels, PS=Power Steering, PW=Power Windows, TV, ナビ=Navi, カワ/革=Leather, AAC=Auto A/C, RS=Rear Spoiler, エアB=Airbag)
- セールスポイント = sales points (translate ALL to English)
- 注意事項 = caution/inspector notes (translate ALL to English — this often has critical info about modifications, damage, or things to verify)
- 検査員報告 = inspector report (translate ALL to English)

PRICES:
- スタート金額/開始価格 = starting price (in 万円, multiply by 10000)
- 落札額/商談金額 = sold/final price (in 万円, multiply by 10000)

COMMON JAPANESE COLOR TRANSLATIONS:
ブラック/黒=Black, ホワイト/白=White, シルバー=Silver, グレー=Grey, レッド/赤=Red,
ブルー/青=Blue, グリーン/緑=Green, ゴールド/金=Gold, パール=Pearl,
カバンサイトブルー=Cavansite Blue, オブシディアンブラック=Obsidian Black,
セレナイトグレー=Selenite Grey, ダイヤモンドホワイト=Diamond White,
ロッソコルサ=Rosso Corsa, ネロ=Nero, ビアンコ=Bianco

CRITICAL RULES:
1. Read displacement (排気量) as the EXACT cc number. Convert to liters (e.g. 4660cc = 4.7L).
2. Include the full model name exactly as written on the sheet.
3. Read BOTH the overall grade number AND interior grade letter.
4. For mileage digit boxes, read every digit carefully left to right.
5. H24 = 2012 (Heisei 24 + 1988 = 2012). Do NOT confuse with 2024.
6. Translate ALL Japanese text in notes/sales points to English.
7. Read the starting/sold price if visible. Multiply 万円 by 10000. If no price shown, use null.

Return ONLY valid JSON:
{
  "make": "<brand in English — Mercedes-Benz (not Mercedes-AMG unless dedicated AMG model), BMW (not BMW M unless M model), etc.>",
  "model": "<full model/grade name as written on sheet, e.g. SL550, 488GTB, 911カレラS → 911 Carrera S>",
  "year": <4-digit Western calendar year as integer — USE CONVERSION FORMULA>,
  "mileageKm": <exact integer from digit boxes>,
  "driveSide": "<LHD or RHD>",
  "auctionGrade": "<overall grade as string, e.g. '4', '4.5', 'S'>",
  "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG>",
  "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC>",
  "exteriorColor": "<color translated to English>",
  "interiorColor": "<interior color/material in English or null — NOT the interior grade letter>",
  "accidentHistory": <true|false|null>,
  "askingPriceJpy": <price in JPY if visible (万円 × 10000), or null if no price shown>,
  "displacementCc": <engine displacement in cc as integer, read EXACTLY from sheet>,
  "specificationNotes": "<ALL of: displacement in liters, equipment list translated, sales points translated, inspector notes translated, caution notes translated, modifications — comma-separated in English>"
}

If any field is truly not visible, use null. But most fields ARE on the sheet — read carefully.`;

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json({ error: "AI service not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("auctionSheet");

    if (!file) {
      return Response.json({ error: "No auction sheet provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type || "image/jpeg";

    const result = await callClaudeVision({
      prompt: USER_PROMPT,
      images: [{ data: base64, mediaType }],
      system: SYSTEM_PROMPT,
    });

    if (!result || typeof result !== "object") {
      return Response.json({ error: "Could not parse auction sheet" }, { status: 422 });
    }

    // Map S grade to 6.0, normalize grade string to number
    if (result.auctionGrade != null) {
      const g = String(result.auctionGrade).toUpperCase();
      if (g === "S") result.auctionGrade = "6";
      // Keep as string for the form input
    }

    return Response.json({ fields: result });
  } catch (err) {
    console.error("Auction sheet parse error:", err);
    return Response.json({ error: "Failed to parse auction sheet" }, { status: 500 });
  }
}
