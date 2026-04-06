import { isAIAvailable } from "@/lib/claude";
import { generateRealValuation } from "@/lib/agents/valuation/real-engine";
import { generateValuation as generateMockValuation } from "@/lib/agents/valuation/engine";
import { db } from "@/lib/db-storage";

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  let input;
  let images = [];
  let auctionSheetImage = null;

  if (contentType.includes("multipart/form-data")) {
    // Handle file uploads
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

    // Process photo files → base64
    const photoFiles = formData.getAll("photos");
    for (const file of photoFiles) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = file.type || "image/jpeg";
        images.push({ data: base64, mediaType });
      }
    }

    // Process auction sheet → base64
    const sheetFile = formData.get("auctionSheet");
    if (sheetFile && sheetFile.size > 0) {
      const buffer = await sheetFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      auctionSheetImage = { data: base64, mediaType: sheetFile.type || "image/jpeg" };
    }
  } else {
    // JSON input (no files)
    input = await request.json();
  }

  // Validate required fields
  const required = ["make", "model", "year", "mileageKm", "driveSide", "askingPriceJpy", "exteriorColor"];
  for (const field of required) {
    if (!input[field]) {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  // Use real AI engine if API key available, otherwise mock
  if (isAIAvailable()) {
    try {
      const report = await generateRealValuation({
        ...input,
        images: images.length > 0 ? images : null,
        auctionSheetImage,
      });

      // Save to PostgreSQL
      try {
        await db.valuations.create({
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
      } catch (e) { console.warn("DB save failed:", e.message); }

      return Response.json(report);
    } catch (error) {
      console.error("Real valuation failed, falling back to mock:", error.message);
      // Fallback to mock on error
      const report = generateMockValuation(input);
      report.aiPowered = false;
      report.fallbackReason = error.message;
      return Response.json(report);
    }
  } else {
    const report = generateMockValuation(input);
    report.aiPowered = false;

    try {
      await db.valuations.create({
        make: input.make, model: input.model, year: input.year,
        inputData: input, reportData: report,
        verdict: report.recommendation?.verdict,
        marginEur: report.marginAnalysis?.grossMarginEur,
        confidence: report.marginAnalysis?.marginConfidence,
        aiPowered: false, processingTime: report.processingTimeSeconds,
      });
    } catch (e) { console.warn("DB save failed:", e.message); }

    return Response.json(report);
  }
}
