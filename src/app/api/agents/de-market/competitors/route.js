import { getLatestCompetitors } from "@/lib/agents/de-market/storage";

export async function GET() {
  const real = getLatestCompetitors();

  if (real?.competitors?.length > 0) {
    return Response.json({ ...real, aiPowered: true });
  }

  return Response.json({
    competitors: [],
    count: 0,
    aiPowered: false,
    message: "No competitor data available. Run a market scan first.",
  });
}
