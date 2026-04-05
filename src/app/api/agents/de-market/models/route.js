import { trackedModels } from "@/lib/agents/de-market/mock-data";

export async function GET() {
  const models = trackedModels.map((m) => ({
    id: m.id,
    make: m.make,
    model: m.model,
    yearRange: m.yearRange,
    segment: m.segment,
    tracking: m.tracking,
    confidence: m.confidence,
    velocityScore: m.demand.velocityScore,
    medianPrice: m.pricing.medianEur,
  }));

  return Response.json({ models, count: models.length });
}
