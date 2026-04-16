import { isAIAvailable } from "@/lib/claude";
import { generateRealValuation } from "@/lib/agents/valuation/real-engine";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured. AI is required for valuations." },
      { status: 503 }
    );
  }

  const contentType = request.headers.get("content-type") || "";
  let input;
  let images = [];
  let auctionSheetImage = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    input = {
      make: formData.get("make"),
      model: formData.get("model"),
      year: parseInt(formData.get("year")),
      mileageKm: parseInt(formData.get("mileageKm")),
      driveSide: formData.get("driveSide"),
      askingPriceJpy: parseInt(formData.get("askingPriceJpy")),
      exteriorColor: formData.get("exteriorColor"),
      interiorColor: formData.get("interiorColor") || "",
      serviceHistory: formData.get("serviceHistory") || "UNKNOWN",
      accidentHistory: formData.get("accidentHistory") === "true",
      auctionGrade: formData.get("auctionGrade") ? parseFloat(formData.get("auctionGrade")) : null,
      specificationNotes: formData.get("specificationNotes") || "",
    };

    const photoFiles = formData.getAll("photos");
    for (const file of photoFiles) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = file.type || "image/jpeg";
        images.push({ data: base64, mediaType });
      }
    }

    const sheetFile = formData.get("auctionSheet");
    if (sheetFile && sheetFile.size > 0) {
      const buffer = await sheetFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      auctionSheetImage = { data: base64, mediaType: sheetFile.type || "image/jpeg" };
    }
  } else {
    input = await request.json();
  }

  const required = ["make", "model", "year", "mileageKm", "driveSide", "askingPriceJpy", "exteriorColor"];
  for (const field of required) {
    if (!input[field]) {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  try {
    const report = await generateRealValuation({
      ...input,
      images: images.length > 0 ? images : null,
      auctionSheetImage,
    });

    try {
      const saved = await db.valuations.create({
        make: input.make,
        model: input.model,
        year: input.year,
        inputData: input,
        reportData: report,
        verdict: report.recommendation?.verdict,
        marginEur: report.marginAnalysis?.grossMarginEur,
        confidence: report.marginAnalysis?.marginConfidence,
        aiPowered: true,
        processingTime: report.processingTimeSeconds,
      });
      if (saved?.id) {
        report.valuationId = saved.id;
      }
    } catch (e) {
      console.warn("DB save failed:", e.message);
    }

    return Response.json(report);
  } catch (error) {
    console.error("Valuation failed:", error.message);
    const status = error.code === "NO_MARKET_DATA" ? 404 : 500;
    return Response.json(
      { error: error.message, code: error.code || "VALUATION_ERROR" },
      { status }
    );
  }
}
