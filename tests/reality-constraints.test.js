import { describe, it, expect } from "vitest";
import {
  checkRealityConstraints,
  applyConstraintPenalties,
  penaltyForSeverity,
} from "@/lib/agents/valuation/reality-constraints";

describe("reality-constraints", () => {
  it("passes a clean, consistent sheet", () => {
    const { violations } = checkRealityConstraints({
      year: 2017,
      year_era: "H29",
      overall_grade: 4.5,
      interior_grade: "B",
      mileage_reading: 40000,
      make: "Ferrari",
      model: "488 GTB",
      accident_history: false,
      damage_codes: [],
      drive_side: "LHD",
    });
    expect(violations).toHaveLength(0);
  });

  it("catches Heisei/year mismatch (era math)", () => {
    const { violations } = checkRealityConstraints({
      year_era: "H29",   // → 2017
      year: 2019,        // contradiction
    });
    const v = violations.find((x) => x.rule === "era_math");
    expect(v).toBeDefined();
    expect(v.severity).toBe("HIGH");
  });

  it("catches implausible km/year", () => {
    const { violations } = checkRealityConstraints({
      year: 2022,
      mileage_reading: 400_000,
    });
    const v = violations.find((x) => x.rule === "mileage_per_year_high");
    expect(v).toBeDefined();
  });

  it("flags accident_history=false with MAJOR damage", () => {
    const { violations } = checkRealityConstraints({
      accident_history: false,
      damage_codes: [{ location: "front", code: "A", meaning: "major", severity: "MAJOR" }],
    });
    const v = violations.find((x) => x.rule === "accident_vs_damage_contradiction");
    expect(v).toBeDefined();
    expect(v.severity).toBe("HIGH");
  });

  it("flags grade-6 with accident history (contradiction)", () => {
    const { violations } = checkRealityConstraints({
      overall_grade: 6,
      accident_history: true,
    });
    const v = violations.find((x) => x.rule === "grade_vs_accident_contradiction");
    expect(v).toBeDefined();
  });

  it("flags an out-of-range overall grade", () => {
    const { violations } = checkRealityConstraints({ overall_grade: 7.5 });
    const v = violations.find((x) => x.rule === "grade_range");
    expect(v).toBeDefined();
  });

  it("accepts the special S grade (6.5)", () => {
    const { violations } = checkRealityConstraints({ overall_grade: 6.5 });
    expect(violations.find((x) => x.rule === "grade_range")).toBeUndefined();
  });

  it("catches cross-brand model leakage (make=Porsche, model=488)", () => {
    const { violations } = checkRealityConstraints({
      make: "Porsche",
      model: "488 GTB",
    });
    const v = violations.find((x) => x.rule === "make_model_family");
    expect(v).toBeDefined();
    expect(v.severity).toBe("HIGH");
  });

  it("flags displacement that's unit-confused", () => {
    const { violations } = checkRealityConstraints({ displacement_cc: 4 });
    const v = violations.find((x) => x.rule === "displacement_range");
    expect(v).toBeDefined();
  });

  it("byField index groups violations by affected field", () => {
    const { byField } = checkRealityConstraints({
      year_era: "H29",
      year: 2019,
    });
    expect(byField.year).toBeDefined();
    expect(byField.year.length).toBeGreaterThan(0);
  });
});

describe("applyConstraintPenalties", () => {
  it("penalises the worst violation per field", () => {
    const before = { year: 0.9, mileage_reading: 0.95 };
    const byField = {
      year: [
        { severity: "HIGH" },
        { severity: "LOW" },  // HIGH takes precedence
      ],
    };
    const after = applyConstraintPenalties(before, byField);
    expect(after.year).toBeCloseTo(0.5, 2);  // 0.9 - 0.4 HIGH penalty
    expect(after.mileage_reading).toBe(0.95); // untouched
  });

  it("clamps to [0, 1]", () => {
    const after = applyConstraintPenalties({ x: 0.1 }, { x: [{ severity: "HIGH" }] });
    expect(after.x).toBeGreaterThanOrEqual(0);
  });
});

describe("penaltyForSeverity", () => {
  it("HIGH > MEDIUM > LOW", () => {
    expect(penaltyForSeverity("HIGH")).toBeGreaterThan(penaltyForSeverity("MEDIUM"));
    expect(penaltyForSeverity("MEDIUM")).toBeGreaterThan(penaltyForSeverity("LOW"));
  });
});
