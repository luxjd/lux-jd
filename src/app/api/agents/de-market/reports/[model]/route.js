import { getLatestTVRs, getLatestScanResults, getPriceHistory } from "@/lib/agents/de-market/storage";
import { trackedModels, priceHistories } from "@/lib/agents/de-market/mock-data";

export async function GET(request, { params }) {
  const { model } = await params;

  // Try real data first
  const realTVRs = getLatestTVRs();
  const realScans = getLatestScanResults();

  if (realTVRs?.reports?.length > 0) {
    // Find TVR matching this model ID
    const tvr = realTVRs.reports.find((r) => {
      const id = (r.vehicleSpec?.make + "-" + r.vehicleSpec?.model).toLowerCase().replace(/[\s()]+/g, "-");
      return id === model || r.modelId === model;
    });

    const scan = realScans?.results?.find((r) => r.modelId === model);
    const history = getPriceHistory(model);

    if (tvr) {
      return Response.json({
        ...tvr,
        scanData: scan || null,
        priceHistory: history?.history || [],
        aiPowered: true,
      });
    }
  }

  // Fallback to mock
  const found = trackedModels.find((m) => m.id === model);
  if (!found) {
    return Response.json({ error: "Model not found" }, { status: 404 });
  }

  return Response.json({
    ...found,
    reportType: "TARGET_VEHICLE_REPORT",
    priceHistory: priceHistories[model] || [],
    aiPowered: false,
  });
}
