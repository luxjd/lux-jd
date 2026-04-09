import { callClaudeVision, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert vehicle data extraction AI for a luxury car import business (Japan → Germany). You can read Japanese auction inspection sheets (検査表/出品票), vehicle photographs, and vehicle documentation with exceptional accuracy. You have deep knowledge of Japanese auction house formats (USS, HAA, TAA, CAA, JU, AUCNET) and luxury vehicle specifications. You read Japanese fluently.`;

const EXTRACTION_PROMPT = `Analyze ALL the provided images carefully and extract every piece of vehicle data you can find. These images may include:

1. JAPANESE AUCTION SHEETS (検査表/出品票) — read the ACTUAL text/numbers:
   - 車種名/車名 = vehicle name (make + model + variant/edition)
   - 年式 = year — H28=2016, H29=2017, H30=2018, R1=2019, R2=2020, R3=2021, R4=2022, R5=2023, R6=2024, R7=2025
   - シフト = transmission — FA/FAT/AT=AUTOMATIC, F5/F6/MT=MANUAL, DCT, PDK, SMG
   - 排気量 = engine displacement in cc
   - 走行 = mileage in km (read EXACT number)
   - 色 = exterior color code or name
   - 評価点 = auction grade (overall + interior grade letter if present)
   - 型式 = chassis/model code
   - 燃料 = fuel type — ガソリン=PETROL, 軽油=DIESEL, ハイブリッド=HYBRID, 電気=ELECTRIC
   - ハンドル = steering — 左=LHD, 右=RHD
   - 修復歴 = accident history — 有=Yes, 無=No
   - 内装 = interior color/material
   - 装備 = equipment list
   - セールスポイント = sales points/special features
   - スタート金額/落札額/商談金額 = price (万円 = ×10000 yen)

2. VEHICLE PHOTOS — identify from visual cues:
   - Make/brand from badges, logos, styling cues
   - Model from badges, body shape, design elements
   - Exterior color (be specific — e.g. "Rosso Corsa" not just "Red")
   - Interior color and material
   - Condition observations (scratches, dents, wear, modifications)
   - Notable features, options, or modifications visible

3. DOCUMENTS/PDFs — extract any vehicle specs, prices, or details shown

IMPORTANT RULES:
- Read displacement (排気量) as the EXACT cc number. Include in specificationNotes as liters.
- Include the full model name with edition/variant (e.g. "AMG GT S 130th Edition", not just "GT")
- For grade, read both overall grade number AND interior grade letter if present
- For price, multiply 万円 values by 10000 for actual yen
- Use these exact brand names when applicable: Ferrari, Mercedes-AMG, Porsche, Lamborghini, Bentley, Aston Martin, Jaguar, Maserati, BMW M, Range Rover

Return ONLY valid JSON:
{
  "extracted": {
    "make": "<brand in English or null>",
    "model": "<full model name with variant or null>",
    "year": <4-digit year integer or null>,
    "mileageKm": <exact integer or null>,
    "driveSide": "<LHD or RHD or null>",
    "askingPriceJpy": <price in JPY integer or null>,
    "exteriorColor": "<color in English or null>",
    "interiorColor": "<color/material in English or null>",
    "transmission": "<AUTOMATIC|MANUAL|DCT|PDK|SMG or null>",
    "fuelType": "<PETROL|DIESEL|HYBRID|ELECTRIC or null>",
    "auctionGrade": <grade as number or null>,
    "accidentHistory": <true or false or null>,
    "specificationNotes": "<comma-separated: displacement, equipment, features, edition details, condition notes or null>"
  },
  "summary": "<1-2 sentence description of the vehicle based on what you found>"
}

If a field is truly not visible in ANY of the images, use null. But most fields ARE present on auction sheets — read very carefully.`;

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

    // Convert all files to base64 images for vision
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

    const result = await callClaudeVision({
      prompt: EXTRACTION_PROMPT,
      images,
      system: SYSTEM_PROMPT,
      maxTokens: 4096,
    });

    if (!result || typeof result !== "object" || !result.extracted) {
      return Response.json({ error: "Could not extract data from images" }, { status: 422 });
    }

    // Normalize auction grade
    const extracted = result.extracted;
    if (extracted.auctionGrade != null) {
      const g = String(extracted.auctionGrade).toUpperCase();
      if (g === "S") extracted.auctionGrade = 6;
      else extracted.auctionGrade = parseFloat(g) || null;
    }

    // Identify missing required fields
    const requiredFields = [
      { key: "make", label: "Vehicle brand/make", question: "What is the vehicle brand? (e.g. Ferrari, Porsche, Mercedes-AMG)" },
      { key: "model", label: "Model name", question: "What is the exact model name? (e.g. 488 GTB, 911 Turbo S, AMG GT)" },
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
