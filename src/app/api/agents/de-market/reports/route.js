import { trackedModels } from "@/lib/agents/de-market/mock-data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minConfidence = parseFloat(searchParams.get("minConfidence") || "0");

  const reports = trackedModels
    .filter((m) => m.tracking && m.confidence >= minConfidence)
    .map((m) => ({
      reportType: "TARGET_VEHICLE_REPORT",
      modelId: m.id,
      make: m.make,
      model: m.model,
      yearRange: m.yearRange,
      pricing: m.pricing,
      trend: m.trend,
      demand: m.demand,
      recommendedMaxLandedCost: m.recommendedMaxLandedCost,
      minimumMargin: m.minimumMargin,
      confidence: m.confidence,
      lastUpdated: m.lastUpdated,
    }));

  return Response.json({ reports, count: reports.length, generatedAt: new Date().toISOString() });
}
