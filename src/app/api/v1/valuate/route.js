// Spec §2.2.3 — the spec-compliant REST endpoint.
// Request shape:  POST /api/v1/valuate, Content-Type: multipart/form-data
// Response shape: { valuation_id, status, report: { ... snake_case ValuationReport } }
//
// The existing /api/agents/valuation/valuate endpoint stays camelCase so the
// in-app UI doesn't have to change. This route is the external integration
// point described in §2.2.3 and used by the CLI (scripts/valuate-cli.mjs).

import { isAIAvailable } from "@/lib/claude";
import { generateRealValuation } from "@/lib/agents/valuation/real-engine";
import { db } from "@/lib/db-storage";
import { deepSnakeCase } from "@/lib/agents/valuation/snake-case";

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured. AI is required for valuations." },
      { status: 503 }
    );
  }

  const contentType = request.headers.get("content-type") || "";
  let input;
  const images = [];
  let auctionSheetImage = null;
  const additionalDocImages = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawAskingPrice = formData.get("asking_price_jpy") ?? formData.get("askingPriceJpy");
    input = {
      make: formData.get("make"),
      model: formData.get("model"),
      year: parseInt(formData.get("year")),
      mileageKm: parseInt(formData.get("mileage_km") ?? formData.get("mileageKm")),
      driveSide: formData.get("drive_side") ?? formData.get("driveSide"),
      askingPriceJpy: rawAskingPrice ? parseInt(rawAskingPrice) : null,
      exteriorColor: formData.get("exterior_color") ?? formData.get("exteriorColor"),
      interiorColor: formData.get("interior_color") ?? formData.get("interiorColor") ?? "",
      transmission: formData.get("transmission") || "",
      fuelType: formData.get("fuel_type") ?? formData.get("fuelType") ?? "",
      serviceHistory: formData.get("service_history") ?? formData.get("serviceHistory") ?? "UNKNOWN",
      accidentHistory: formData.get("accident_history") === "true" || formData.get("accidentHistory") === "true",
      auctionGrade: formData.get("auction_grade")
        ? parseFloat(formData.get("auction_grade"))
        : formData.get("auctionGrade")
        ? parseFloat(formData.get("auctionGrade"))
        : null,
      specificationNotes: formData.get("specification_notes") ?? formData.get("specificationNotes") ?? "",
      // Spec §2.1 makes asking_price_jpy REQUIRED. The opt-in guidance_mode
      // flag still lets callers ask for a max-bid ceiling without a price.
      guidanceMode: formData.get("guidance_mode") === "true" || formData.get("guidanceMode") === "true",
    };

    for (const file of formData.getAll("photos")) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        images.push({ data: Buffer.from(buffer).toString("base64"), mediaType: file.type || "image/jpeg" });
      }
    }
    const sheetFile = formData.get("auction_sheet") ?? formData.get("auctionSheet");
    if (sheetFile && sheetFile.size > 0) {
      const buffer = await sheetFile.arrayBuffer();
      auctionSheetImage = { data: Buffer.from(buffer).toString("base64"), mediaType: sheetFile.type || "image/jpeg" };
    }
    for (const file of formData.getAll("additional_docs").length ? formData.getAll("additional_docs") : formData.getAll("additionalDocs")) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        additionalDocImages.push({ data: Buffer.from(buffer).toString("base64"), mediaType: file.type || "image/jpeg" });
      }
    }
  } else {
    const body = await request.json();
    // Accept snake_case OR camelCase in the JSON body.
    input = {
      make: body.make,
      model: body.model,
      year: body.year,
      mileageKm: body.mileage_km ?? body.mileageKm,
      driveSide: body.drive_side ?? body.driveSide,
      askingPriceJpy: body.asking_price_jpy ?? body.askingPriceJpy ?? null,
      exteriorColor: body.exterior_color ?? body.exteriorColor,
      interiorColor: body.interior_color ?? body.interiorColor ?? "",
      transmission: body.transmission ?? "",
      fuelType: body.fuel_type ?? body.fuelType ?? "",
      serviceHistory: body.service_history ?? body.serviceHistory ?? "UNKNOWN",
      accidentHistory: !!(body.accident_history ?? body.accidentHistory),
      auctionGrade: body.auction_grade ?? body.auctionGrade ?? null,
      specificationNotes: body.specification_notes ?? body.specificationNotes ?? "",
      guidanceMode: !!(body.guidance_mode ?? body.guidanceMode),
    };
  }

  const required = ["make", "model", "year", "mileageKm", "driveSide", "exteriorColor"];
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
      additionalDocImages: additionalDocImages.length > 0 ? additionalDocImages : null,
    });

    let valuationId = report.valuationId;
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
        valuationId = saved.id;
      }
    } catch (e) {
      console.warn("DB save failed:", e.message);
    }

    // Spec §2.2.3 shape: { valuation_id, status, report }
    return Response.json({
      valuation_id: valuationId,
      status: "completed",
      report: deepSnakeCase(report),
    });
  } catch (error) {
    console.error("Valuation failed:", error.message);
    const status = error.code === "NO_MARKET_DATA" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 500;
    return Response.json(
      { error: error.message, code: error.code || "VALUATION_ERROR" },
      { status }
    );
  }
}
