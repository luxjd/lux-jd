/**
 * Multi-stage auction sheet extraction pipeline.
 *
 * Two-tier strategy:
 *   Tier 1 — Cheap unified extraction (single LLM call via extractVehicleData).
 *            Apply dictionary translation + schema validation. If all critical
 *            fields pass validation with high confidence → return immediately.
 *   Tier 2 — Fallback for failed fields only. Run focused per-field
 *            re-extraction via retryMissingSheetFields, then re-translate and
 *            re-validate. Optional Opus verification for high-risk fields.
 *
 * Flow:
 *   Image → detectAuctionHouse → route
 *     USS  → tier1 → translate → validate → confidence check
 *       pass → return (cheap path)
 *       fail → tier2(failed fields) → translate → validate → return
 *     Non-USS → tier1 only → translate → validate → return (with warning)
 */

import { extractVehicleData } from "./sheet-parser.js";
import { applyDictionaryTranslation } from "./deterministic-translator.js";
import { validateExtractedSchema } from "./schema-validator.js";
import { retryMissingSheetFields, FIELD_PROMPTS } from "./sheet-field-retry.js";
import { callClaudeVision } from "@/lib/claude";

// ── Constants ──────────────────────────────────────────────────

const CRITICAL_FIELDS = ["make", "model", "year", "mileageKm", "vin", "grade"];

const HIGH_RISK_FIELDS = ["vin", "mileageKm", "lotNumber"];

const USS_KEYWORDS = ["uss", "輸入車プライムコーナー", "uss tokyo", "uss yokohama",
  "uss nagoya", "uss osaka", "uss kobe", "uss saitama", "uss niigata",
  "uss hokkaido", "uss fukuoka", "uss shizuoka", "uss gunma"];

const TIER2_TIMEOUT_MS = 20_000;

// ── Helpers ────────────────────────────────────────────────────

/**
 * Detect whether the auction house is USS based on extracted data.
 */
function detectIsUSS(extracted) {
  const house = extracted?.auctionHouse || extracted?.auction_house || "";
  if (!house) return false;
  const lower = String(house).toLowerCase();
  return USS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Identify fields that failed validation or have low confidence.
 * A field "fails" if:
 *   - It was flagged with a violation
 *   - Its fieldConfidence is "low"
 *   - It's a critical field that is null/undefined
 */
function identifyFailedFields(validated, violations, fieldConfidence) {
  const failed = new Set();

  // Fields mentioned in violations
  for (const v of violations) {
    const match = v.match(/^([a-zA-Z_]+):/);
    if (match && FIELD_PROMPTS[match[1]]) {
      failed.add(match[1]);
    }
    // Cross-field violations may mention multiple fields — pick up known ones
    if (v.startsWith("Cross-field:")) {
      for (const f of Object.keys(FIELD_PROMPTS)) {
        if (v.toLowerCase().includes(f.toLowerCase())) {
          failed.add(f);
        }
      }
    }
  }

  // Fields with low confidence
  for (const [field, conf] of Object.entries(fieldConfidence)) {
    if (conf === "low" && FIELD_PROMPTS[field]) {
      failed.add(field);
    }
  }

  // Critical fields that are null/undefined
  for (const field of CRITICAL_FIELDS) {
    if ((validated[field] === null || validated[field] === undefined) && FIELD_PROMPTS[field]) {
      failed.add(field);
    }
  }

  return [...failed];
}

/**
 * Check whether Tier 1 result passes: no failed fields means we can skip Tier 2.
 */
function tier1Passes(failedFields) {
  return failedFields.length === 0;
}

/**
 * Determine if Opus verification should run.
 */
function shouldOpusVerify(opts) {
  if (opts.opusVerify !== undefined) return !!opts.opusVerify;
  if (process.env.OPUS_VERIFY_HIGH_RISK === "0") return false;
  return true;
}

/**
 * Run Opus verification for a single high-risk field.
 * Returns the verified value or null if verification fails.
 */
async function opusVerifyField(images, fieldKey, currentValue) {
  const promptMap = {
    vin: `Verify this VIN/chassis number on the Japanese auction sheet. The current reading is "${currentValue}".
Read the 車台No carefully — exactly 17 characters using A-H, J-N, P, R-Z, 0-9.
Return JSON: {"vin": "<exactly 17 chars>", "confidence": 0.0-1.0, "matches_current": true|false}`,
    registrationPlate: `Verify this registration plate on the Japanese auction sheet. Current reading: "${currentValue}".
Read 登録No carefully. Format: prefecture + 3-digit class + hiragana + 4-digit number.
Return JSON: {"registrationPlate": "<string>", "confidence": 0.0-1.0, "matches_current": true|false}`,
    mileageKm: `Verify the odometer reading on this Japanese auction sheet. Current reading: ${currentValue}.
Read every digit box left-to-right carefully.
Return JSON: {"mileageKm": <integer>, "confidence": 0.0-1.0, "matches_current": true|false}`,
    lotNumber: `Verify the lot number (出品番号) on this Japanese auction sheet. Current reading: "${currentValue}".
Return JSON: {"lotNumber": "<string>", "confidence": 0.0-1.0, "matches_current": true|false}`,
  };

  const prompt = promptMap[fieldKey];
  if (!prompt) return null;

  try {
    const result = await callClaudeVision({
      prompt,
      images,
      system: "You are verifying a specific field on a Japanese auction sheet. Be extremely precise. Return ONLY valid JSON.",
      model: "anthropic/claude-opus-4-7",
      maxTokens: 512,
    });
    if (result && result[fieldKey] !== undefined) {
      console.log(`[pipeline] Opus verified ${fieldKey}: "${result[fieldKey]}" (confidence: ${result.confidence})`);
      return result;
    }
    return null;
  } catch (e) {
    console.log(`[pipeline] Opus verification failed for ${fieldKey}: ${e.message}`);
    return null;
  }
}

/**
 * Run Tier 2 focused extraction with a timeout.
 * Returns { retryResults, timedOut }.
 */
async function runTier2WithTimeout(images, failedFields, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const retryPromise = retryMissingSheetFields(images[0], failedFields);

    const result = await Promise.race([
      retryPromise,
      new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("Tier 2 timeout"));
        });
      }),
    ]);

    clearTimeout(timer);
    return { retryResults: result, timedOut: false };
  } catch (e) {
    clearTimeout(timer);
    if (e.message === "Tier 2 timeout") {
      console.log(`[pipeline] Tier 2 timed out after ${timeoutMs}ms`);
      return { retryResults: {}, timedOut: true };
    }
    throw e;
  }
}

/**
 * Merge Tier 2 retry results into the extracted data.
 * Only overwrites fields where the retry produced a non-null value.
 */
function mergeTier2Results(extracted, retryResults) {
  const merged = { ...extracted };
  for (const [field, result] of Object.entries(retryResults)) {
    if (result && result.value !== null && result.value !== undefined) {
      merged[field] = result.value;
      console.log(`[pipeline] Tier 2 recovered ${field}: "${result.value}" (confidence: ${result.confidence}, votes: ${result.votes})`);
    }
  }
  return merged;
}

/**
 * Build the summary string for the pipeline result.
 */
function buildSummary(tier, fallbackFields, fallbackRate, isUSS, timedOut, violations) {
  const parts = [`Tier ${tier}`];
  if (!isUSS) parts.push("non-USS sheet");
  if (fallbackFields.length > 0) {
    parts.push(`${fallbackFields.length} field(s) retried: ${fallbackFields.join(", ")}`);
  }
  if (timedOut) parts.push("Tier 2 timed out");
  if (violations.length > 0) parts.push(`${violations.length} violation(s)`);
  return parts.join(" | ");
}

// ── Shadow mode ────────────────────────────────────────────────

/**
 * Run the old extractVehicleData path and the new pipeline in parallel,
 * log the diff, and return the OLD result (safe cutover).
 */
async function runShadowMode(images, opts) {
  console.log("[pipeline] SHADOW MODE: running old + new paths in parallel");

  const [oldResult, newResult] = await Promise.allSettled([
    extractVehicleData(images),
    runPipeline(images, { ...opts, _shadow: true }),
  ]);

  const oldData = oldResult.status === "fulfilled" ? oldResult.value : null;
  const newData = newResult.status === "fulfilled" ? newResult.value : null;

  if (oldData && newData) {
    const oldExtracted = oldData.extracted || oldData;
    const newExtracted = newData.extracted || {};
    const diffs = [];

    const allKeys = new Set([...Object.keys(oldExtracted), ...Object.keys(newExtracted)]);
    for (const key of allKeys) {
      if (key.startsWith("_")) continue;
      const oldVal = oldExtracted[key];
      const newVal = newExtracted[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({ field: key, old: oldVal, new: newVal });
      }
    }

    if (diffs.length > 0) {
      console.log(`[pipeline] SHADOW DIFF: ${diffs.length} field(s) differ`);
      for (const d of diffs) {
        console.log(`[pipeline]   ${d.field}: old=${JSON.stringify(d.old)} → new=${JSON.stringify(d.new)}`);
      }
    } else {
      console.log("[pipeline] SHADOW DIFF: no differences");
    }
  }

  if (oldResult.status === "rejected") {
    console.log(`[pipeline] SHADOW: old path failed: ${oldResult.reason?.message}`);
    // If old path failed, fall back to new path
    if (newResult.status === "fulfilled") return newResult.value;
    throw oldResult.reason;
  }

  // Return the old result in shadow mode (safe cutover)
  return oldData;
}

// ── Main pipeline ──────────────────────────────────────────────

/**
 * Internal pipeline implementation (used directly and by shadow mode).
 */
async function runPipeline(images, opts = {}) {
  const startTime = Date.now();

  // ── Tier 1: Unified extraction ──
  console.log("[pipeline] Tier 1: running extractVehicleData");
  const tier1Raw = await extractVehicleData(images);

  if (!tier1Raw || typeof tier1Raw !== "object") {
    throw new Error("[pipeline] Tier 1 extraction returned null or invalid data");
  }

  // extractVehicleData returns either { extracted: {...} } or the data directly
  let tier1Data = tier1Raw.extracted || tier1Raw;
  console.log(`[pipeline] Tier 1 completed in ${Date.now() - startTime}ms`);

  // Detect auction house
  const auctionHouseDetected = tier1Data.auctionHouse || tier1Data.auction_house || "unknown";
  const isUSS = detectIsUSS(tier1Data);
  console.log(`[pipeline] Auction house: "${auctionHouseDetected}" (USS: ${isUSS})`);

  // ── Dictionary translation ──
  console.log("[pipeline] Applying dictionary translation");
  const { translated: tier1Translated, untranslatedTerms: tier1Untranslated } =
    applyDictionaryTranslation(tier1Data);

  // ── Schema validation ──
  console.log("[pipeline] Validating schema");
  const { validated: tier1Validated, violations: tier1Violations, fieldConfidence: tier1Confidence } =
    validateExtractedSchema(tier1Translated);

  // ── Identify failed fields ──
  const failedFields = identifyFailedFields(tier1Validated, tier1Violations, tier1Confidence);
  console.log(`[pipeline] Failed fields: [${failedFields.join(", ")}] (${failedFields.length} total)`);

  // ── Non-USS: skip Tier 2, return with warning ──
  if (!isUSS) {
    console.log("[pipeline] Non-USS sheet — skipping Tier 2, returning Tier 1 result with warning");
    return {
      extracted: tier1Validated,
      _tier: 1,
      _fallbackFields: [],
      _fallbackRate: 0,
      _untranslatedTerms: tier1Untranslated,
      _violations: tier1Violations,
      _auctionHouseDetected: auctionHouseDetected,
      _isUSS: false,
      summary: buildSummary(1, [], 0, false, false, tier1Violations),
    };
  }

  // ── Tier 1 passes? Return cheap path ──
  if (tier1Passes(failedFields)) {
    console.log("[pipeline] Tier 1 passed all checks — returning cheap path");
    return {
      extracted: tier1Validated,
      _tier: 1,
      _fallbackFields: [],
      _fallbackRate: 0,
      _untranslatedTerms: tier1Untranslated,
      _violations: tier1Violations,
      _auctionHouseDetected: auctionHouseDetected,
      _isUSS: true,
      summary: buildSummary(1, [], 0, true, false, tier1Violations),
    };
  }

  // ── Tier 2: Focused re-extraction for failed fields ──
  console.log(`[pipeline] Tier 2: retrying ${failedFields.length} field(s): [${failedFields.join(", ")}]`);
  const tier2Start = Date.now();

  const { retryResults, timedOut } = await runTier2WithTimeout(images, failedFields, TIER2_TIMEOUT_MS);

  console.log(`[pipeline] Tier 2 completed in ${Date.now() - tier2Start}ms (timedOut: ${timedOut})`);

  // Merge retry results into tier1 data
  const mergedData = mergeTier2Results(tier1Validated, retryResults);

  // ── Re-translate after Tier 2 merge ──
  const { translated: tier2Translated, untranslatedTerms: tier2Untranslated } =
    applyDictionaryTranslation(mergedData);

  // ── Re-validate after Tier 2 merge ──
  const { validated: tier2Validated, violations: tier2Violations, fieldConfidence: tier2Confidence } =
    validateExtractedSchema(tier2Translated);

  // Combine untranslated terms (deduplicate)
  const allUntranslated = [...new Set([...tier1Untranslated, ...tier2Untranslated])];

  // ── Opus verification for high-risk fields ──
  if (shouldOpusVerify(opts) && !opts._shadow) {
    console.log("[pipeline] Running Opus verification for high-risk fields");
    const opusFields = HIGH_RISK_FIELDS.filter((f) => {
      const conf = tier2Confidence[f];
      // Verify if confidence is not "high" (i.e., "medium", "low", or missing)
      // and the field has a value worth verifying
      return tier2Validated[f] != null && conf !== "high";
    });

    if (opusFields.length > 0) {
      console.log(`[pipeline] Opus verifying: [${opusFields.join(", ")}]`);
      const opusResults = await Promise.allSettled(
        opusFields.map((f) => opusVerifyField(images, f, tier2Validated[f]))
      );

      for (let i = 0; i < opusFields.length; i++) {
        const field = opusFields[i];
        const result = opusResults[i];
        if (result.status === "fulfilled" && result.value) {
          const verified = result.value;
          if (verified[field] !== undefined && verified.confidence >= 0.9) {
            console.log(`[pipeline] Opus accepted ${field}: "${verified[field]}" (confidence: ${verified.confidence})`);
            tier2Validated[field] = verified[field];
            tier2Confidence[field] = "high";
          } else {
            console.log(`[pipeline] Opus result for ${field} below threshold (confidence: ${verified.confidence})`);
          }
        }
      }
    } else {
      console.log("[pipeline] No high-risk fields need Opus verification");
    }
  }

  // ── Compute fallback tracking ──
  const totalFields = Object.keys(FIELD_PROMPTS).length;
  const fallbackRate = failedFields.length / totalFields;

  const result = {
    extracted: tier2Validated,
    _tier: 2,
    _fallbackFields: failedFields,
    _fallbackRate: Math.round(fallbackRate * 1000) / 1000,
    _untranslatedTerms: allUntranslated,
    _violations: tier2Violations,
    _auctionHouseDetected: auctionHouseDetected,
    _isUSS: true,
    summary: buildSummary(2, failedFields, fallbackRate, true, timedOut, tier2Violations),
  };

  if (timedOut) {
    result._timedOut = true;
  }

  console.log(`[pipeline] Pipeline completed in ${Date.now() - startTime}ms (Tier ${result._tier})`);
  return result;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Extract vehicle data from auction sheet images using the multi-stage pipeline.
 *
 * @param {Array<{data: string, mediaType: string}>} images - Base64-encoded images
 * @param {object} [opts={}] - Options
 * @param {boolean} [opts.opusVerify] - Enable Opus verification for high-risk fields
 * @returns {Promise<{
 *   extracted: object,
 *   _tier: 1 | 2,
 *   _fallbackFields: string[],
 *   _fallbackRate: number,
 *   _untranslatedTerms: string[],
 *   _violations: string[],
 *   _auctionHouseDetected: string,
 *   _isUSS: boolean,
 *   summary: string,
 *   _timedOut?: boolean,
 * }>}
 */
export async function extractWithPipeline(images, opts = {}) {
  if (!images || images.length === 0) {
    throw new Error("[pipeline] No images provided");
  }

  // Shadow mode: run both old and new paths, return old result
  if (process.env.SHADOW_MODE === "1" && !opts._shadow) {
    console.log("[pipeline] Shadow mode enabled");
    return runShadowMode(images, opts);
  }

  return runPipeline(images, opts);
}
