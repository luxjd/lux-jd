import { checkFxRate } from "@/lib/agents/finance/ai/fx-monitor";
import { getFxHistory } from "@/lib/agents/finance/storage";

export async function GET() {
  const history = getFxHistory();
  const check = await checkFxRate(history.rates || []);
  return Response.json(check);
}
