import { describe, it, expect } from "vitest";
import { validateVin, makeFromWmi, yearFromVin } from "@/lib/agents/valuation/vin-validator";

describe("validateVin (ISO 3779 check digit)", () => {
  // Hand-verified against the ISO 3779 algorithm. If one of these starts
  // failing, the validator itself has regressed.
  it.each([
    ["1HGCM82633A004352", "Honda Accord 2003 (VIN decoder canonical example)"],
    ["1M8GDM9AXKP042788", "NHTSA test VIN (check digit = X, remainder 10)"],
  ])("accepts known-good VIN %s (%s)", (vin) => {
    const r = validateVin(vin);
    expect(r.valid, `VIN ${vin} should validate but failed: ${r.reason}`).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(validateVin("1HGCM82633A00435").valid).toBe(false);
    expect(validateVin("1HGCM82633A0043522").valid).toBe(false);
  });

  it("rejects I, O, Q characters (ambiguous with 1, 0, 0)", () => {
    expect(validateVin("1HGCM82633A00I352").valid).toBe(false);
    expect(validateVin("1HGCM82633A00O352").valid).toBe(false);
    expect(validateVin("1HGCM82633A00Q352").valid).toBe(false);
  });

  it("rejects a deliberately corrupted check digit", () => {
    // Flip the check digit of a valid VIN.
    const valid = "1HGCM82633A004352";
    const corrupted = valid.slice(0, 8) + "4" + valid.slice(9);
    const r = validateVin(corrupted);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/check digit/i);
  });

  it("rejects empty / non-string input", () => {
    expect(validateVin(null).valid).toBe(false);
    expect(validateVin("").valid).toBe(false);
    expect(validateVin(12345).valid).toBe(false);
  });
});

describe("makeFromWmi", () => {
  it.each([
    ["WP0AB2A99JS123456", "Porsche"],
    ["WDDCG9EB0DA123456", "Mercedes-Benz"],
    ["ZFFAB12345S123456", "Ferrari"],
    ["WBSBL93405PN12345", "BMW M"],
  ])("%s → %s", (vin, expected) => {
    expect(makeFromWmi(vin)).toBe(expected);
  });

  it("returns null for unknown WMIs (not an error, just not in our table)", () => {
    expect(makeFromWmi("XYZAB12345678A123")).toBeNull();
  });
});

describe("yearFromVin", () => {
  // Position 10 (index 9) is the model-year code. "H" at that position
  // encodes 1987 OR 2017 (the alphabet repeats every 30 years).
  // Constructed by hand so index 9 is exactly 'H':
  //   0=1, 1=H, 2=G, 3=C, 4=M, 5=8, 6=2, 7=6, 8=3, 9=H  ← year code
  //   10=A, 11=0, 12=0, 13=4, 14=3, 15=5, 16=2
  const VIN_H_AT_10 = "1HGCM8263HA004352";

  it("(sanity) index 9 is H", () => {
    expect(VIN_H_AT_10).toHaveLength(17);
    expect(VIN_H_AT_10[9]).toBe("H");
  });

  it("returns two candidates without a hint", () => {
    const candidates = yearFromVin(VIN_H_AT_10);
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates).toEqual([1987, 2017]);
  });

  it("picks the closer candidate with a hint year", () => {
    expect(yearFromVin(VIN_H_AT_10, 2017)).toBe(2017);
    expect(yearFromVin(VIN_H_AT_10, 1990)).toBe(1987);
  });
});
