/**
 * FX Rate Fetcher — live JPY/EUR with volatility scoring.
 *
 * Features:
 * - Live rate from frankfurter.app (free, no key)
 * - 30-day historical rates for volatility calculation
 * - Volatility scoring (0-1 scale)
 * - Fallback to env var or hardcoded rate
 */

const FALLBACK_RATE = parseFloat(process.env.FX_FALLBACK_RATE || "166.80");
const VOLATILITY_ALERT_PCT = 3; // Alert if 30-day std dev > 3%

/**
 * Fetch live JPY/EUR rate with volatility analysis.
 */
export async function fetchFxRate() {
  let liveRate = null;
  let historicalRates = [];
  let source = "fallback";

  // Fetch live rate + historical in parallel.
  // 90-day window lets JP Sourcing currency_risk use 90-day moving average
  // (docx §6.2.4: "rate within 2% of 90-day avg" → LOW / 2-5% → MED / >5% → HIGH).
  // 30-day stddev and 7-day MA are still computed from the series for short-term alerts.
  const [liveResult, histResult] = await Promise.allSettled([
    fetchLiveRate(),
    fetchHistoricalRates(90),
  ]);

  if (liveResult.status === "fulfilled" && liveResult.value) {
    liveRate = liveResult.value.rate;
    source = "frankfurter.app";
  }

  if (histResult.status === "fulfilled" && histResult.value) {
    historicalRates = histResult.value;
  }

  const rate = liveRate || FALLBACK_RATE;

  // Calculate volatility metrics
  const volatility = calculateVolatility(historicalRates, rate);

  // Validate rate is reasonable
  if (rate < 100 || rate > 300) {
    console.warn(`FX rate ${rate} outside reasonable range, using fallback`);
    return {
      rate: FALLBACK_RATE,
      source: "fallback",
      live: false,
      timestamp: new Date().toISOString().split("T")[0],
      volatility,
    };
  }

  return {
    rate,
    source,
    live: !!liveRate,
    timestamp: new Date().toISOString().split("T")[0],
    volatility,
  };
}

async function fetchLiveRate() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=JPY", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`FX API returned ${res.status}`);
    const data = await res.json();
    const rate = data.rates?.JPY;
    if (!rate || rate < 100 || rate > 300) throw new Error("Invalid rate");
    return { rate, date: data.date };
  } catch {
    return null;
  }
}

async function fetchHistoricalRates(days) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const from = startDate.toISOString().split("T")[0];
    const to = endDate.toISOString().split("T")[0];

    const res = await fetch(`https://api.frankfurter.app/${from}..${to}?from=EUR&to=JPY`, {
      next: { revalidate: 86400 }, // Cache historical for 24h
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.rates) return [];

    return Object.entries(data.rates).map(([date, rates]) => ({
      date,
      rate: rates.JPY,
    })).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Calculate FX volatility metrics from historical rates.
 *
 * Windows computed from the (up to) 90-day series:
 *   - 7-day moving average (last 7 rates)
 *   - 30-day moving average + stddev (last 30 rates)  — short-term volatility alerts
 *   - 90-day moving average (all available rates)     — docx §6.2.4 currency risk
 */
function calculateVolatility(historicalRates, currentRate) {
  if (historicalRates.length < 5) {
    return {
      stdDevPct: null,
      movingAvg7d: null,
      movingAvg30d: null,
      movingAvg90d: null,
      deviationFromMa7d: null,
      deviationFromMa30d: null,
      deviationFromMa90d: null,
      volatilityScore: 0.5, // Unknown = moderate assumption
      alert: false,
      alertReason: null,
      dataPoints: historicalRates.length,
    };
  }

  const rates = historicalRates.map((r) => r.rate);

  // 30-day window (last 30 rates) — preserves the existing stdDevPct semantic
  const last30 = rates.slice(-30);
  const mean30 = last30.reduce((a, b) => a + b, 0) / last30.length;
  const variance30 = last30.reduce((s, r) => s + Math.pow(r - mean30, 2), 0) / last30.length;
  const stdDev30 = Math.sqrt(variance30);
  const stdDevPct = (stdDev30 / mean30) * 100;

  // 90-day window (all available rates up to 90)
  const last90 = rates.slice(-90);
  const mean90 = last90.reduce((a, b) => a + b, 0) / last90.length;

  // 7-day window
  const last7 = rates.slice(-7);
  const movingAvg7d = last7.reduce((a, b) => a + b, 0) / last7.length;

  // Deviations of the current rate from each moving average
  const deviationFromMa7d = ((currentRate - movingAvg7d) / movingAvg7d) * 100;
  const deviationFromMa30d = ((currentRate - mean30) / mean30) * 100;
  const deviationFromMa90d = ((currentRate - mean90) / mean90) * 100;

  // Volatility score remains driven by 30-day stddev (short-term instability signal)
  let volatilityScore;
  if (stdDevPct < 0.5) volatilityScore = 0.1;
  else if (stdDevPct < 1.0) volatilityScore = 0.3;
  else if (stdDevPct < 2.0) volatilityScore = 0.5;
  else if (stdDevPct < 3.0) volatilityScore = 0.7;
  else volatilityScore = 0.9;

  const alert = stdDevPct > VOLATILITY_ALERT_PCT || Math.abs(deviationFromMa7d) > 2;
  const alertReason = alert
    ? `FX volatility is elevated: ${stdDevPct.toFixed(1)}% 30-day std dev, ${deviationFromMa7d > 0 ? "+" : ""}${deviationFromMa7d.toFixed(1)}% from 7-day MA`
    : null;

  return {
    stdDevPct: Number(stdDevPct.toFixed(2)),
    movingAvg7d: Number(movingAvg7d.toFixed(2)),
    movingAvg30d: Number(mean30.toFixed(2)),
    movingAvg90d: Number(mean90.toFixed(2)),
    deviationFromMa7d: Number(deviationFromMa7d.toFixed(2)),
    deviationFromMa30d: Number(deviationFromMa30d.toFixed(2)),
    deviationFromMa90d: Number(deviationFromMa90d.toFixed(2)),
    volatilityScore,
    alert,
    alertReason,
    dataPoints: rates.length,
  };
}
