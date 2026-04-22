// Spec §7.1 #7: "Risk assessment produces scores for all 6 dimensions + overall"
// §3.7 weights: condition 25%, market 25%, currency 20%, provenance 15%, tuv 10%, capital 5%

import { describe, it, expect } from "vitest";
import { scoreRisksDeterministic, RISK_WEIGHTS } from "@/lib/agents/valuation/risk-scorer";

describe("risk scorer — spec §3.7", () => {
  it("weights are exactly condition 25, market 25, currency 20, provenance 15, tuv 10, capital 5", () => {
    expect(RISK_WEIGHTS.condition).toBe(0.25);
    expect(RISK_WEIGHTS.market).toBe(0.25);
    expect(RISK_WEIGHTS.currency).toBe(0.20);
    expect(RISK_WEIGHTS.provenance).toBe(0.15);
    expect(RISK_WEIGHTS.tuv).toBe(0.10);
    expect(RISK_WEIGHTS.capital).toBe(0.05);
    // Sum = 1.00 exactly (spec invariant).
    const sum = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("produces all 6 dimensions + overall, each 1-5 with a level", () => {
    const out = scoreRisksDeterministic({
      conditionExterior: 8, conditionInterior: 8,
      auctionGrade: 4.5, make: "Ferrari", driveSide: "LHD",
      serviceHistory: "FULL_DEALER", accidentHistory: false,
      comparableCount: 20, marketLiquidity: "HIGH",
      fxRate: 167, fxBufferPct: 3,
      cashOutlay: 150000, grossMargin: 40000, holdDays: 60,
    });
    for (const k of ["condition", "provenance", "tuv", "market", "currency", "capital"]) {
      expect(out.risk_scores[k].score).toBeGreaterThanOrEqual(1);
      expect(out.risk_scores[k].score).toBeLessThanOrEqual(5);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(out.risk_scores[k].level);
    }
    expect(out.overall_risk_score).toBeGreaterThan(0);
    expect(out.overall_risk_score).toBeLessThanOrEqual(5);
  });

  it("overall_risk_score matches the weighted sum of the 6 dimensions", () => {
    const out = scoreRisksDeterministic({
      conditionExterior: 9, conditionInterior: 9,
      auctionGrade: 5, make: "Porsche", driveSide: "LHD",
      serviceHistory: "FULL_DEALER",
      comparableCount: 30, marketLiquidity: "HIGH",
      fxRate: 167, fxBufferPct: 3,
      cashOutlay: 100000, grossMargin: 30000, holdDays: 45,
    });
    const r = out.risk_scores;
    const expected =
      r.condition.score * 0.25 +
      r.market.score * 0.25 +
      r.currency.score * 0.20 +
      r.provenance.score * 0.15 +
      r.tuv.score * 0.10 +
      r.capital.score * 0.05;
    expect(out.overall_risk_score).toBeCloseTo(Number(expected.toFixed(2)), 2);
  });

  it("high accident + poor condition pushes condition risk toward 4-5", () => {
    const out = scoreRisksDeterministic({
      conditionExterior: 3, conditionInterior: 3,
      auctionGrade: 2, accidentHistory: true, structuralConcern: true,
      make: "Porsche", driveSide: "LHD",
    });
    expect(out.risk_scores.condition.score).toBeGreaterThanOrEqual(4);
  });
});
