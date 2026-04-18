import { getPriceHistory } from "./storage";

function linearSlopePct(points, anchorMedian) {
  if (points.length < 2 || !anchorMedian) return 0;
  const xs = points.map((p) => new Date(p.timestamp).getTime() / 86400000);
  const ys = points.map((p) => p.median);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slopePerDay = den > 0 ? num / den : 0;
  const periodDays = xs[xs.length - 1] - xs[0];
  const totalChange = slopePerDay * periodDays;
  return Number(((totalChange / anchorMedian) * 100).toFixed(2));
}

function classify(pct7, pct30, pct90) {
  const signal = pct30 !== 0 ? pct30 : pct90 !== 0 ? pct90 : pct7;
  if (signal >= 2.0) return "APPRECIATING";
  if (signal <= -2.0) return "DEPRECIATING";
  return "STABLE";
}

function seasonalFactor() {
  const m = new Date().getUTCMonth() + 1;
  if (m >= 3 && m <= 5) return { factor: "POSITIVE", notes: "Spring: convertibles and GT demand rising" };
  if (m >= 9 && m <= 11) return { factor: "POSITIVE", notes: "Autumn: GT / all-weather demand rising" };
  if (m === 12 || m <= 2) return { factor: "NEGATIVE", notes: "Winter: soft-top and exotic demand subdued" };
  return { factor: "NEUTRAL", notes: "Mid-season baseline demand" };
}

export async function computeTrendFromHistory(modelId, currentMedian) {
  const data = await getPriceHistory(modelId);
  const history = (data?.history || []).filter((p) => p.median && p.timestamp).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (history.length < 2) return null;

  const now = Date.now();
  const window = (days) => history.filter((p) => (now - new Date(p.timestamp).getTime()) / 86400000 <= days);
  const anchor = currentMedian || history[history.length - 1].median;

  const pct7 = linearSlopePct(window(7), anchor);
  const pct30 = linearSlopePct(window(30), anchor);
  const pct90 = linearSlopePct(window(90), anchor);
  const season = seasonalFactor();

  return {
    direction: classify(pct7, pct30, pct90),
    change_7d_pct: pct7,
    change_30d_pct: pct30,
    change_90d_pct: pct90,
    seasonal_factor: season.factor,
    seasonal_notes: season.notes,
    data_source: "snapshot_regression",
    data_points: history.length,
  };
}
