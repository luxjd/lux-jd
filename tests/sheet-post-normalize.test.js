// Rules distilled from a real calibration set — these tests lock them in.

import { describe, it, expect } from "vitest";
import {
  normaliseAuctionHouse,
  upgradeToAMGIfApplicable,
  normaliseImportType,
  sanityCheckRecyclingDeposit,
  postNormaliseExtraction,
} from "@/lib/agents/valuation/sheet-post-normalize";

describe("normaliseAuctionHouse — strip location suffix", () => {
  it.each([
    ["USS Tokyo", "USS", "Tokyo"],
    ["USS Yokohama", "USS", "Yokohama"],
    ["USS Shinagawa", "USS", "Shinagawa"],
    ["TAA Tokyo", "TAA", "Tokyo"],
    ["USS", "USS", null],
    ["HAA Kobe", "HAA", "Kobe"],
  ])("\"%s\" → \"%s\" (location=%s)", (input, expectedCode, expectedLoc) => {
    const r = normaliseAuctionHouse(input);
    expect(r.normalised).toBe(expectedCode);
    expect(r.location).toBe(expectedLoc);
  });

  it("passes through unknown codes unchanged", () => {
    const r = normaliseAuctionHouse("UnknownAuctionHouse X");
    expect(r.normalised).toBe("UnknownAuctionHouse X");
  });

  it.each([
    ["Import Prime Corner", "USS"],
    ["輸入車プライムコーナー", "USS"],
    ["輸入車コーナー", "USS"],
    ["プライムコーナー", "USS"],
    ["One More 輸入車 Prime", "USS"],
  ])("maps USS subtitle \"%s\" → USS", (input, expected) => {
    const r = normaliseAuctionHouse(input);
    expect(r.normalised).toBe(expected);
  });
});

describe("upgradeToAMGIfApplicable", () => {
  it("upgrades Mercedes-Benz to Mercedes-AMG when grade contains C63", () => {
    const extracted = { make: "Mercedes-Benz", model: "C-Class", grade: "C63 S Cabriolet" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("Mercedes-AMG");
    expect(extracted._makeUpgraded).toBeDefined();
  });

  it("upgrades when grade contains CLS63", () => {
    const extracted = { make: "Mercedes-Benz", model: "CLS", grade: "CLS63 S 4Matic" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("Mercedes-AMG");
  });

  it("upgrades when grade contains the word AMG", () => {
    const extracted = { make: "Mercedes-Benz", grade: "AMG Line" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("Mercedes-AMG");
  });

  it("upgrades GT R / GT S", () => {
    const extracted = { make: "Mercedes-Benz", model: "GT", grade: "GT R" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("Mercedes-AMG");
  });

  it("leaves non-Mercedes makes alone", () => {
    const extracted = { make: "BMW", model: "M3", grade: "M3 Competition" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("BMW");
  });

  it("leaves Mercedes-Benz alone when model is not AMG", () => {
    const extracted = { make: "Mercedes-Benz", model: "SL", grade: "SL500" };
    upgradeToAMGIfApplicable(extracted);
    expect(extracted.make).toBe("Mercedes-Benz");
  });
});

describe("normaliseImportType", () => {
  it("maps ディーラー並行 → Dealer", () => {
    expect(normaliseImportType("ディーラー並行")).toBe("Dealer");
  });

  it("maps Dealer Parallel → Dealer", () => {
    expect(normaliseImportType("Dealer Parallel")).toBe("Dealer");
  });

  it("preserves Parallel when it's Individual Parallel (個人並行)", () => {
    expect(normaliseImportType("個人並行")).toBe("Parallel");
  });

  it("maps Dealer (ディーラー) → Dealer", () => {
    expect(normaliseImportType("Dealer (ディーラー)")).toBe("Dealer");
  });

  it("returns null for empty input", () => {
    expect(normaliseImportType(null)).toBeNull();
    expect(normaliseImportType("")).toBeNull();
  });
});

describe("sanityCheckRecyclingDeposit", () => {
  it("accepts typical values (10-30k JPY)", () => {
    expect(sanityCheckRecyclingDeposit(18030).value).toBe(18030);
    expect(sanityCheckRecyclingDeposit(14550).value).toBe(14550);
    expect(sanityCheckRecyclingDeposit(23190).value).toBe(23190);
  });

  it("rejects implausibly low values", () => {
    const r = sanityCheckRecyclingDeposit(1690);
    expect(r.value).toBeNull();
    expect(r.warning).toContain("low");
  });

  it("rejects implausibly high values", () => {
    const r = sanityCheckRecyclingDeposit(100000);
    expect(r.value).toBeNull();
    expect(r.warning).toContain("high");
  });
});

describe("postNormaliseExtraction integration", () => {
  it("fixes the three systematic issues found in calibration", () => {
    const extracted = {
      auctionHouse: "USS Yokohama",
      make: "Mercedes-Benz",
      model: "CLS",
      grade: "CLS63 S 4Matic",
      importType: "ディーラー並行",
      recyclingDepositJpy: 21340,
    };
    const { notes } = postNormaliseExtraction(extracted);
    expect(extracted.auctionHouse).toBe("USS");
    expect(extracted.auctionHouseLocation).toBe("Yokohama");
    expect(extracted.make).toBe("Mercedes-AMG");
    expect(extracted.importType).toBe("Dealer");
    expect(extracted.recyclingDepositJpy).toBe(21340);
    expect(notes.length).toBe(3);
  });
});
