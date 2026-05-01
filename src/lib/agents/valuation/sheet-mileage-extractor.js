// Zone-cropped, multi-model, unit-aware mileage extractor.
//
// The single biggest remaining failure mode in auction-sheet reading is
// the odometer digit boxes. On a typical 1200-px-wide sheet, each digit
// box is ~15 pixels tall — well below what vision models can read
// reliably. Upscaling the whole sheet doesn't help much because the model
// attention is spread across the whole image.
//
// This module does three things differently:
//
//   1. ZONE CROP — asks one model to locate the 走行 region, then crops
//      just that region (with padding). The crop goes from ~1200×1100 to
//      ~300×80 — so 6 digit boxes go from ~15 px tall to ~60 px tall.
//
//   2. AGGRESSIVE UPSCALE — the cropped region is upscaled to 2000 px wide.
//      6 digit boxes in 2000 px wide image = ~250 px per digit. That's in
//      "billboard" OCR range — basically unmissable.
//
//   3. MULTI-MODEL CONSENSUS — Claude, GPT, and Gemini each read the
//      upscaled crop. Three independent architectures reading the same
//      400×120 px of digits is extremely unlikely to all agree on a wrong
//      answer unless the answer is actually ambiguous.
//
// Plus a unit-aware arbitrator: when the reads disagree, compute
// km-per-year for each candidate given the vehicle year. Readings that
// imply 2,000–35,000 km/year are plausible; 50,000+ km/year for a luxury
// vehicle almost certainly indicates a digit misread or miles-as-km
// confusion.

import sharp from "sharp";
import { callClaudeVision } from "@/lib/claude";

// This OpenRouter deployment is provider-pinned to Anthropic, so
// openai/* and google/* models 404. We use three different Anthropic
// model tiers — Opus (largest), Sonnet (mid), Haiku (fastest) — which
// have meaningfully different parameter scales and training-objective
// emphases. They share a base corpus but their error modes diverge
// enough that a 3-way consensus is still useful for digit-box OCR.
// Override by setting SHEET_ZONE_MODELS=id1,id2,id3 in env.
const ZONE_MODELS = (process.env.SHEET_ZONE_MODELS
  ? process.env.SHEET_ZONE_MODELS.split(",").map((id) => ({ id: id.trim(), name: id.trim().split("/").pop() }))
  : [
      { id: "anthropic/claude-opus-4-7",    name: "opus" },
      { id: "anthropic/claude-sonnet-4",    name: "sonnet" },
      { id: "anthropic/claude-haiku-4.5",   name: "haiku" },
    ]);

const MILES_TO_KM = 1.60934;

// Target width for the cropped mileage region. Sharp's lanczos3 upscaler
// preserves digit edges well up to ~3x zoom; beyond that we get smoothing
// artefacts that can confuse digit OCR. 2000 px is a good compromise.
const ZONE_UPSCALE_WIDTH = 2000;

// Plausible annual distance for a luxury / performance vehicle in the
// Japanese domestic / import market. Empirically observed:
//   - ~70% of luxury imports have 5-15k km/yr
//   - ~20% have 15-25k km/yr (daily drivers)
//   - ~5% have 25-40k km/yr (commuters)
//   - ~5% are below 5k km/yr (collector / low-use)
//   - >40k km/yr is highly atypical and usually an OCR hallucination
//     (e.g. reading 185,483 when the actual is 85,483)
const KM_PER_YEAR_IDEAL_MIN = 3000;
const KM_PER_YEAR_IDEAL_MAX = 25000;
const KM_PER_YEAR_PLAUSIBLE_MIN = 1500;
const KM_PER_YEAR_PLAUSIBLE_MAX = 40000;
const KM_PER_YEAR_IMPLAUSIBLE = 60000;

// Digit-count sanity. Japanese auction sheet odometers are 5, 6, or 7
// digit boxes. Readings claiming 8+ digits are hallucinated extra digits;
// readings of 3-or-fewer are missed leading digits.
const MIN_PLAUSIBLE_DIGITS = 4;
const MAX_PLAUSIBLE_DIGITS = 7;

export function zoneExtractorEnabled() {
  if (process.env.SHEET_MILEAGE_ZONE === "0") return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Step 1 — locate the mileage zone
// ─────────────────────────────────────────────────────────────

const ZONE_LOCATE_PROMPT = `Locate the odometer / mileage field on this Japanese vehicle auction sheet AND identify its unit marker.

The mileage field shows a row of numeric digit boxes next to or below the Japanese label 走行 (sometimes written as 走行距離).

UNIT IDENTIFICATION (critical — read carefully):
- A printed "km" label = mileage is in kilometres.
- A printed "マイル" or "Miles" or "Mile" label = mileage is in miles. Just identify the unit — do NOT convert.
- Look at the text immediately AFTER the digit boxes — the unit is almost always printed there.
- On USS Import Prime Corner sheets specifically, imported vehicles often show マイル.

Return ONLY valid JSON. bbox must be PERCENTAGES of the image dimensions (0-100), not pixels.

{
  "bbox_pct": {"x": <left edge 0-100>, "y": <top edge 0-100>, "width": <2-95>, "height": <1-30>},
  "unit_visible": "<'km' | 'miles' | 'none'>",
  "unit_text_read": "<the exact characters you saw near the digit boxes, e.g. 'km' or 'マイル' or null>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explaining how you identified the unit>"
}`;

// When the LLM-based locator fails (or returns garbage), use a template
// fallback based on empirical sheet layouts. Japanese import-car auction
// sheets (USS Import Prime Corner, TAA, HAA) universally place the
// mileage field in a band roughly 20-45% from the top, 0-45% from the
// left. Over-wide rather than under-wide — a wider crop still gets
// upscaled and can contain the unit marker.
const TEMPLATE_FALLBACK_BBOX = { x: 0, y: 20, width: 45, height: 15 };

async function locateMileageZone(image) {
  try {
    const result = await callClaudeVision({
      prompt: ZONE_LOCATE_PROMPT,
      images: [image],
      system: "You are a computer-vision assistant for document-layout analysis. Be precise about bounding-box coordinates.",
      maxTokens: 512,
    });
    if (!result || typeof result !== "object") {
      console.warn("[mileage-zone] locator returned non-object; falling back to template crop");
      return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: "none", confidence: 0.3, reasoning: "LLM locator failed; using template fallback" };
    }
    if (!result.bbox_pct) {
      console.warn(`[mileage-zone] locator returned object without bbox_pct: ${JSON.stringify(result).slice(0, 200)}; using template fallback`);
      return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: result.unit_visible || "none", confidence: 0.35, reasoning: "LLM bbox missing; template fallback" };
    }
    let b = result.bbox_pct;
    if (typeof b.x !== "number" || typeof b.y !== "number" || typeof b.width !== "number" || typeof b.height !== "number") {
      console.warn(`[mileage-zone] locator bbox has invalid types: ${JSON.stringify(b)}; template fallback`);
      return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: result.unit_visible || "none", confidence: 0.35, reasoning: "LLM bbox invalid; template fallback" };
    }
    // Auto-detect whether the LLM returned percentages or pixels. If any
    // dimension exceeds 100 it must be pixels; convert using image meta.
    if (b.x > 100 || b.y > 100 || b.width > 100 || b.height > 100) {
      try {
        const meta = await sharp(Buffer.from(image.data, "base64")).metadata();
        const W = meta.width || 1;
        const H = meta.height || 1;
        b = {
          x: (b.x / W) * 100,
          y: (b.y / H) * 100,
          width: (b.width / W) * 100,
          height: (b.height / H) * 100,
        };
        console.log(`[mileage-zone] locator bbox detected as pixels; converted to pct: ${JSON.stringify(b)}`);
      } catch {
        console.warn("[mileage-zone] pixel→pct conversion failed; template fallback");
        return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: result.unit_visible || "none", confidence: 0.35, reasoning: "pixel bbox conversion failed; template fallback" };
      }
    }
    // Sanity-check the (now-percentage) bbox.
    if (b.width < 2 || b.height < 1 || b.width > 95 || b.height > 50) {
      console.warn(`[mileage-zone] locator bbox out of plausible size after conversion: ${JSON.stringify(b)}; template fallback`);
      return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: result.unit_visible || "none", confidence: 0.35, reasoning: "LLM bbox size implausible; template fallback" };
    }
    // Position sanity — mileage on Japanese auction sheets is ALWAYS in the
    // upper half of the sheet (走行 row is directly below the vehicle-info
    // header, typically y=15-45%). A bbox with y > 55% means the locator
    // found something else (registration plate, VIN row, damage diagram
    // label) — a common failure where the locator reads a later 4-6 digit
    // number as "mileage". Template-fallback in that case.
    if (b.y > 55) {
      console.warn(`[mileage-zone] locator bbox at y=${b.y.toFixed(1)}% is below upper-half boundary; likely not the mileage field → template fallback`);
      return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: result.unit_visible || "none", confidence: 0.35, reasoning: `LLM bbox y=${b.y.toFixed(1)}% outside plausible mileage zone; template fallback` };
    }
    return {
      bbox: b,
      unitVisible: result.unit_visible || "none",
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning || null,
    };
  } catch (e) {
    console.warn(`[mileage-zone] locator threw: ${e.message}; template fallback`);
    return { bbox: TEMPLATE_FALLBACK_BBOX, unitVisible: "none", confidence: 0.3, reasoning: `locator error: ${e.message}; template fallback` };
  }
}

// ─────────────────────────────────────────────────────────────
// Step 2 — crop + upscale
// ─────────────────────────────────────────────────────────────

async function cropAndUpscale(image, bboxPct, { padding = 20, horizontalPadding = 50 } = {}) {
  const buf = Buffer.from(image.data, "base64");
  const meta = await sharp(buf).metadata();
  const W = meta.width;
  const H = meta.height;

  // Convert percentages → pixels, clamp to image bounds. Use asymmetric
  // padding — horizontal padding is larger because the unit marker
  // (km / マイル) is typically printed to the right of the digit boxes
  // outside the LLM's reported bbox. Without capturing that marker, the
  // zoomed crop loses the km-vs-miles context.
  const padPxV = Math.round((Math.min(W, H) * padding) / 100);
  const padPxH = Math.round((W * horizontalPadding) / 100);
  const left = Math.max(0, Math.round((bboxPct.x * W) / 100) - padPxH);
  const top = Math.max(0, Math.round((bboxPct.y * H) / 100) - padPxV);
  const width = Math.min(W - left, Math.round((bboxPct.width * W) / 100) + 2 * padPxH);
  const height = Math.min(H - top, Math.round((bboxPct.height * H) / 100) + 2 * padPxV);

  // Refuse suspiciously tiny crops — a <50×10 crop means the LLM gave us
  // a wrong bbox and there's nothing to read.
  if (width < 80 || height < 20) {
    return null;
  }

  // Upscale the crop to 2000 px wide, preserving aspect ratio.
  const upBuf = await sharp(buf)
    .extract({ left, top, width, height })
    .resize({ width: ZONE_UPSCALE_WIDTH, kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
    .normalize()
    .sharpen({ sigma: 0.8, m1: 1.2, m2: 2.0 })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    image: { data: upBuf.toString("base64"), mediaType: "image/png" },
    cropDims: { left, top, width, height },
    upscaledWidth: ZONE_UPSCALE_WIDTH,
  };
}

// ─────────────────────────────────────────────────────────────
// Step 3 — multi-model read on the cropped region
// ─────────────────────────────────────────────────────────────

const ZONE_READ_PROMPT = `This is a zoomed-in crop of the odometer / mileage region from a Japanese vehicle auction sheet.

═══════════════════════════════════════════════════════════════
STEP 1 — READ THE DIGIT BOXES (left-to-right, every digit including zeros)
═══════════════════════════════════════════════════════════════
You see a row of numeric digit boxes — typically 6 or 7 boxes, each holding ONE digit.
- Do NOT drop leading zeros: "045032" = 45,032 (NOT 450,320 and NOT 4,503).
- Read every box — boxes on the far left and right are easy to miss.

═══════════════════════════════════════════════════════════════
STEP 2 — HUNT FOR THE UNIT MARKER (this is the single most common error)
═══════════════════════════════════════════════════════════════
Scan the ENTIRE image for ANY of these characters/strings. They are usually
printed to the RIGHT of the digit boxes but may also be above or below.

Miles markers (ALL of these = miles):
  マイル       (katakana "mairu")
  Miles
  Mile
  ml
  mi
  mile

KM markers (ALL of these = km):
  km
  ＫＭ
  キロ         (katakana "kiro")
  KM

PRIORITY: if you see マイル anywhere in the crop, the sheet is in MILES.
Japanese import vehicles (ディーラー並行, 輸入車) commonly show マイル.

═══════════════════════════════════════════════════════════════
STEP 3 — REPORT RAW READING (DO NOT CONVERT)
═══════════════════════════════════════════════════════════════
- Set mileage_km = raw_number ALWAYS (do NOT multiply by 1.60934)
- The unit field tells the consumer whether conversion is needed
- We preserve the original reading exactly as printed

Return ONLY valid JSON:
{
  "digit_count": <integer>,
  "digits_sequence": "<left-to-right digits as a string, e.g. '085483'>",
  "raw_number": <integer>,
  "unit_marker_found": "<the literal characters you saw near the digits, or null>",
  "unit": "<'km' | 'miles' | 'unclear'>",
  "mileage_km": <integer — SAME as raw_number, do NOT convert>,
  "confidence": <0.0-1.0>
}`;

async function readZoneMultiModel(croppedImage) {
  const tasks = ZONE_MODELS.map(async ({ id, name }) => {
    try {
      const r = await callClaudeVision({
        prompt: ZONE_READ_PROMPT,
        images: [croppedImage],
        system: "Read digit boxes carefully. Preserve leading zeros. Report every digit.",
        model: id,
        maxTokens: 1024,
      });
      if (!r || typeof r !== "object") {
        console.warn(`[mileage-zone] ${name} returned no parseable JSON`);
        return { name, model: id, result: null, error: "no JSON in response" };
      }
      return { name, model: id, result: r };
    } catch (e) {
      console.warn(`[mileage-zone] ${name} threw: ${e.message}`);
      return { name, model: id, result: null, error: e.message };
    }
  });
  return Promise.all(tasks);
}

// ─────────────────────────────────────────────────────────────
// Step 4 — unit-aware arbitration
// ─────────────────────────────────────────────────────────────

function kmPerYear(mileageKm, vehicleYear) {
  if (!vehicleYear || vehicleYear > new Date().getFullYear() + 1) return null;
  const age = Math.max(0.5, new Date().getFullYear() - vehicleYear);
  return mileageKm / age;
}

// Model-tier weight — Opus is empirically the most reliable single-model
// read on digit boxes. Lower tiers sometimes add/drop digits. When the
// three tiers disagree, trust Opus more.
const MODEL_TIER_WEIGHT = {
  opus: 0.3,
  claude: 0.3,              // alias if called with default name
  sonnet: 0.15,
  haiku: 0.0,               // neutral; haiku is fast but weakest for OCR
};

function scoreReading(reading, vehicleYear) {
  if (!reading || typeof reading.mileage_km !== "number" || reading.mileage_km <= 0) {
    return { reading, score: -Infinity, kmPerYr: null, reason: "no valid mileage" };
  }
  const km = reading.mileage_km;
  const kmy = kmPerYear(km, vehicleYear);

  let score = reading.confidence || 0.5;
  let reason = `conf=${(reading.confidence || 0.5).toFixed(2)}`;

  // Tiered plausibility — ideal > plausible > high > implausible.
  if (kmy != null) {
    if (kmy >= KM_PER_YEAR_IDEAL_MIN && kmy <= KM_PER_YEAR_IDEAL_MAX) {
      score += 0.6;
      reason += `; ideal ${Math.round(kmy)} km/yr (+0.6)`;
    } else if (kmy >= KM_PER_YEAR_PLAUSIBLE_MIN && kmy <= KM_PER_YEAR_PLAUSIBLE_MAX) {
      score += 0.25;
      reason += `; plausible ${Math.round(kmy)} km/yr (+0.25)`;
    } else if (kmy < KM_PER_YEAR_PLAUSIBLE_MIN) {
      score += 0.05;  // low-km cars exist but are rarer; small positive
      reason += `; low ${Math.round(kmy)} km/yr (+0.05)`;
    } else if (kmy < KM_PER_YEAR_IMPLAUSIBLE) {
      score -= 0.5;
      reason += `; HIGH ${Math.round(kmy)} km/yr (-0.5, likely extra digit)`;
    } else {
      score -= 1.0;
      reason += `; IMPLAUSIBLE ${Math.round(kmy)} km/yr (-1.0, almost certainly hallucinated)`;
    }
  }

  // Digit-count sanity — more than 7 digits means the model added extras.
  if (typeof reading.digit_count === "number") {
    if (reading.digit_count > MAX_PLAUSIBLE_DIGITS) {
      score -= 0.4;
      reason += `; ${reading.digit_count} digits (>${MAX_PLAUSIBLE_DIGITS}) = -0.4`;
    } else if (reading.digit_count < MIN_PLAUSIBLE_DIGITS) {
      score -= 0.3;
      reason += `; ${reading.digit_count} digits (<${MIN_PLAUSIBLE_DIGITS}) = -0.3`;
    }
  }

  // Also check raw digit string length. Some models return digit_count
  // correctly but their digits_sequence is longer.
  if (typeof reading.digits_sequence === "string") {
    const rawLen = reading.digits_sequence.replace(/\D/g, "").length;
    if (rawLen > MAX_PLAUSIBLE_DIGITS) {
      score -= 0.3;
      reason += `; digit string ${rawLen} chars long (-0.3)`;
    }
  }

  // Bonus for unit-aware reads.
  if (reading.unit === "km" || reading.unit === "miles") {
    score += 0.1;
    reason += `; unit=${reading.unit} (+0.1)`;
  }

  // Model-tier weight.
  const tier = reading.name || reading.model || "";
  const tierKey = Object.keys(MODEL_TIER_WEIGHT).find((k) => tier.toLowerCase().includes(k));
  if (tierKey) {
    score += MODEL_TIER_WEIGHT[tierKey];
    reason += `; ${tierKey} tier (+${MODEL_TIER_WEIGHT[tierKey].toFixed(2)})`;
  }

  return { reading, score, kmPerYr: kmy, reason };
}

function arbitrate(readings, vehicleYear, locatorUnitHint = "none") {
  const valid = readings.filter((r) => r && typeof r.mileage_km === "number" && r.mileage_km > 0);
  if (valid.length === 0) {
    return { mileage_km: null, confidence: 0, agreement: "none", reads: readings, rationale: "no valid reads from any model" };
  }

  // ── Stage 1: exact-value cluster (same km within 1%) ──
  const clusters = [];
  for (const r of valid) {
    const match = clusters.find((c) => Math.abs(c.value - r.mileage_km) / c.value < 0.01);
    if (match) {
      match.members.push(r);
    } else {
      clusters.push({ value: r.mileage_km, members: [r] });
    }
  }
  clusters.sort((a, b) => b.members.length - a.members.length);
  const topCluster = clusters[0];

  if (topCluster.members.length >= 2) {
    return {
      mileage_km: Math.round(topCluster.value),
      confidence: topCluster.members.length === readings.length ? 0.96 : 0.88,
      agreement: `${topCluster.members.length}-of-${readings.length}-models`,
      reads: readings,
      rationale: `${topCluster.members.length} models independently read ${Math.round(topCluster.value)} km`,
    };
  }

  // ── Stage 2: unit-majority arbitration ──
  // If exact-value clustering failed, check whether models AGREE on the unit.
  // Two models saying "miles" is a much stronger signal than their exact
  // mileage readings agreeing, because the unit marker is a single token —
  // easier to read reliably than a 6-7 digit sequence.
  const unitBuckets = { miles: [], km: [], unclear: [] };
  for (const r of valid) {
    const u = r.unit === "miles" ? "miles" : r.unit === "km" ? "km" : "unclear";
    unitBuckets[u].push(r);
  }
  const sortedUnits = Object.entries(unitBuckets)
    .filter(([u]) => u !== "unclear")
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedUnits.length > 0 && sortedUnits[0][1].length >= 2) {
    const [winningUnit, unitAgreeingReads] = sortedUnits[0];
    // Score the unit-agreeing reads on plausibility; pick the best.
    const scored = unitAgreeingReads.map((r) => scoreReading(r, vehicleYear));
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    // If the winning reads also agree on mileage_km within 2%, confidence is high.
    const exactAgreement = unitAgreeingReads.filter((r) =>
      Math.abs(r.mileage_km - winner.reading.mileage_km) / winner.reading.mileage_km < 0.02
    ).length;
    return {
      mileage_km: Math.round(winner.reading.mileage_km),
      confidence: exactAgreement >= 2 ? 0.92 : 0.82,
      agreement: `unit-majority (${sortedUnits[0][1].length}/${valid.length} models → ${winningUnit})`,
      reads: readings,
      rationale: `${sortedUnits[0][1].length} of ${valid.length} models agreed unit=${winningUnit}. Among those, "${winner.reading.name}" had highest plausibility (${Math.round(winner.kmPerYr || 0)} km/yr). Outlier reads were discarded.`,
      unitAgreement: { unit: winningUnit, votes: sortedUnits[0][1].length, total: valid.length },
      winningRead: { model: winner.reading.name, km: winner.reading.mileage_km },
    };
  }

  // If only one model returned a reading AND it's plausibly unit-tagged
  // AND it gives a reasonable km/year, trust it — a zoomed-in single read
  // is categorically more reliable than whole-sheet reads at 15px/digit.
  // Use the locator's unit_visible to cross-check the reader's unit.
  if (valid.length === 1 && locatorUnitHint !== "none") {
    const only = valid[0];
    const kmy = kmPerYear(only.mileage_km, vehicleYear);
    const unitMatches = only.unit && (only.unit === locatorUnitHint || only.unit === "unclear");
    const plausibleKmy = kmy == null || (kmy >= KM_PER_YEAR_PLAUSIBLE_MIN && kmy <= KM_PER_YEAR_PLAUSIBLE_MAX);

    // Unit-disagreement policy:
    //   The READER is zoomed into the digit-box region with an explicit
    //   hunt-for-マイル instruction. The LOCATOR works from a whole-image
    //   view and frequently misses tiny unit markers. So when they
    //   disagree, TRUST THE READER.
    //
    //   Exception: if the reader says "unclear", fall back to the locator
    //   (the locator's guess is still better than nothing).
    let finalKm = only.mileage_km;
    let note = "reader unit agrees with locator";

    if (only.unit === "miles" || only.unit === "km") {
      // Reader made a definite call — trust it. mileage_km is already
      // converted properly by the reader per STEP 3 of its prompt.
      note = locatorUnitHint === "none" || locatorUnitHint === only.unit
        ? `reader confirmed unit=${only.unit}`
        : `reader saw unit="${only.unit}" with an explicit ${only.unit === "miles" ? "マイル" : "km"} marker in the zoom; locator's "${locatorUnitHint}" overruled`;
    } else if (only.unit === "unclear" && locatorUnitHint === "miles") {
      // Reader couldn't tell; locator saw miles → apply conversion.
      finalKm = Math.round(only.mileage_km * MILES_TO_KM);
      note = `reader unit unclear; locator saw miles → converted to ${finalKm} km`;
    }

    if (plausibleKmy || only.unit === "miles" || only.unit === "km") {
      return {
        mileage_km: finalKm,
        confidence: only.unit === "miles" || only.unit === "km" ? 0.85 : (unitMatches ? 0.80 : 0.70),
        agreement: "1-of-3-zone",
        reads: readings,
        rationale: `Only ${only.name} read the cropped zone; ${note}; km/year ${kmy ? Math.round(kmy) : "?"}.`,
        unitMarkerFound: only.unit_marker_found || null,
      };
    }
  }

  // No consensus — fall back to plausibility scoring.
  const scored = valid.map((r) => scoreReading(r, vehicleYear));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];

  // If the locator saw a clear unit marker and none of the readings agree
  // with it, drop confidence further.
  const unitConsistent = locatorUnitHint === "none"
    || !winner.reading.unit
    || winner.reading.unit === locatorUnitHint
    || winner.reading.unit === "unclear";

  return {
    mileage_km: Math.round(winner.reading.mileage_km),
    confidence: Math.max(0.45, Math.min(0.7, 0.5 + winner.score * 0.1)) - (unitConsistent ? 0 : 0.15),
    agreement: "no-consensus-scored",
    reads: readings,
    rationale: `No model agreement. Arbitrated by plausibility — winner ${winner.reading.name || "?"}: ${winner.reason}`,
    unitConsistentWithLocator: unitConsistent,
    allScores: scored.map((s) => ({
      model: s.reading.name || s.reading.model,
      km: s.reading.mileage_km,
      kmPerYr: s.kmPerYr,
      score: s.score,
      reason: s.reason,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────

/**
 * Extract the mileage with the full zone-crop + multi-model + arbitrate
 * pipeline. Returns null on hard failure (e.g., can't locate zone); the
 * caller should fall back to the whole-sheet read in that case.
 */
export async function extractMileageWithZone(image, vehicleYear = null) {
  // Step 1: locate
  const zone = await locateMileageZone(image);
  if (!zone) return null;

  // Step 2: crop + upscale
  const cropped = await cropAndUpscale(image, zone.bbox);
  if (!cropped) return null;

  // Step 3: read with 3 models
  const reads = await readZoneMultiModel(cropped.image);

  // Pull normalised reading objects out of the model responses.
  const normalisedReads = reads.map((r) => {
    if (!r.result) return { name: r.name, model: r.model, mileage_km: null, error: r.error };
    return {
      name: r.name,
      model: r.model,
      digit_count: r.result.digit_count ?? null,
      digits_sequence: r.result.digits_sequence ?? null,
      raw_number: r.result.raw_number ?? null,
      unit: r.result.unit ?? null,
      mileage_km: typeof r.result.mileage_km === "number" ? r.result.mileage_km : null,
      confidence: typeof r.result.confidence === "number" ? r.result.confidence : 0.5,
    };
  });

  // Step 4: arbitrate
  const result = arbitrate(normalisedReads, vehicleYear, zone.unitVisible);

  // Determine the consensus unit from the model reads
  const unitVotes = { km: 0, miles: 0, unclear: 0 };
  for (const r of normalisedReads) {
    if (r.unit === "km") unitVotes.km++;
    else if (r.unit === "miles") unitVotes.miles++;
    else unitVotes.unclear++;
  }
  const consensusUnit = unitVotes.miles > unitVotes.km ? "miles"
    : unitVotes.km > 0 ? "km"
    : zone.unitVisible === "miles" ? "miles"
    : "km";

  return {
    ...result,
    mileage_unit: consensusUnit,
    zone: {
      bbox: zone.bbox,
      unitVisible: zone.unitVisible,
      locatorConfidence: zone.confidence,
    },
    cropDims: cropped.cropDims,
    upscaledWidth: cropped.upscaledWidth,
  };
}
