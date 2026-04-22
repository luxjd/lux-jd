// Spec §8.1 + §5.1: prompts must be loadable .txt files, not hardcoded.

import { describe, it, expect } from "vitest";
import { loadPrompt } from "@/lib/agents/valuation/prompts/loader";

describe("loadPrompt", () => {
  it("reads the enrichment prompt and substitutes variables", () => {
    const out = loadPrompt("enrichment", {
      make: "Ferrari",
      model: "488 GTB",
      year: 2017,
      transmission: "DCT",
      fuelType: "PETROL",
      specificationNotes: "carbon ceramics",
    });
    expect(out).toContain("Ferrari 488 GTB 2017");
    expect(out).toContain("Transmission provided: DCT");
    expect(out).toContain("carbon ceramics");
    // Must not leak unsubstituted placeholders.
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });

  it("returns the photo_analysis prompt with make/model/year filled", () => {
    const out = loadPrompt("photo_analysis", { make: "Porsche", model: "911 GT3", year: 2020 });
    expect(out).toContain("2020 Porsche 911 GT3");
    expect(out).toContain('"exterior_score"');
  });

  it("all 6 spec-mandated prompt files exist", () => {
    // Spec §5.1 lists 5 + we added additional_docs.
    for (const name of [
      "enrichment",
      "photo_analysis",
      "sheet_parsing",
      "price_analysis",
      "recommendation",
      "additional_docs",
    ]) {
      const content = loadPrompt(name, {});
      expect(content.length, `${name}.txt is empty or missing`).toBeGreaterThan(50);
    }
  });

  it("system prompts exist for prompts that need them", () => {
    for (const name of [
      "photo_analysis.system",
      "price_analysis.system",
      "recommendation.system",
      "sheet_parsing.system",
      "additional_docs.system",
    ]) {
      const content = loadPrompt(name, {});
      expect(content.length, `${name}.txt is empty or missing`).toBeGreaterThan(10);
    }
  });
});
