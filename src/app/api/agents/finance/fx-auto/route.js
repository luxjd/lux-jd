import { checkFxRate, calculateFxImpact } from "@/lib/agents/finance/ai/fx-monitor";
import { getFxHistory, addFxRate, addFxAlert, updateAgentStatus } from "@/lib/agents/finance/storage";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";
import { db } from "@/lib/db-storage";

/**
 * GET — Automated FX check. Designed to be called by a cron job every hour.
 *
 * Can be triggered via:
 *   - External cron service (e.g., cron-job.org, Vercel Cron, Railway Cron)
 *   - curl http://localhost:3000/api/agents/finance/fx-auto
 *
 * Fetches live EUR/JPY rate, checks thresholds, saves to history,
 * calculates FX impact on all pipeline vehicles.
 */
export async function GET(request) {
  // Optional: verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fxHistory = await getFxHistory();
    const fxCheck = await checkFxRate(fxHistory.rates || []);

    // Save rate to history
    await addFxRate(fxCheck.current.rate);

    // Save to PostgreSQL if available
    try {
      await db.fxRates.create({
        rate: fxCheck.current.rate,
        source: fxCheck.current.source,
        live: fxCheck.current.live,
      });
    } catch { /* silent */ }

    // Process alerts
    if (fxCheck.alerts.length > 0) {
      for (const alert of fxCheck.alerts) {
        await addFxAlert(alert);
        try {
          await db.fxAlerts.create({
            level: alert.level,
            type: alert.type,
            message: alert.message,
            impact: alert.impact,
          });
        } catch { /* silent */ }
      }
    }

    // Calculate FX impact on all pipeline vehicles
    const data = await getPipelineVehicles();
    const vehicles = data.vehicles || [];
    const fxImpacts = vehicles
      .map((v) => {
        const impact = calculateFxImpact(v, fxCheck.current.rate);
        return impact ? { vehicleId: v.id, make: v.make, model: v.model, ...impact } : null;
      })
      .filter(Boolean);

    const totalExposure = fxImpacts.reduce((s, i) => s + (i.impactEur || 0), 0);

    // Update agent status
    await updateAgentStatus({
      status: "ONLINE",
      lastAction: `FX auto-check: ¥${fxCheck.current.rate.toFixed(2)}/€ — ${fxCheck.alerts.length} alerts`,
      lastFxCheckTimestamp: new Date().toISOString(),
      fxRate: fxCheck.current.rate,
      fxStatus: fxCheck.status,
      alertCount: fxCheck.alerts.length,
    });

    return Response.json({
      rate: fxCheck.current.rate,
      live: fxCheck.current.live,
      status: fxCheck.status,
      alerts: fxCheck.alerts,
      averages: fxCheck.averages,
      changes: fxCheck.changes,
      portfolioExposure: {
        vehiclesTracked: fxImpacts.length,
        totalImpactEur: totalExposure,
        direction: totalExposure > 0 ? "FAVORABLE" : totalExposure < 0 ? "UNFAVORABLE" : "NEUTRAL",
        perVehicle: fxImpacts,
      },
      checkedAt: fxCheck.checkedAt,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
