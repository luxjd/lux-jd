// Spec §3 uses snake_case throughout. The /api/v1 boundary converts
// camelCase internals to snake_case output.

import { describe, it, expect } from "vitest";
import { deepSnakeCase } from "@/lib/agents/valuation/snake-case";

describe("deepSnakeCase", () => {
  it("renames top-level camelCase keys", () => {
    expect(deepSnakeCase({ grossMarginEur: 25000, valuationId: "abc" })).toEqual({
      gross_margin_eur: 25000,
      valuation_id: "abc",
    });
  });

  it("recurses into nested objects and arrays", () => {
    const result = deepSnakeCase({
      marketAnalysis: {
        priceStatistics: { median: 100, p25: 80 },
        comparableListings: [{ daysOnMarket: 42 }],
      },
    });
    expect(result).toEqual({
      market_analysis: {
        price_statistics: { median: 100, p25: 80 },
        comparable_listings: [{ days_on_market: 42 }],
      },
    });
  });

  it("preserves underscore-prefixed keys (estimation labels)", () => {
    const out = deepSnakeCase({ _estimationLabels: { grossMargin: "Estimated" } });
    expect(out).toHaveProperty("_estimationLabels");
    expect(out._estimationLabels).toHaveProperty("gross_margin", "Estimated");
  });
});
