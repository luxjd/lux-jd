// Zone-cropped VIN extractor.
//
// Same approach as sheet-mileage-extractor.js: locate the 車台No. region,
// crop it, upscale to ~2000px wide, then read with 3 models and arbitrate
// by consensus + WMI validation.
//
// VIN accuracy on whole-sheet reads is ~54% (7/13 in baseline) because
// each character in a 17-char string is only ~12px wide at typical sheet
// resolution. Cropping + upscaling brings each character to ~100px —
// well inside reliable OCR range.

import sharp from "sharp";
import { callClaudeVision } from "@/lib/claude";

const VIN_MODELS = [
  { id: "anthropic/claude-opus-4-7", name: "opus" },
  { id: "anthropic/claude-sonnet-4", name: "sonnet" },
  { id: "anthropic/claude-haiku-4.5", name: "haiku" },
];

const UPSCALE_WIDTH = 2000;

export function vinExtractorEnabled() {
  // Disabled by default — the zone locator frequently crops the wrong
  // region (型式 row instead of 車台No. row), causing worse VIN accuracy.
  // Enable with SHEET_VIN_ZONE=1 only after calibrating the locator.
  return process.env.SHEET_VIN_ZONE === "1";
}

// WMI prefixes for validation
const WMI_PATTERNS = {
  "Mercedes": /^WD[BCDF]/,
  "Porsche": /^WP[01]/,
  "Ferrari": /^ZFF/,
  "Lamborghini": /^ZHW/,
  "Bentley": /^SCB/,
  "Aston Martin": /^SCF/,
  "Rolls-Royce": /^SCA/,
  "McLaren": /^SBM/,
  "Maserati": /^ZAM/,
  "Jaguar": /^SAJ/,
  "Range Rover": /^SAL/,
  "Land Rover": /^SAL/,
  "BMW": /^WB[ASY4]/,
  "Audi": /^W[AU][UA0Z]/,
  "Lotus": /^SCC/,
};

const VIN_CHARSET = /^[A-HJ-NPR-Z0-9]{17}$/;

// ── Step 1: Locate the VIN region ──

const LOCATE_PROMPT = `Locate the chassis number / VIN field (車台No.) on this Japanese auction sheet.

The VIN is a 17-character alphanumeric string, usually in the lower portion of the vehicle data section, labelled 車台No. or 車台.

IMPORTANT: The VIN is DIFFERENT from the model code (型式), which is shorter (6-10 chars) and appears in a different row. The VIN is always exactly 17 characters.

Return ONLY valid JSON. bbox must be PERCENTAGES of image dimensions (0-100):
{
  "bbox_pct": {"x": <left 0-100>, "y": <top 0-100>, "width": <2-95>, "height": <1-20>},
  "confidence": <0.0-1.0>
}`;

const TEMPLATE_FALLBACK_BBOX = { x: 40, y: 43, width: 55, height: 8 };

async function locateVinZone(image) {
  try {
    const result = await callClaudeVision({
      prompt: LOCATE_PROMPT,
      images: [image],
      system: "Locate the VIN/chassis number field precisely. Return percentage-based bounding box.",
      model: "anthropic/claude-haiku-4.5",
      maxTokens: 256,
    });
    if (!result?.bbox_pct) return { bbox: TEMPLATE_FALLBACK_BBOX, confidence: 0.3 };
    const b = result.bbox_pct;
    if (typeof b.x !== "number" || typeof b.y !== "number" || typeof b.width !== "number" || typeof b.height !== "number") {
      return { bbox: TEMPLATE_FALLBACK_BBOX, confidence: 0.3 };
    }
    if (b.x > 100 || b.y > 100 || b.width > 100 || b.height > 100) {
      try {
        const meta = await sharp(Buffer.from(image.data, "base64")).metadata();
        const W = meta.width || 1, H = meta.height || 1;
        return { bbox: { x: (b.x/W)*100, y: (b.y/H)*100, width: (b.width/W)*100, height: (b.height/H)*100 }, confidence: 0.5 };
      } catch { return { bbox: TEMPLATE_FALLBACK_BBOX, confidence: 0.3 }; }
    }
    if (b.width < 2 || b.height < 1 || b.width > 95 || b.height > 40) {
      return { bbox: TEMPLATE_FALLBACK_BBOX, confidence: 0.3 };
    }
    return { bbox: b, confidence: result.confidence || 0.7 };
  } catch (e) {
    console.warn(`[vin-zone] locator failed: ${e.message}`);
    return { bbox: TEMPLATE_FALLBACK_BBOX, confidence: 0.3 };
  }
}

// ── Step 2: Crop + upscale ──

async function cropAndUpscale(image, bboxPct) {
  const buf = Buffer.from(image.data, "base64");
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  const pad = Math.round(Math.min(W, H) * 0.03);
  const padH = Math.round(W * 0.05);
  const left = Math.max(0, Math.round((bboxPct.x * W) / 100) - padH);
  const top = Math.max(0, Math.round((bboxPct.y * H) / 100) - pad);
  const width = Math.min(W - left, Math.round((bboxPct.width * W) / 100) + 2 * padH);
  const height = Math.min(H - top, Math.round((bboxPct.height * H) / 100) + 2 * pad);
  if (width < 50 || height < 10) return null;

  const upBuf = await sharp(buf)
    .extract({ left, top, width, height })
    .resize({ width: UPSCALE_WIDTH, kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .normalize()
    .sharpen({ sigma: 0.8, m1: 1.2, m2: 2.0 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { image: { data: upBuf.toString("base64"), mediaType: "image/png" } };
}

// ── Step 3: Multi-model read ──

const READ_PROMPT = `This is a zoomed-in crop of the VIN / chassis number (車台No.) from a Japanese auction sheet.

Read the VIN CHARACTER BY CHARACTER, left to right. A valid VIN has EXACTLY 17 characters using:
  A-H, J-N, P, R-Z, 0-9
  (letters I, O, Q are NEVER used in VINs)

Common confusions to watch for:
  - 1 vs I vs l (it's always 1 or a letter, never I)
  - 0 vs O vs Q (it's always 0 or a letter, never O or Q)
  - 8 vs B (look at the shape carefully)
  - 5 vs S (look at the curves)
  - 2 vs Z (2 has a horizontal bar, Z is angular)

Brand WMI prefixes (first 3 chars):
  Mercedes = WDB, WDC, WDD, WDF
  Porsche = WP0, WP1
  Ferrari = ZFF
  Lamborghini = ZHW
  Bentley = SCB
  Jaguar = SAJ
  Range Rover/Land Rover = SAL
  BMW = WBA, WBS, WBY
  Audi = WAU, WUA
  Aston Martin = SCF
  Rolls-Royce = SCA
  McLaren = SBM

Return ONLY valid JSON:
{
  "vin": "<exactly 17 characters>",
  "characters": ["<char1>", "<char2>", ..., "<char17>"],
  "confidence": <0.0-1.0>
}`;

async function readVinMultiModel(croppedImage) {
  const tasks = VIN_MODELS.map(async ({ id, name }) => {
    try {
      const r = await callClaudeVision({
        prompt: READ_PROMPT,
        images: [croppedImage],
        system: "Read the VIN character by character. Exactly 17 characters. No I, O, or Q.",
        model: id,
        maxTokens: 512,
      });
      if (!r || typeof r !== "object") return { name, result: null };
      return { name, result: r };
    } catch (e) {
      return { name, result: null, error: e.message };
    }
  });
  return Promise.all(tasks);
}

// ── Step 4: Arbitrate ──

function cleanVin(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
  return cleaned.length === 17 ? cleaned : null;
}

function wmiMatchesAnyBrand(vin) {
  for (const pattern of Object.values(WMI_PATTERNS)) {
    if (pattern.test(vin)) return true;
  }
  return false;
}

function arbitrateVin(reads, vehicleMake) {
  const valid = reads
    .map((r) => ({ name: r.name, vin: cleanVin(r.result?.vin), confidence: r.result?.confidence || 0 }))
    .filter((r) => r.vin);

  if (valid.length === 0) return { vin: null, confidence: 0, agreement: "none" };

  // Exact cluster
  const clusters = new Map();
  for (const r of valid) {
    const existing = clusters.get(r.vin);
    if (existing) { existing.members.push(r); }
    else { clusters.set(r.vin, { vin: r.vin, members: [r] }); }
  }
  const sorted = [...clusters.values()].sort((a, b) => b.members.length - a.members.length);
  const top = sorted[0];

  if (top.members.length >= 2) {
    const wmiOk = !vehicleMake || wmiMatchesMake(top.vin, vehicleMake);
    return {
      vin: top.vin,
      confidence: top.members.length === valid.length ? 0.96 : 0.88,
      agreement: `${top.members.length}-of-${valid.length}`,
      wmiMatch: wmiOk,
    };
  }

  // No consensus — pick the one whose WMI matches the vehicle make
  if (vehicleMake) {
    const wmiMatch = valid.find((r) => wmiMatchesMake(r.vin, vehicleMake));
    if (wmiMatch) {
      return {
        vin: wmiMatch.vin,
        confidence: 0.78,
        agreement: "wmi-match",
        wmiMatch: true,
      };
    }
  }

  // Fallback: highest confidence
  valid.sort((a, b) => b.confidence - a.confidence);
  return {
    vin: valid[0].vin,
    confidence: Math.min(0.7, valid[0].confidence),
    agreement: "no-consensus",
    wmiMatch: wmiMatchesAnyBrand(valid[0].vin),
  };
}

function wmiMatchesMake(vin, make) {
  if (!vin || !make) return false;
  const lc = make.toLowerCase();
  for (const [brand, pattern] of Object.entries(WMI_PATTERNS)) {
    if (lc.includes(brand.toLowerCase()) || brand.toLowerCase().includes(lc.split("-")[0].toLowerCase())) {
      return pattern.test(vin);
    }
  }
  return true; // unknown brand — don't penalize
}

// ── Public entry point ──

export async function extractVinWithZone(image, vehicleMake = null) {
  const zone = await locateVinZone(image);
  if (!zone) return null;

  const cropped = await cropAndUpscale(image, zone.bbox);
  if (!cropped) return null;

  const reads = await readVinMultiModel(cropped.image);
  const result = arbitrateVin(reads, vehicleMake);

  console.log(`[vin-zone] result: ${result.vin} (agreement=${result.agreement}, conf=${result.confidence}, wmi=${result.wmiMatch})`);

  return {
    ...result,
    zone: { bbox: zone.bbox, locatorConfidence: zone.confidence },
  };
}
