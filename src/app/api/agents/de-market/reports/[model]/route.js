import { getLatestTVRs, getLatestScanResults, getPriceHistory } from "@/lib/agents/de-market/storage";

export async function GET(request, { params }) {
  const { model } = await params;

  const realTVRs = getLatestTVRs();
  const realScans = getLatestScanResults();

  if (realTVRs?.reports?.length > 0) {
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

  return Response.json({ error: "Model not found. Run a market scan first." }, { status: 404 });
}
