import { competitors } from "@/lib/agents/de-market/mock-data";

export async function GET() {
  return Response.json({ competitors, count: competitors.length });
}
