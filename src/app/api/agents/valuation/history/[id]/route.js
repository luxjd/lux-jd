import { db } from "@/lib/db-storage";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ error: "Missing valuation ID" }, { status: 400 });
    }

    // Fetch all valuations and find by id (db-storage uses getAll)
    const valuations = await db.valuations.getAll(100);
    const valuation = valuations.find((v) => v.id === id);

    if (!valuation) {
      return Response.json({ error: "Valuation not found" }, { status: 404 });
    }

    return Response.json({
      id: valuation.id,
      make: valuation.make,
      model: valuation.model,
      year: valuation.year,
      verdict: valuation.verdict,
      marginEur: valuation.marginEur,
      confidence: valuation.confidence,
      report: valuation.reportData,
      createdAt: valuation.createdAt,
    });
  } catch (err) {
    console.error("Valuation fetch error:", err.message);
    return Response.json({ error: "Failed to load valuation" }, { status: 500 });
  }
}
