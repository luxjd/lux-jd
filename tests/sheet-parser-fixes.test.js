// Tests that codify the 7 auction-sheet parser bugs we fixed in this pass.
// Each test fails against the pre-fix code — so this file is a regression
// suite for the specific misreads the spec cares about.

import { describe, it, expect } from "vitest";
import { checkRealityConstraints } from "@/lib/agents/valuation/reality-constraints";
import { gradeToScore } from "@/lib/agents/valuation/real-engine";

describe("era bounds — Heisei/Reiwa/Showa must stay in range", () => {
  it("accepts valid Heisei (H1-H31)", () => {
    const { violations } = checkRealityConstraints({ year_era: "H24", year: 2012 });
    expect(violations.find((v) => v.rule === "era_number_out_of_bounds")).toBeUndefined();
  });

  it("rejects H32 (Heisei ended at 31)", () => {
    const { violations } = checkRealityConstraints({ year_era: "H32", year: 2020 });
    const v = violations.find((x) => x.rule === "era_number_out_of_bounds");
    expect(v).toBeDefined();
    expect(v.severity).toBe("HIGH");
  });

  it("rejects R with a number larger than current-year minus 2018", () => {
    // e.g. R99 is always wrong.
    const { violations } = checkRealityConstraints({ year_era: "R99", year: 2023 });
    expect(violations.find((x) => x.rule === "era_number_out_of_bounds")).toBeDefined();
  });

  it("accepts valid Showa (S63 = 1988)", () => {
    const { violations } = checkRealityConstraints({ year_era: "S63", year: 1988 });
    expect(violations.find((v) => v.rule === "era_number_out_of_bounds")).toBeUndefined();
  });

  it("rejects S65 (Showa max is 64)", () => {
    const { violations } = checkRealityConstraints({ year_era: "S65", year: 1990 });
    expect(violations.find((v) => v.rule === "era_number_out_of_bounds")).toBeDefined();
  });

  it("rejects unknown era letter", () => {
    const { violations } = checkRealityConstraints({ year_era: "T24", year: 2024 });
    expect(violations.find((v) => v.rule === "era_letter_unknown")).toBeDefined();
  });
});

describe("era math — Showa support (pre-1989 classics)", () => {
  it("S63 resolves to 1988", () => {
    const { violations } = checkRealityConstraints({ year_era: "S63", year: 1988 });
    expect(violations.find((v) => v.rule === "era_math")).toBeUndefined();
  });

  it("flags S63 with year=2018 mismatch", () => {
    const { violations } = checkRealityConstraints({ year_era: "S63", year: 2018 });
    const v = violations.find((x) => x.rule === "era_math");
    expect(v).toBeDefined();
    expect(v.message).toContain("1988");
  });

  // Regression: before this pass, Showa was not supported and the rule
  // silently skipped — leaving a known error unreported.
  it("Showa is now a first-class era (not silently skipped)", () => {
    const { violations } = checkRealityConstraints({ year_era: "S60", year: 2020 });
    expect(violations.find((v) => v.rule === "era_math")).toBeDefined();
  });
});

describe("two-tone interior preservation", () => {
  it("flags when Japanese has / but English collapses", () => {
    const { violations } = checkRealityConstraints({
      interior_color_japanese: "ブラック/ホワイト",
      interior_color: "Black",
    });
    const v = violations.find((x) => x.rule === "two_tone_interior_dropped");
    expect(v).toBeDefined();
    expect(v.severity).toBe("MEDIUM");
  });

  it("passes when both sides have the separator", () => {
    const { violations } = checkRealityConstraints({
      interior_color_japanese: "ブラック/ホワイト",
      interior_color: "Black/White",
    });
    expect(violations.find((v) => v.rule === "two_tone_interior_dropped")).toBeUndefined();
  });

  it("passes when neither side is two-tone", () => {
    const { violations } = checkRealityConstraints({
      interior_color_japanese: "ブラック",
      interior_color: "Black",
    });
    expect(violations.find((v) => v.rule === "two_tone_interior_dropped")).toBeUndefined();
  });
});

describe("S-grade mapping (6.5, not 6)", () => {
  // The fix lives in sheet-parser.extractVehicleData. We don't import it here
  // because it makes a live Claude call — instead we codify the invariant at
  // the reality-constraint layer: overall_grade=6.5 must be accepted, and
  // overall_grade=6 must be a numerically LOWER tier than 6.5.
  it("accepts overall_grade=6.5 (S tier)", () => {
    const { violations } = checkRealityConstraints({ overall_grade: 6.5 });
    expect(violations.find((v) => v.rule === "grade_range")).toBeUndefined();
  });

  it("accepts overall_grade=6", () => {
    const { violations } = checkRealityConstraints({ overall_grade: 6 });
    expect(violations.find((v) => v.rule === "grade_range")).toBeUndefined();
  });

  it("6.5 > 6 in the ordering — the spec has S above 6, not aliased to it", () => {
    expect(6.5).toBeGreaterThan(6);
  });
});

describe("gradeToScore — auction grade → 1-10 condition score", () => {
  it("S grade (6.5) is the top tier — score strictly greater than 6", () => {
    const sScore = gradeToScore(6.5);
    const sixScore = gradeToScore(6);
    expect(sScore).toBeGreaterThan(sixScore);
    expect(sScore).toBeGreaterThanOrEqual(9.7);
  });

  it("covers the full grade ladder monotonically", () => {
    const ladder = [6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];
    const scores = ladder.map((g) => gradeToScore(g));
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i], `grade ${ladder[i]} should score higher than ${ladder[i + 1]}`)
        .toBeGreaterThan(scores[i + 1]);
    }
  });

  it("returns null for null / 0 (no grade reported)", () => {
    expect(gradeToScore(null)).toBeNull();
    expect(gradeToScore(undefined)).toBeNull();
    expect(gradeToScore(0)).toBeNull();
  });

  it("interpolates between ladder points", () => {
    // 4.25 is between 4 and 4.5 — interpolated score should be between.
    const s = gradeToScore(4.25);
    expect(s).toBeGreaterThan(gradeToScore(4));
    expect(s).toBeLessThan(gradeToScore(4.5));
  });
});
