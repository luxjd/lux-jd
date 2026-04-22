// Spec §6.4 + §8.1: financial math must use decimal.js (no float artefacts).

import { describe, it, expect } from "vitest";
import { D, toInt, toNum, pct } from "@/lib/agents/valuation/decimal-math";

describe("decimal-math helpers", () => {
  it("D(0.1) + D(0.2) is exactly 0.3 (classic float trap)", () => {
    const res = D("0.1").plus("0.2").toNumber();
    expect(res).toBe(0.3);
  });

  it("toInt rounds half-even", () => {
    expect(toInt(D("2.5"))).toBe(2); // banker's rounding → nearest even
    expect(toInt(D("3.5"))).toBe(4);
    expect(toInt(D("2.6"))).toBe(3);
  });

  it("pct returns one-decimal percentages", () => {
    expect(pct(25_000, 160_000)).toBe(15.6);
    expect(pct(0, 100_000)).toBe(0);
  });

  it("pct handles divide-by-zero gracefully", () => {
    expect(pct(1_000, 0)).toBe(0);
  });

  it("toNum respects the requested precision", () => {
    expect(toNum(D("3.14159"), 2)).toBe(3.14);
    expect(toNum(D("3.14159"), 4)).toBe(3.1416);
  });
});
