import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { savePortfolioSnapshot } from "@/lib/agents/orchestrator/storage";

export async function GET() {
  const portfolio = loadPortfolioState();
  savePortfolioSnapshot(portfolio);
  return Response.json(portfolio);
}
