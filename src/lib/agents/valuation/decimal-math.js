// Spec §6.4 + §8.1: "All financial calculations use decimal.Decimal, NEVER float."
// decimal.js is the JS-native equivalent — arbitrary-precision, no base-2 rounding.
// Every JPY→EUR conversion, percentage, and aggregate in the landed-cost pipeline
// goes through here so numbers in the final report are reproducible.

import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export const D = (v) => new Decimal(v ?? 0);

export function toInt(d) {
  return D(d).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

export function toNum(d, places = 2) {
  return D(d).toDecimalPlaces(places, Decimal.ROUND_HALF_EVEN).toNumber();
}

export function pct(value, total) {
  const t = D(total);
  if (t.isZero()) return 0;
  return toNum(D(value).div(t).mul(100), 1);
}

export { Decimal };
