// Image preprocessing for auction-sheet OCR.
//
// The live test showed the parser's hard ceiling is the odometer digit
// boxes — at 1179×1107 each digit is ~20 px tall, which is below the
// sweet spot for vision-model OCR. Preprocessing won't replace a
// specialized digit CNN but it moves the whole pipeline closer to "read
// without mistakes" by giving every vision call a larger, higher-contrast,
// properly-oriented image.
//
// Pipeline (in order):
//   1. EXIF auto-rotate      — phone photos often come rotated
//   2. Upscale to ≥1800 px wide — digit boxes at ≥30 px tall
//   3. normalize()           — adaptive contrast (stretches dynamic range)
//   4. sharpen() (light)     — recovers edge sharpness lost in upscaling
//   5. PNG output            — lossless, no JPEG artefacts around digits
//
// Conservative on already-good images: the upscale + normalize steps only
// fire when needed. A high-res, high-contrast photo passes through with
// only the format change (PNG).

import sharp from "sharp";

// Digit boxes on Japanese auction sheets are ~1.5% of sheet width; at 1800
// px wide each digit has ~27 px which is comfortably inside modern
// vision-model OCR range. Going higher than 2400 doesn't buy more accuracy
// and costs Vision API time (bigger base64 payload).
const TARGET_MIN_WIDTH = 1800;
const TARGET_MAX_WIDTH = 2400;

// Minimum size below which preprocessing probably can't save the image —
// < 600 px wide = ~10 px per digit which is OCR-hostile regardless.
const ABSOLUTE_MIN_WIDTH = 600;

export function preprocessingEnabled() {
  return process.env.SHEET_PREPROCESS === "1" || process.env.VALUATION_SHEET_PREPROCESS === "1";
}

/**
 * Decode a {data: base64, mediaType} image object back into a Buffer.
 */
function toBuffer(image) {
  if (!image || typeof image.data !== "string") throw new Error("invalid image object");
  return Buffer.from(image.data, "base64");
}

/**
 * Encode a Buffer back into the {data, mediaType} shape sheet-parser
 * expects. Output is always PNG — lossless and smaller than JPEG at the
 * sharpening quality settings we use.
 */
function fromBuffer(buffer, mediaType = "image/png") {
  return { data: buffer.toString("base64"), mediaType };
}

/**
 * Cheap metadata probe — returns dimensions, orientation, inferred
 * quality hints. Never throws; returns null on decode failure.
 */
export async function analyzeImage(image) {
  try {
    const buf = toBuffer(image);
    const meta = await sharp(buf).metadata();
    const { width, height, format, orientation, hasAlpha, density } = meta;
    return {
      width: width || 0,
      height: height || 0,
      format: format || null,
      orientation: orientation || 1,
      hasAlpha: !!hasAlpha,
      density: density || null,
      bytes: buf.length,
      needsUpscale: (width || 0) < TARGET_MIN_WIDTH && (width || 0) >= ABSOLUTE_MIN_WIDTH,
      tooSmall: (width || 0) < ABSOLUTE_MIN_WIDTH,
    };
  } catch {
    return null;
  }
}

/**
 * Run the preprocessing pipeline on an auction-sheet image.
 *
 * @param {{data: string, mediaType: string}} image
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] — run even if the image looks OK.
 *                                       Normally we skip upscale/contrast
 *                                       on already-large, already-crisp
 *                                       images to save time + API bytes.
 * @returns {{image: {data,mediaType}, meta: object}}
 */
export async function preprocessForOCR(image, opts = {}) {
  const meta = await analyzeImage(image);
  if (!meta) {
    return { image, meta: null, applied: [], reason: "could not decode image — returning unchanged" };
  }
  if (meta.tooSmall && !opts.force) {
    return {
      image,
      meta,
      applied: [],
      reason: `image is ${meta.width}px wide — below ${ABSOLUTE_MIN_WIDTH}px minimum; preprocessing can't recover this`,
      warning: "IMAGE_TOO_SMALL",
    };
  }

  const buf = toBuffer(image);
  let pipeline = sharp(buf);
  const applied = [];

  // Step 1 — EXIF auto-rotate. No-op when orientation=1 or absent.
  if ((meta.orientation && meta.orientation !== 1) || opts.force) {
    pipeline = pipeline.rotate();
    applied.push(`auto-rotate (EXIF=${meta.orientation})`);
  } else {
    pipeline = pipeline.rotate();  // still safe to call; strips EXIF
  }

  // Step 2 — upscale to TARGET_MIN_WIDTH if small. Lanczos3 kernel is the
  // best-quality option sharp offers for digit-preserving upscales.
  if (meta.needsUpscale || opts.force) {
    const targetWidth = Math.min(TARGET_MAX_WIDTH, Math.max(TARGET_MIN_WIDTH, meta.width * 2));
    pipeline = pipeline.resize({
      width: Math.round(targetWidth),
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    });
    applied.push(`upscale ${meta.width}→${Math.round(targetWidth)}px (lanczos3)`);
  }

  // Step 3 — adaptive contrast normalize. Stretches dynamic range — a
  // faded sheet scanned at low quality gets its contrast rebuilt. For
  // already-high-contrast images this is a near no-op.
  // normalize() defaults are conservative (1st/99th percentile clipping).
  pipeline = pipeline.normalize();
  applied.push("normalize (adaptive contrast)");

  // Step 4 — light sharpen. Gains back edge definition lost to upscaling.
  // Aggressive sharpen introduces artefacts that look like digit "8" from
  // "3", so we tune conservatively: sigma=0.7, m1=1.0, m2=2.0.
  pipeline = pipeline.sharpen({ sigma: 0.7, m1: 1.0, m2: 2.0 });
  applied.push("sharpen (sigma=0.7)");

  // Step 5 — PNG output. JPEG lossy compression at ~90% quality puts ring
  // artefacts around small numeric characters that vision models
  // consistently misread. PNG is larger in bytes but the accuracy delta
  // is worth it for OCR tasks.
  pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  applied.push("PNG output");

  const outBuf = await pipeline.toBuffer();
  const outMeta = await sharp(outBuf).metadata();

  return {
    image: fromBuffer(outBuf, "image/png"),
    meta,
    outMeta: {
      width: outMeta.width,
      height: outMeta.height,
      bytes: outBuf.length,
    },
    applied,
  };
}

/**
 * Convenience: preprocess only if the feature flag is on AND the image
 * looks like it'll benefit. Returns either the preprocessed image or the
 * original — callers don't need to branch on the flag themselves.
 */
export async function maybePreprocess(image, opts = {}) {
  if (!preprocessingEnabled() && !opts.force) return { image, preprocessed: false };
  const result = await preprocessForOCR(image, opts);
  return {
    image: result.image,
    preprocessed: result.applied.length > 0,
    applied: result.applied,
    meta: result.meta,
    outMeta: result.outMeta,
    warning: result.warning,
  };
}
