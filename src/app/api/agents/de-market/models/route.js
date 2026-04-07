import { TRACKED_MODELS } from "@/lib/agents/de-market/constants";
import { getLatestTVRs } from "@/lib/agents/de-market/storage";

export async function GET() {
  const realData = getLatestTVRs();

  // Merge tracked models config with any real scan data
  const models = TRACKED_MODELS.map((m) => {
    const tvr = realData?.reports?.find((r) => r.modelId === m.id);
    return {
      id: m.id,
      make: m.make,
      model: m.model,
      yearRange: m.yearRange,
      segment: m.segment,
      tracking: true,
      confidence: tvr?.confidence || null,
      velocityScore: tvr?.demand?.velocityScore || null,
      medianPrice: tvr?.marketValue?.medianEur || null,
      lastScanned: tvr?.generatedAt || null,
    };
  });

  return Response.json({ models, count: models.length });
}
