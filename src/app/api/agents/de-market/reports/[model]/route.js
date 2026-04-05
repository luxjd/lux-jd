import { trackedModels, priceHistories } from "@/lib/agents/de-market/mock-data";

export async function GET(request, { params }) {
  const { model } = await params;
  const found = trackedModels.find((m) => m.id === model);

  if (!found) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  return Response.json({
    ...found,
    reportType: "TARGET_VEHICLE_REPORT",
    priceHistory: priceHistories[model] || [],
  });
}
