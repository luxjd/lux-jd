import { callClaudeVision, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert at reading Japanese vehicle auction inspection sheets (検査表/出品票). You have deep knowledge of Japanese auction house formats (USS, HAA, TAA, CAA, JU, AUCNET, etc.) and can precisely read their structured data fields. You read Japanese fluently.`;

const USER_PROMPT = `Read this Japanese vehicle auction sheet carefully and extract EVERY data field visible.

CRITICAL — read the ACTUAL text/numbers on the sheet. Do NOT guess or infer specs from the model name. Common field locations on Japanese auction sheets:

TOP HEADER ROW (出品票 header):
- 車種名/車名 = vehicle name (make + model + variant/edition)
- 年式 = year — H28=2016, H29=2017, H30=2018, R1=2019, R2=2020, R3=2021, R4=2022, R5=2023, R6=2024, R7=2025 (H=平成, R=令和)
- シフト = transmission — FA/FAT/AT=Automatic, F5/F6/MT=Manual, also look for DCT/PDK/SMG
- 排気量 = engine displacement in cc (e.g. 4000 = 4.0L, 3800 = 3.8L, 2000 = 2.0L) — read the EXACT number
- 走行 = mileage in km — read the EXACT number shown
- 色 = exterior color code or name
- 評価点 = auction grade (overall grade like 4, 4.5, S) and sometimes interior grade (A/B/C/D)
- 型式 = chassis/model code (e.g. CBA-190378)

DETAIL SECTION (lower area):
- 車検 = shaken/inspection expiry date
- 走行 = mileage (走行 followed by km number)
- 内装 = interior color/material
- 燃料 = fuel type — ガソリン=Petrol, 軽油=Diesel, ハイブリッド=Hybrid, 電気=Electric
- ハンドル = steering — 左=LHD, 右=RHD
- 修復歴 = accident history — 有=Yes, 無=No
- 装備 = equipment list (ナビ=Navigation, AW=Alloy Wheels, 革=Leather, PS=Power Steering, PW=Power Windows, SR=Sunroof, TV, エアコン/AAC=Air Conditioning, etc.)
- セールスポイント = sales points / special features / edition name
- リサイクル = recycling fee

IMPORTANT RULES:
1. Read the displacement (排気量) as the EXACT cc number shown. Convert to liters for specificationNotes (e.g. 4000cc = 4.0L).
2. Include the full model name with any edition/variant (e.g. "AMG GT S130th Edition", not just "GT").
3. For the grade, read both the overall grade number AND interior grade letter if present (e.g. "4" overall + "B" interior).
4. Read the starting price (スタート金額) or sold price (商談金額/落札額) if visible — return in ten-thousands of yen (万円). Multiply by 10000 for actual yen.

Return ONLY valid JSON:
{
  "make": "<brand in English — use exactly one of: Ferrari, Mercedes-AMG, Porsche, Lamborghini, Bentley, Aston Martin, Jaguar, Maserati, BMW M, Range Rover if it matches. Otherwise brand name as-is>",
  "model": "<full model name with variant/edition in English, e.g. AMG GT S Edition 130, 488 GTB, 911 Turbo S, etc.>",
  "year": <4-digit Western calendar year as integer>,
  "mileageKm": <exact integer from sheet>,
  "driveSide": "<LHD or RHD>",
  "auctionGrade": "<overall grade as string, e.g. '4', '4.5', 'S'>",
  "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG>",
  "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC>",
  "exteriorColor": "<color in English>",
  "interiorColor": "<color/material in English or null>",
  "accidentHistory": <true|false|null>,
  "askingPriceJpy": <price in JPY if visible on sheet (multiply 万円 value by 10000), or null>,
  "displacementCc": <engine displacement in cc as integer, read EXACTLY from sheet>,
  "specificationNotes": "<engine displacement in liters, equipment list, edition/variant details, and any notable features — all comma-separated in English>"
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
