import { callClaudeVision } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert luxury vehicle appraiser specializing in Japanese-sourced premium automobiles (Ferrari, Porsche, Mercedes-AMG, Lamborghini, Bentley, Aston Martin, etc.). Analyze the provided vehicle photos and assess condition with precision.`;

const USER_PROMPT = (make, model, year) => `Analyze these photos of a ${year} ${make} ${model} and assess condition.

Return ONLY valid JSON with this exact structure:
{
  "exterior_score": <number 1-10>,
  "exterior_notes": ["observation 1", "observation 2"],
  "interior_score": <number 1-10>,
  "interior_notes": ["observation 1", "observation 2"],
  "visible_modifications": ["mod 1"] or [],
  "visible_damage": ["damage 1"] or [],
  "notable_features_spotted": ["feature 1"],
  "overall_impression": "1-2 sentence summary",
  "confidence": <number 0.0-1.0>
}

Be specific about paint condition, wheel damage, interior wear, and any non-factory modifications. Score 10 = perfect showroom condition, 1 = severe damage.`;

/**
 * Analyze vehicle photos using Claude Vision.
 * @param {Array<{data: string, mediaType: string}>} images - Base64 encoded images (max 10)
 * @param {string} make
 * @param {string} model
 * @param {number} year
 * @returns {object|null} Condition assessment or null if AI unavailable
 */
export async function analyzePhotos(images, make, model, year) {
  if (!images || images.length === 0) return null;

  // Limit to 10 best photos
  const selected = images.slice(0, 10);

  const result = await callClaudeVision({
    prompt: USER_PROMPT(make, model, year),
    images: selected,
    system: SYSTEM_PROMPT,
  });

  return result;
}
