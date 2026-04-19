import { analyzePhotos } from "@/lib/agents/valuation/photo-analyzer";

async function fetchImage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 2000 || buffer.byteLength > 8 * 1024 * 1024) return null;
    return { data: Buffer.from(buffer).toString("base64"), mediaType: contentType };
  } catch {
    return null;
  }
}

export async function analyzeListingPhotos(photoUrls, make, model, year) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) return null;
  // Fetch up to 20; analyzePhotos() then classifies & picks the best 10 representative shots.
  const selected = photoUrls.slice(0, 20);
  const imageResults = await Promise.all(selected.map((u) => fetchImage(u)));
  const images = imageResults.filter(Boolean);
  if (images.length === 0) return null;

  try {
    const raw = await analyzePhotos(images, make, model, year);
    if (!raw) return null;
    return {
      exteriorScore: raw.exterior_score ?? null,
      interiorScore: raw.interior_score ?? null,
      exteriorNotes: Array.isArray(raw.exterior_notes) ? raw.exterior_notes : [],
      interiorNotes: Array.isArray(raw.interior_notes) ? raw.interior_notes : [],
      visibleDamage: Array.isArray(raw.visible_damage) ? raw.visible_damage : [],
      visibleModifications: Array.isArray(raw.visible_modifications) ? raw.visible_modifications : [],
      notableFeatures: Array.isArray(raw.notable_features_spotted) ? raw.notable_features_spotted : [],
      tuvRiskFlags: Array.isArray(raw.tuv_risk_flags) ? raw.tuv_risk_flags : [],
      photoAnalysisSummary: raw.overall_impression || null,
      resprayDetected: Boolean(raw.respray_detected || raw.resprayDetected),
      confidence: raw.confidence ?? 0.6,
      imagesAnalyzed: images.length,
    };
  } catch (err) {
    console.warn(`listing-photos: analyzePhotos failed: ${err.message}`);
    return null;
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function analyzeAllListingPhotos(opportunities, { concurrency = 3, onProgress } = {}) {
  const eligible = opportunities
    .map((opp, i) => ({ opp, i }))
    .filter(({ opp }) => (opp.recommendation === "BUY" || opp.recommendation === "STRONG_BUY") && Array.isArray(opp.vehicle?.photoUrls) && opp.vehicle.photoUrls.length > 0);

  if (eligible.length === 0) return opportunities;

  const analyses = await runWithConcurrency(eligible, concurrency, async ({ opp }, k) => {
    onProgress?.(k, eligible.length, opp.vehicle?.make, opp.vehicle?.model);
    const result = await analyzeListingPhotos(opp.vehicle.photoUrls, opp.vehicle.make, opp.vehicle.model, opp.vehicle.year);
    return result;
  });

  for (let k = 0; k < eligible.length; k++) {
    const analysis = analyses[k];
    if (!analysis) continue;
    const { opp } = eligible[k];
    opp.photoAnalysis = analysis;
    opp.vehicle.photoAnalysisSummary = analysis.photoAnalysisSummary;
    if (Array.isArray(opp.vehicle.tuvRiskFlags)) {
      opp.vehicle.tuvRiskFlags = Array.from(new Set([...opp.vehicle.tuvRiskFlags, ...analysis.tuvRiskFlags]));
    } else {
      opp.vehicle.tuvRiskFlags = analysis.tuvRiskFlags;
    }
    if (analysis.visibleModifications.length > 0) {
      opp.vehicle.modifications = analysis.visibleModifications;
    }
    if (analysis.visibleDamage.length > 0) {
      opp.vehicle.visibleDamage = analysis.visibleDamage;
    }
  }

  return opportunities;
}
