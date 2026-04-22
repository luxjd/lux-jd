// Spec §2.1 input validation — range + enum checks.

import { describe, it, expect } from "vitest";
import { validateInput } from "@/lib/agents/valuation/validation";

const base = {
  make: "Ferrari",
  model: "488 GTB",
  year: 2017,
  mileageKm: 18000,
  driveSide: "LHD",
  askingPriceJpy: 16500000,
  exteriorColor: "Rosso Corsa",
};

describe("validateInput — spec §2.1", () => {
  it("accepts a full valid input", () => {
    expect(() => validateInput({ ...base })).not.toThrow();
  });

  it("rejects missing askingPriceJpy unless guidanceMode:true", () => {
    expect(() => validateInput({ ...base, askingPriceJpy: null })).toThrow(/askingPriceJpy is required/);
    expect(() => validateInput({ ...base, askingPriceJpy: null, guidanceMode: true })).not.toThrow();
  });

  it("auctionGrade accepts 1.0-6.0 continuous and 6.5 S grade", () => {
    expect(() => validateInput({ ...base, auctionGrade: 4.5 })).not.toThrow();
    expect(() => validateInput({ ...base, auctionGrade: 6.0 })).not.toThrow();
    expect(() => validateInput({ ...base, auctionGrade: 6.5 })).not.toThrow();
    expect(() => validateInput({ ...base, auctionGrade: 1.0 })).not.toThrow();
    expect(() => validateInput({ ...base, auctionGrade: 6.2 })).toThrow(/auctionGrade/);
    expect(() => validateInput({ ...base, auctionGrade: 0.5 })).toThrow(/auctionGrade/);
    expect(() => validateInput({ ...base, auctionGrade: 7 })).toThrow(/auctionGrade/);
  });

  it("year must be 1990 through next year", () => {
    expect(() => validateInput({ ...base, year: 1989 })).toThrow(/year/);
    expect(() => validateInput({ ...base, year: 1990 })).not.toThrow();
  });

  it("driveSide is LHD or RHD only", () => {
    expect(() => validateInput({ ...base, driveSide: "LEFT" })).toThrow(/driveSide/);
    expect(() => validateInput({ ...base, driveSide: "RHD" })).not.toThrow();
  });

  it("mileageKm must be 0-999999", () => {
    expect(() => validateInput({ ...base, mileageKm: -1 })).toThrow(/mileageKm/);
    expect(() => validateInput({ ...base, mileageKm: 1_000_000 })).toThrow(/mileageKm/);
    expect(() => validateInput({ ...base, mileageKm: 500_000 })).not.toThrow();
  });
});
