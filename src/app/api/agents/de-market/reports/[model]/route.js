import { getLatestTVRs, getLatestScanResults, getPriceHistory } from "@/lib/agents/de-market/storage";

export async function GET(request, { params }) {
  const { model } = await params;

  const realTVRs = await getLatestTVRs();
  const realScans = await getLatestScanResults();

  const tvrList = realTVRs?.reports || [];
  const scanList = realScans?.results || [];

  // Match by modelId first (exact), then by constructed make-model slug
  const tvr = tvrList.find((r) => r.modelId === model)
    || tvrList.find((r) => {
      const slug = (r.vehicleSpec?.make + "-" + r.vehicleSpec?.model)
        .toLowerCase().replace(/[\s()]+/g, "-");
      return slug === model;
    });

  if (tvr) {
    const scan = scanList.find((r) => r.modelId === model) || null;
    const history = await getPriceHistory(model);

    return Response.json({
      ...tvr,
      scanData: scan,
      priceHistory: history?.history || [],
      aiPowered: true,
    });
  }

  return Response.json({ error: "Model not found. Run a market scan first." }, { status: 404 });
}
