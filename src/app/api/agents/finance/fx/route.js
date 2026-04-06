import { checkFxRate } from "@/lib/agents/finance/ai/fx-monitor";
import { getFxHistory } from "@/lib/agents/finance/storage";
import { db } from "@/lib/db-storage";

export async function GET() {
  const history = getFxHistory();
  const check = await checkFxRate(history.rates || []);

  // Save to PostgreSQL
  try {
    await db.fxRates.create({ rate: check.current.rate, source: check.current.source, live: check.current.live });
    for (const alert of (check.alerts || [])) {
      await db.fxAlerts.create({ level: alert.level, type: alert.type, message: alert.message, impact: alert.impact });
    }
  } catch (e) { /* silent */ }

  return Response.json(check);
}
