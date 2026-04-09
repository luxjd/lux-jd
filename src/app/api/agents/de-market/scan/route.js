import { isAIAvailable } from "@/lib/claude";
import { runFullScan, runQuickScan } from "@/lib/agents/de-market/ai/scan-engine";
import { agentGuard } from "@/lib/settings";

export async function POST(request) {
  const blocked = await agentGuard("de-market");
  if (blocked) return blocked;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // No body = full scan
  }

  if (!isAIAvailable()) {
    return Response.json({
      error: "AI not available. Add OPENROUTER_API_KEY to .env.local",
      aiPowered: false,
    }, { status: 503 });
  }

  try {
    // Quick scan for a single model
    if (body.modelId) {
      const result = await runQuickScan(body.modelId);
      return Response.json(result);
    }

    // Full scan (all models + competitors)
    const result = await runFullScan({
      modelIds: body.modelIds || null,
      includeCompetitors: body.includeCompetitors !== false,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({
      error: `Scan failed: ${error.message}`,
      aiPowered: true,
    }, { status: 500 });
  }
}
