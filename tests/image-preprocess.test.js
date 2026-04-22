// Image preprocessing — deterministic tests that don't hit any network.
// sharp is a native dep, so these run purely in-process.

import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import {
  analyzeImage,
  preprocessForOCR,
  maybePreprocess,
  preprocessingEnabled,
} from "@/lib/agents/valuation/image-preprocess";

// Generate a deterministic synthetic "auction-sheet-ish" PNG buffer at a
// chosen width so we can assert preprocessing decisions without checking
// real sheet bytes in. Just a white canvas with a printed digit — enough
// for sharp to carry it through the pipeline.
async function makeSyntheticImage(width, height = null) {
  const h = height ?? Math.round(width * 0.9);
  const buf = await sharp({
    create: {
      width,
      height: h,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  }).png().toBuffer();
  return { data: buf.toString("base64"), mediaType: "image/png" };
}

let smallImage, midImage, bigImage;
beforeAll(async () => {
  smallImage = await makeSyntheticImage(400);   // below absolute min
  midImage = await makeSyntheticImage(1200);    // needs upscale
  bigImage = await makeSyntheticImage(2400);    // already-good
});

describe("analyzeImage", () => {
  it("returns dimensions and format", async () => {
    const m = await analyzeImage(midImage);
    expect(m.width).toBe(1200);
    expect(m.format).toBe("png");
    expect(m.needsUpscale).toBe(true);
    expect(m.tooSmall).toBe(false);
  });

  it("flags too-small images", async () => {
    const m = await analyzeImage(smallImage);
    expect(m.tooSmall).toBe(true);
  });

  it("passes already-large images without flagging upscale need", async () => {
    const m = await analyzeImage(bigImage);
    expect(m.needsUpscale).toBe(false);
    expect(m.tooSmall).toBe(false);
  });

  it("returns null on invalid input without throwing", async () => {
    const m = await analyzeImage({ data: "not-base64-at-all", mediaType: "image/png" });
    expect(m).toBeNull();
  });
});

describe("preprocessForOCR", () => {
  it("upscales 1200px input to ≥1800px", async () => {
    const r = await preprocessForOCR(midImage);
    expect(r.image.mediaType).toBe("image/png");
    expect(r.outMeta.width).toBeGreaterThanOrEqual(1800);
    expect(r.applied.some((s) => s.includes("upscale"))).toBe(true);
    expect(r.applied).toContain("normalize (adaptive contrast)");
    expect(r.applied).toContain("PNG output");
  });

  it("leaves 2400px input near its original size (no upscale)", async () => {
    const r = await preprocessForOCR(bigImage);
    expect(r.outMeta.width).toBe(2400);
    expect(r.applied.every((s) => !s.includes("upscale"))).toBe(true);
    // Normalize + sharpen + PNG still run.
    expect(r.applied).toContain("normalize (adaptive contrast)");
  });

  it("refuses to touch images below absolute minimum (400px)", async () => {
    const r = await preprocessForOCR(smallImage);
    expect(r.warning).toBe("IMAGE_TOO_SMALL");
    expect(r.applied).toEqual([]);
    // Returns the image unchanged.
    expect(r.image).toBe(smallImage);
  });

  it("forces preprocessing on a small image when force=true", async () => {
    const r = await preprocessForOCR(smallImage, { force: true });
    expect(r.warning).toBeUndefined();
    expect(r.applied.length).toBeGreaterThan(0);
  });

  it("always outputs PNG regardless of input format", async () => {
    // Convert mid image to JPEG, then run preprocess — output should be PNG.
    const jpegBuf = await sharp(Buffer.from(midImage.data, "base64")).jpeg({ quality: 85 }).toBuffer();
    const jpegImg = { data: jpegBuf.toString("base64"), mediaType: "image/jpeg" };
    const r = await preprocessForOCR(jpegImg);
    expect(r.image.mediaType).toBe("image/png");
  });
});

describe("maybePreprocess feature flag", () => {
  it("is off by default — returns image unchanged", async () => {
    const prev = process.env.SHEET_PREPROCESS;
    delete process.env.SHEET_PREPROCESS;
    delete process.env.VALUATION_SHEET_PREPROCESS;
    try {
      const r = await maybePreprocess(midImage);
      expect(r.preprocessed).toBe(false);
      expect(r.image).toBe(midImage);
    } finally {
      if (prev !== undefined) process.env.SHEET_PREPROCESS = prev;
    }
  });

  it("turns on with SHEET_PREPROCESS=1", async () => {
    const prev = process.env.SHEET_PREPROCESS;
    process.env.SHEET_PREPROCESS = "1";
    try {
      expect(preprocessingEnabled()).toBe(true);
      const r = await maybePreprocess(midImage);
      expect(r.preprocessed).toBe(true);
      expect(r.applied.some((s) => s.includes("upscale"))).toBe(true);
    } finally {
      if (prev !== undefined) process.env.SHEET_PREPROCESS = prev;
      else delete process.env.SHEET_PREPROCESS;
    }
  });

  it("honours force=true even without the flag", async () => {
    delete process.env.SHEET_PREPROCESS;
    const r = await maybePreprocess(midImage, { force: true });
    expect(r.preprocessed).toBe(true);
  });
});
