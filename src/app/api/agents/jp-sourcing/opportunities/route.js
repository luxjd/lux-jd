import { getLatestOpportunities, getScanHistory } from "@/lib/agents/jp-sourcing/storage";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter"); // STRONG_BUY, BUY, REVIEW, PASS, ALL
  const minMargin = parseInt(searchParams.get("minMargin") || "0");

  const data = await getLatestOpportunities();

  if (!data?.opportunities?.length) {
    return Response.json({
      opportunities: [],
      count: 0,
      message: "No opportunities found. Run JP Sourcing Agent scan first.",
      aiPowered: false,
    });
  }

  let filtered = data.opportunities;

  if (filter && filter !== "ALL") {
    filtered = filtered.filter((o) => (o.refinedRecommendation || o.recommendation) === filter);
  }

  if (minMargin > 0) {
    filtered = filtered.filter((o) => (o.margin?.grossMarginEur || 0) >= minMargin);
  }

  return Response.json({
    opportunities: filtered,
    deepAnalyses: data.deepAnalyses || [],
    scanSummary: data.scanSummary,
    count: filtered.length,
    totalCount: data.count,
    scannedAt: data.scannedAt,
    scanHistory: ((await getScanHistory())?.scans || []).slice(-5),
    aiPowered: true,
  });
}
