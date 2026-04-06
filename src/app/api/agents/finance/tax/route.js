import { getLatestTaxReport } from "@/lib/agents/finance/storage";

export async function GET() {
  const report = getLatestTaxReport();
  if (!report) return Response.json({ message: "No tax report generated yet. Run a financial check first." });
  return Response.json(report);
}
