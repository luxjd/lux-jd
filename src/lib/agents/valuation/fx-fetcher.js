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

  // Fetch live rate + historical in parallel
  const [liveResult, histResult] = await Promise.allSettled([
    fetchLiveRate(),
    fetchHistoricalRates(30),
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
 */
function calculateVolatility(historicalRates, currentRate) {
  if (historicalRates.length < 5) {
    return {
      stdDevPct: null,
      movingAvg7d: null,
      movingAvg30d: null,
      deviationFromMa7d: null,
      volatilityScore: 0.5, // Unknown = moderate assumption
      alert: false,
      alertReason: null,
    };
  }

  const rates = historicalRates.map((r) => r.rate);

  // Standard deviation
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length;
  const stdDev = Math.sqrt(variance);
  const stdDevPct = (stdDev / mean) * 100;

  // Moving averages
  const last7 = rates.slice(-7);
  const movingAvg7d = last7.reduce((a, b) => a + b, 0) / last7.length;
  const movingAvg30d = mean;

  // Deviation of current rate from 7-day MA
  const deviationFromMa7d = ((currentRate - movingAvg7d) / movingAvg7d) * 100;

  // Volatility score: 0 = very stable, 1 = very volatile
  // Based on 30-day std dev as % of mean
  let volatilityScore;
  if (stdDevPct < 0.5) volatilityScore = 0.1;
  else if (stdDevPct < 1.0) volatilityScore = 0.3;
  else if (stdDevPct < 2.0) volatilityScore = 0.5;
  else if (stdDevPct < 3.0) volatilityScore = 0.7;
  else volatilityScore = 0.9;

  // Alert if deviation is significant
  const alert = stdDevPct > VOLATILITY_ALERT_PCT || Math.abs(deviationFromMa7d) > 2;
  const alertReason = alert
    ? `FX volatility is elevated: ${stdDevPct.toFixed(1)}% 30-day std dev, ${deviationFromMa7d > 0 ? "+" : ""}${deviationFromMa7d.toFixed(1)}% from 7-day MA`
    : null;

  return {
    stdDevPct: Number(stdDevPct.toFixed(2)),
    movingAvg7d: Number(movingAvg7d.toFixed(2)),
    movingAvg30d: Number(movingAvg30d.toFixed(2)),
    deviationFromMa7d: Number(deviationFromMa7d.toFixed(2)),
    volatilityScore,
    alert,
    alertReason,
  };
}
