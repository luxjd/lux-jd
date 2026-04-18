// Locale-locked number formatters. Never use bare toLocaleString() — it picks up
// the host locale (en-IN on this dev box → "1,64,509" lakh grouping).

const EUR_GROUPING = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const EUR_DECIMAL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function toFiniteNumber(value) {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatEur(value, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  const sign = n < 0 ? "-" : "";
  return `${sign}€${EUR_GROUPING.format(Math.round(Math.abs(n)))}`;
}

export function formatEur2(value, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  const sign = n < 0 ? "-" : "";
  return `${sign}€${EUR_DECIMAL.format(Math.abs(n))}`;
}

export function formatEurCompact(value, { dash = "€—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`;
  return `${sign}€${EUR_GROUPING.format(Math.round(abs))}`;
}

export function formatJpy(value, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  const sign = n < 0 ? "-" : "";
  return `${sign}¥${PLAIN.format(Math.round(Math.abs(n)))}`;
}

export function formatKm(value, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  return EUR_GROUPING.format(Math.round(n));
}

// Stable plain-number formatting (en-US grouping). Use inside LLM prompts so
// Claude always sees "164,509" regardless of host locale.
export function formatNumber(value, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  return PLAIN.format(Math.round(n));
}

export function formatPct(value, digits = 1, { dash = "—" } = {}) {
  const n = toFiniteNumber(value);
  if (n == null) return dash;
  return `${n.toFixed(digits)}%`;
}
