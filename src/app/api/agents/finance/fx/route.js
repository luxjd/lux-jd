import { checkFxRate, calculatePortfolioFxExposure } from "@/lib/agents/finance/ai/fx-monitor";
import { getFxHistory } from "@/lib/agents/finance/storage";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { db } from "@/lib/db-storage";

export async function GET() {
  const history = await getFxHistory();
  const check = await checkFxRate(history.rates || []);

  // Portfolio FX exposure
  const data = await getPipelineVehicles();
  const vehicles = data.vehicles || [];
  const exposure = calculatePortfolioFxExposure(vehicles, check.current.rate);

  // Save to PostgreSQL
  try {
    await db.fxRates.create({ rate: check.current.rate, source: check.current.source, live: check.current.live });
    for (const alert of (check.alerts || [])) {
      await db.fxAlerts.create({ level: alert.level, type: alert.type, message: alert.message, impact: alert.impact });
    }
  } catch (e) { /* silent */ }

  return Response.json({ ...check, portfolioExposure: exposure });
}
