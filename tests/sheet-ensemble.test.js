import { describe, it, expect } from "vitest";
import { ensembleEnabled } from "@/lib/agents/valuation/sheet-ensemble";

// The ensemble calls three external vision models over the network, so
// full-pipeline tests are too heavy for unit tests. Here we verify the
// feature flag default and the module's surface area. The actual consensus
// merging is exercised by the post-validation tests that simulate mixed
// confidence inputs.

describe("sheet-ensemble feature flag", () => {
  it("is OFF by default (no SHEET_ENSEMBLE env var)", () => {
    const prev = process.env.SHEET_ENSEMBLE;
    delete process.env.SHEET_ENSEMBLE;
    delete process.env.VALUATION_SHEET_ENSEMBLE;
    try {
      expect(ensembleEnabled()).toBe(false);
    } finally {
      if (prev !== undefined) process.env.SHEET_ENSEMBLE = prev;
    }
  });

  it("turns ON when SHEET_ENSEMBLE=1", () => {
    const prev = process.env.SHEET_ENSEMBLE;
    process.env.SHEET_ENSEMBLE = "1";
    try {
      expect(ensembleEnabled()).toBe(true);
    } finally {
      if (prev !== undefined) process.env.SHEET_ENSEMBLE = prev;
      else delete process.env.SHEET_ENSEMBLE;
    }
  });
});
