import { isAIAvailable } from "@/lib/claude";
import { runFullScan } from "@/lib/agents/jp-sourcing/ai/scan-engine";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  if (!isAIAvailable()) {
    return Response.json({ error: "AI not available. Add OPENROUTER_API_KEY.", aiPowered: false }, { status: 503 });
  }

  try {
    const result = await runFullScan({
      deepAnalysis: body.deepAnalysis !== false,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: `Scan failed: ${error.message}`, aiPowered: true }, { status: 500 });
  }
}
