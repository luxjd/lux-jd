import { getLatestTVRs } from "@/lib/agents/de-market/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const minConfidence = parseFloat(searchParams.get("minConfidence") || "0");

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

  return Response.json({
    reports: [],
    count: 0,
    generatedAt: null,
    aiPowered: false,
    message: "No scan data available. Run a market scan first via POST /api/agents/de-market/scan",
  });
}
