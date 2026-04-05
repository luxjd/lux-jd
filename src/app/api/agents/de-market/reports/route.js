import { getLatestTVRs } from "@/lib/agents/de-market/storage";
import { trackedModels } from "@/lib/agents/de-market/mock-data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minConfidence = parseFloat(searchParams.get("minConfidence") || "0");

  // Try real TVRs first
  const realData = getLatestTVRs();

  if (realData?.reports?.length > 0) {
    const filtered = realData.reports.filter((r) => (r.confidence || 0) >= minConfidence);
    return Response.json({
      reports: filtered,
      count: filtered.length,
      generatedAt: realData.generatedAt,
      aiPowered: true,
    });
  }

  // Fallback to mock
  const reports = trackedModels
    .filter((m) => m.tracking && m.confidence >= minConfidence)
    .map((m) => ({
      reportType: "TARGET_VEHICLE_REPORT",
      modelId: m.id,
      vehicleSpec: { make: m.make, model: m.model, yearRange: m.yearRange },
      marketValue: { medianEur: m.pricing.medianEur, p25Eur: m.pricing.p25Eur, p75Eur: m.pricing.p75Eur },
      demand: m.demand,
      financialThresholds: { recommendedMaxLandedCostEur: m.recommendedMaxLandedCost, minimumAcceptableMarginEur: m.minimumMargin },
      confidence: m.confidence,
      generatedAt: m.lastUpdated,
    }));

  return Response.json({ reports, count: reports.length, generatedAt: new Date().toISOString(), aiPowered: false });
}
