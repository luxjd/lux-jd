/**
 * Fetch live JPY/EUR exchange rate from frankfurter.app (free, no API key).
 * Falls back to hardcoded rate if API is unreachable.
 */
const FALLBACK_RATE = 166.80;

export async function fetchFxRate() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=JPY", {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!res.ok) throw new Error(`FX API returned ${res.status}`);

    const data = await res.json();
    const rate = data.rates?.JPY;

    if (!rate || rate < 100 || rate > 300) throw new Error("Invalid rate");

    return { rate, source: "frankfurter.app", live: true, timestamp: data.date };
  } catch {
    return { rate: FALLBACK_RATE, source: "fallback", live: false, timestamp: new Date().toISOString().split("T")[0] };
  }
}
