import { getUsageLog, getTotalCost, resetUsageLog } from "@/lib/claude";

/**
 * GET /api/agents/valuation/cost
 * Returns LLM usage stats for the current server session.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const reset = url.searchParams.get("reset") === "1";

  const log = getUsageLog();
  const totalCost = getTotalCost();

  const byModel = {};
  for (const entry of log) {
    const model = entry.model?.split("/").pop() || "unknown";
    if (!byModel[model]) byModel[model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    byModel[model].calls++;
    byModel[model].inputTokens += entry.promptTokens || 0;
    byModel[model].outputTokens += entry.completionTokens || 0;
    byModel[model].cost += entry.estimatedCost || 0;
  }

  for (const m of Object.values(byModel)) {
    m.cost = Math.round(m.cost * 1e4) / 1e4;
  }

  const result = {
    totalCalls: log.length,
    totalCost: `$${totalCost.toFixed(4)}`,
    byModel,
    recentCalls: log.slice(-20).reverse().map((e) => ({
      model: e.model?.split("/").pop(),
      tokens: `${e.promptTokens}+${e.completionTokens}`,
      cost: `$${(e.estimatedCost || 0).toFixed(4)}`,
      ago: `${Math.round((Date.now() - e.timestamp) / 1000)}s ago`,
    })),
  };

  if (reset) {
    resetUsageLog();
    result.message = "Usage log reset";
  }

  return Response.json(result);
}
