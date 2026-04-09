import { isAIAvailable } from "@/lib/claude";
import { parseAuctionSheet } from "@/lib/agents/valuation/sheet-parser";

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
    const image = { data: base64, mediaType };

    // Use quick mode for the parse-sheet endpoint (used during form upload)
    // Full multi-pass analysis happens later in the valuation pipeline
    const result = await parseAuctionSheet(image, { quickMode: true });

    if (!result || typeof result !== "object") {
      return Response.json({ error: "Could not parse auction sheet" }, { status: 422 });
    }

    // Map enriched sheet output to form-friendly field format
    const fields = {
      make: result.make || null,
      model: result.model || null,
      year: result.year || null,
      mileageKm: result.mileage_reading || null,
      driveSide: result.drive_side || null,
      auctionGrade: result.overall_grade != null ? String(result.overall_grade) : null,
      transmission: result.transmission || null,
      fuelType: result.fuel_type || null,
      exteriorColor: result.exterior_color || null,
      interiorColor: result.interior_color || null,
      accidentHistory: result.accident_history ?? null,
      askingPriceJpy: result.start_price_jpy || result.sold_price_jpy || null,
      displacementCc: result.displacement_cc || null,
      specificationNotes: [
        result.displacement_liters ? `Engine: ${result.displacement_liters}` : null,
        ...(result.equipment_notes || []),
        ...(result.sales_points || []),
        ...(result.caution_notes || []),
        ...(result.inspector_notes || []),
        ...(result.modification_notes || []),
      ].filter(Boolean).join(", ") || null,
    };

    // Normalize S grade to 6
    if (fields.auctionGrade != null) {
      const g = String(fields.auctionGrade).toUpperCase();
      if (g === "S") fields.auctionGrade = "6";
    }

    return Response.json({ fields });
  } catch (err) {
    console.error("Auction sheet parse error:", err);
    return Response.json({ error: "Failed to parse auction sheet" }, { status: 500 });
  }
}
