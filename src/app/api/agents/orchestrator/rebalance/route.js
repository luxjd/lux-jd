import { loadPortfolioState } from "@/lib/agents/orchestrator/ai/portfolio-manager";
import { savePortfolioSnapshot } from "@/lib/agents/orchestrator/storage";
import { getPipelineVehicles } from "@/lib/agents/logistics/storage";

const MAX_BRAND_PCT = parseInt(process.env.MAX_BRAND_CONCENTRATION_PCT || "30") / 100;
const MAX_DEPLOYMENT_PCT = parseInt(process.env.MAX_CAPITAL_DEPLOYMENT_PCT || "80") / 100;

/**
 * GET — Run portfolio rebalancing check.
 * Returns alerts and recommendations for portfolio health.
 */
export async function GET() {
  const portfolio = loadPortfolioState();
  const vehicles = (getPipelineVehicles().vehicles || []);
  const alerts = [];
  const recommendations = [];

  // Check brand concentration
  for (const [brand, pct] of Object.entries(portfolio.brandConcentration)) {
    if (pct > MAX_BRAND_PCT) {
      alerts.push({
        level: "HIGH",
        type: "BRAND_CONCENTRATION",
        message: `${brand} at ${(pct * 100).toFixed(1)}% — exceeds ${MAX_BRAND_PCT * 100}% limit`,
        impact: "New purchases of this brand will be BLOCKED until concentration decreases",
      });
      recommendations.push({
        action: "SELL_OR_DIVERSIFY",
        detail: `Prioritize selling ${brand} vehicles or acquire different brands to reduce concentration`,
        brand,
        currentPct: Number((pct * 100).toFixed(1)),
        targetPct: MAX_BRAND_PCT * 100,
      });
    } else if (pct > MAX_BRAND_PCT * 0.8) {
      alerts.push({
        level: "WARN",
        type: "BRAND_APPROACHING_LIMIT",
        message: `${brand} at ${(pct * 100).toFixed(1)}% — approaching ${MAX_BRAND_PCT * 100}% limit`,
        impact: "Only 1-2 more vehicles of this brand can be added",
      });
    }
  }

  // Check capital deployment
  if (portfolio.deploymentPct > MAX_DEPLOYMENT_PCT * 100) {
    alerts.push({
      level: "HIGH",
      type: "CAPITAL_OVERDEPLOYED",
      message: `Capital ${portfolio.deploymentPct}% deployed — exceeds ${MAX_DEPLOYMENT_PCT * 100}% limit`,
      impact: "All new purchases BLOCKED until vehicles are sold",
    });
    recommendations.push({
      action: "ACCELERATE_SALES",
      detail: "Reduce capital deployment by selling pipeline vehicles faster. Consider price reductions on longest-listed vehicles.",
    });
  } else if (portfolio.deploymentPct > MAX_DEPLOYMENT_PCT * 100 * 0.9) {
    alerts.push({
      level: "WARN",
      type: "CAPITAL_APPROACHING_LIMIT",
      message: `Capital ${portfolio.deploymentPct}% deployed — approaching ${MAX_DEPLOYMENT_PCT * 100}% limit`,
      impact: "Limited capacity for new acquisitions",
    });
  }

  // Check segment diversification
  const totalVehicles = portfolio.totalVehicles;
  if (totalVehicles >= 3) {
    for (const [segment, count] of Object.entries(portfolio.segmentCounts)) {
      const pct = count / totalVehicles;
      if (pct > 0.6) {
        alerts.push({
          level: "WARN",
          type: "SEGMENT_IMBALANCE",
          message: `${segment} segment at ${(pct * 100).toFixed(0)}% (${count}/${totalVehicles}) — overweight`,
          impact: "Portfolio risk concentrated in one price tier",
        });
        recommendations.push({
          action: "DIVERSIFY_SEGMENTS",
          detail: `Add vehicles in ${segment === "STANDARD" ? "PREMIUM or ULTRA_PREMIUM" : "STANDARD"} segment to balance risk`,
        });
      }
    }
  }

  // Check stale vehicles (in pipeline >90 days)
  const staleVehicles = vehicles.filter((v) => {
    const daysInPipeline = Math.round((Date.now() - new Date(v.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return daysInPipeline > 90 && v.currentStage !== "SOLD";
  });
  if (staleVehicles.length > 0) {
    alerts.push({
      level: "WARN",
      type: "STALE_INVENTORY",
      message: `${staleVehicles.length} vehicle(s) in pipeline >90 days`,
      impact: "Capital tied up, opportunity cost increasing",
    });
    for (const v of staleVehicles) {
      recommendations.push({
        action: "REVIEW_STALE",
        detail: `${v.make} ${v.model} (${v.year}) at ${v.currentStage} — consider price reduction or wholesale`,
        vehicleId: v.id,
      });
    }
  }

  // Portfolio health summary
  const status = alerts.some((a) => a.level === "HIGH") ? "ACTION_REQUIRED"
    : alerts.some((a) => a.level === "WARN") ? "REVIEW_NEEDED"
    : "HEALTHY";

  const result = {
    status,
    healthScore: portfolio.healthScore,
    healthLevel: portfolio.healthLevel,
    deployment: {
      capitalDeployed: portfolio.totalCapitalDeployed,
      availableCapital: portfolio.totalAvailableCapital,
      deploymentPct: portfolio.deploymentPct,
      remainingCapacity: portfolio.remainingCapacity,
      canAddMore: portfolio.canAddMore,
    },
    brandConcentration: portfolio.brandConcentration,
    segmentDistribution: portfolio.segmentCounts,
    totalVehicles: portfolio.totalVehicles,
    alerts,
    recommendations,
    checkedAt: new Date().toISOString(),
  };

  savePortfolioSnapshot(result);

  return Response.json(result);
}
