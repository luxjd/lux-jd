import { db } from "@/lib/db-storage";

export async function GET() {
  try {
    const valuations = await db.valuations.getAll(50);

    // Compute stats
    const total = valuations.length;
    const verdicts = { BUY: 0, REVIEW: 0, PASS: 0 };
    let totalMargin = 0;
    let marginCount = 0;
    let pipelineCount = 0;

    for (const v of valuations) {
      if (v.verdict && verdicts[v.verdict] !== undefined) verdicts[v.verdict]++;
      if (v.marginEur != null) { totalMargin += v.marginEur; marginCount++; }
      // Check if vehicle exists in pipeline (has a vehicleId link)
      if (v.vehicleId) pipelineCount++;
    }

    const avgMargin = marginCount > 0 ? Math.round(totalMargin / marginCount) : null;

    // Recent valuations (last 10) — lightweight summary
    const recent = valuations.slice(0, 10).map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      verdict: v.verdict,
      marginEur: v.marginEur,
      confidence: v.confidence,
      aiPowered: v.aiPowered,
      processingTime: v.processingTime,
      createdAt: v.createdAt,
    }));

    return Response.json({
      stats: {
        total,
        verdicts,
        avgMarginEur: avgMargin,
        pipelineCount,
      },
      recent,
    });
  } catch (err) {
    // DB not available — return empty stats
    return Response.json({
      stats: { total: 0, verdicts: { BUY: 0, REVIEW: 0, PASS: 0 }, avgMarginEur: null, pipelineCount: 0 },
      recent: [],
    });
  }
}
