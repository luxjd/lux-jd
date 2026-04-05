// Generate 90 days of price history from a base price with realistic fluctuation
export function generatePriceHistory(basePrice, volatilityPct = 3, days = 90) {
  const history = [];
  let price = basePrice * (1 - volatilityPct / 100);
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Random walk with slight upward bias
    const change = (Math.random() - 0.48) * basePrice * (volatilityPct / 100) * 0.1;
    price = Math.max(basePrice * 0.85, Math.min(basePrice * 1.15, price + change));

    history.push({
      date: date.toISOString().split("T")[0],
      median: Math.round(price),
      p25: Math.round(price * 0.92),
      p75: Math.round(price * 1.10),
      sampleSize: Math.floor(Math.random() * 15) + 30,
    });
  }
  return history;
}

// Calculate hours since a timestamp
export function hoursSince(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60);
}

// Format EUR currency
export function formatEur(amount) {
  if (amount >= 1000000) return `€${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `€${(amount / 1000).toFixed(0)}K`;
  return `€${amount.toLocaleString()}`;
}
