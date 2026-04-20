/**
 * Spec-differentiated comparables bucketing (docx §6.1.3).
 *
 * Docx: "Differentiate by critical spec elements (exterior color, interior,
 * optional equipment, service history completeness)."
 *
 * Pipeline:
 *   1. Deterministic mileage banding (always applied)
 *   2. ONE Claude call to enrich all listings with structured spec
 *      (color, interior, key options, service-history indicator)
 *   3. Bucket listings by color / mileage band / service history
 *   4. Compute per-bucket stats (count, median, p25, p75)
 *
 * Cost: one extra Claude call per model scan. Input is the listing titles
 * only (a few hundred tokens), output is structured JSON. Gated on
 * `listings.length >= 5` — below that the buckets don't have enough
 * samples to be meaningful.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const MIN_LISTINGS_FOR_BUCKETING = 5;
const MIN_BUCKET_SIZE = 2;

function mileageBand(km) {
  if (km == null || km === 0) return "unknown";
  if (km < 25000) return "low";
  if (km < 50000) return "medium";
  return "high";
}

function stats(prices) {
  if (!prices || prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: n,
    mean: Math.round(sum / n),
    median: n % 2
      ? sorted[Math.floor(n / 2)]
      : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2),
    p25: sorted[Math.max(0, Math.floor(n / 4))],
    p75: sorted[Math.min(n - 1, Math.floor((3 * n) / 4))],
    min: sorted[0],
    max: sorted[n - 1],
  };
}

async function enrichWithAI(listings, make, model) {
  if (!isAIAvailable() || listings.length === 0) return null;
  try {
    const result = await callClaude({
      prompt: `Classify these ${listings.length} ${make} ${model} listings by critical spec.
Return only what is explicitly visible in each listing's title — do not infer.

LISTINGS:
${listings.map((l, i) => `${i}: ${l.title}`).join("\n")}

Return ONLY valid JSON:
{
  "listings": [
    {"i": 0, "color": "<exterior color name or null>", "interior": "<interior color/material or null>", "keyOptions": ["<factory option>"], "serviceHistory": "FULL_DEALER|PARTIAL|UNKNOWN"},
    {"i": 1, ...}
  ]
}

Rules:
- color: only if explicitly named (e.g. "Rosso Corsa", "Selenite Grey", "GT Silver"). Normalize common variants ("Nero" → "Nero", "Black" → "Black"). null if not mentioned
- interior: e.g. "Nero leather", "Saddle Brown", "Alcantara". null if not mentioned
- keyOptions: only factory options with meaningful price impact (PCCB, Sport Chrono, Carbon Pack, Daytona seats, Sport Exhaust, etc.). Empty array if none named
- serviceHistory: FULL_DEALER only if "full dealer history" / "Scheckheft lückenlos" explicitly stated; PARTIAL if generic "service history" mentioned; UNKNOWN otherwise`,
      system: "You are a luxury car spec extractor. Only return facts visible in the title. Do not invent details.",
      jsonMode: true,
      maxTokens: 3000,
    });
    return Array.isArray(result?.listings) ? result.listings : null;
  } catch (e) {
    console.warn("spec-bucketer: AI enrichment failed:", e.message);
    return null;
  }
}

function normalizeColor(color) {
  if (!color || typeof color !== "string") return null;
  const c = color.trim();
  if (c.length < 2) return null;
  // Fold very common variants
  const lower = c.toLowerCase();
  if (/^(black|nero|schwarz|noir)$/.test(lower)) return "Black";
  if (/^(white|bianco|weiß|weiss|blanc)$/.test(lower)) return "White";
  if (/^(silver|argento|silber|argent)$/.test(lower)) return "Silver";
  if (/^(red|rosso|rot|rouge)$/.test(lower)) return "Red";
  return c;
}

/**
 * Bucket listings by spec dimensions and return per-bucket stats.
 *
 * @param {Array} listings — scraped listings with {title, price, mileage, year, platform, url, saleType?}
 * @param {string} make
 * @param {string} model
 * @returns {Promise<object>} Bucketed comparables + per-bucket price stats
 */
export async function bucketComparablesBySpec(listings, make, model) {
  const empty = {
    enriched: [],
    byColor: {},
    byMileage: {},
    byServiceHistory: {},
    sampleSize: 0,
    enrichmentSource: "none",
    skipped: true,
  };

  if (!Array.isArray(listings) || listings.length < MIN_LISTINGS_FOR_BUCKETING) {
    return { ...empty, skipReason: `fewer than ${MIN_LISTINGS_FOR_BUCKETING} listings` };
  }

  // ── 1. Deterministic mileage banding ──
  const withBands = listings.map((l) => ({
    ...l,
    _mileageBand: mileageBand(l.mileage),
  }));

  // ── 2. AI enrichment ──
  const aiEnriched = await enrichWithAI(withBands, make, model);
  const enrichedMap = new Map();
  if (Array.isArray(aiEnriched)) {
    for (const e of aiEnriched) {
      if (typeof e?.i === "number") enrichedMap.set(e.i, e);
    }
  }

  const enriched = withBands.map((l, i) => {
    const e = enrichedMap.get(i) || {};
    return {
      ...l,
      color: normalizeColor(e.color),
      interior: e.interior || null,
      keyOptions: Array.isArray(e.keyOptions) ? e.keyOptions : [],
      serviceHistory: ["FULL_DEALER", "PARTIAL", "UNKNOWN"].includes(e.serviceHistory)
        ? e.serviceHistory
        : "UNKNOWN",
    };
  });

  // ── 3. Bucket by color ──
  const colorGroups = {};
  for (const l of enriched) {
    if (!l.color) continue;
    if (!colorGroups[l.color]) colorGroups[l.color] = [];
    colorGroups[l.color].push(l.price);
  }
  const byColor = Object.fromEntries(
    Object.entries(colorGroups)
      .filter(([, prices]) => prices.length >= MIN_BUCKET_SIZE)
      .map(([color, prices]) => [color, stats(prices)])
  );

  // ── 4. Bucket by mileage band ──
  const mileageGroups = { low: [], medium: [], high: [], unknown: [] };
  for (const l of enriched) {
    mileageGroups[l._mileageBand].push(l.price);
  }
  const byMileage = Object.fromEntries(
    Object.entries(mileageGroups)
      .filter(([band, prices]) => band !== "unknown" && prices.length >= MIN_BUCKET_SIZE)
      .map(([band, prices]) => [band, stats(prices)])
  );

  // ── 5. Bucket by service history ──
  const serviceGroups = {};
  for (const l of enriched) {
    if (!serviceGroups[l.serviceHistory]) serviceGroups[l.serviceHistory] = [];
    serviceGroups[l.serviceHistory].push(l.price);
  }
  const byServiceHistory = Object.fromEntries(
    Object.entries(serviceGroups)
      .filter(([, prices]) => prices.length >= MIN_BUCKET_SIZE)
      .map(([sh, prices]) => [sh, stats(prices)])
  );

  // ── 6. Derive premiums (color vs baseline black/white) ──
  const colorPremiums = {};
  const baselineMedians = [byColor.Black?.median, byColor.White?.median, byColor.Silver?.median].filter(Boolean);
  const baselineMedian = baselineMedians.length
    ? baselineMedians.reduce((a, b) => a + b, 0) / baselineMedians.length
    : null;
  if (baselineMedian) {
    for (const [color, s] of Object.entries(byColor)) {
      if (["Black", "White", "Silver"].includes(color)) continue;
      const premium = (s.median - baselineMedian) / baselineMedian;
      colorPremiums[color] = {
        modifier: Number((1 + premium).toFixed(3)),
        premiumEur: Math.round(s.median - baselineMedian),
        sampleSize: s.count,
      };
    }
  }

  return {
    enriched: enriched.map(({ _mileageBand, ...rest }) => ({ ...rest, mileageBand: _mileageBand })),
    byColor,
    byMileage,
    byServiceHistory,
    derivedColorPremiums: colorPremiums,
    sampleSize: enriched.length,
    enrichmentSource: aiEnriched ? "ai_enriched" : "deterministic_only",
  };
}
