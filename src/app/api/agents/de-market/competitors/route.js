import { getLatestCompetitors } from "@/lib/agents/de-market/storage";
import { competitors as mockCompetitors } from "@/lib/agents/de-market/mock-data";

export async function GET() {
  const real = getLatestCompetitors();

  if (real?.competitors?.length > 0) {
    return Response.json({ ...real, aiPowered: true });
  }

  return Response.json({ competitors: mockCompetitors, count: mockCompetitors.length, aiPowered: false });
}
