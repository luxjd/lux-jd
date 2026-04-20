import { callClaudeVision, callClaude } from "@/lib/claude";
import { validatePhotoOutput } from "./validation";

const SYSTEM_PROMPT = `You are an expert luxury vehicle appraiser specializing in Japanese-sourced premium automobiles (Ferrari, Porsche, Mercedes-AMG, Lamborghini, Bentley, Aston Martin, etc.). You assess vehicles for German market import viability. Your assessments directly influence €50,000-€400,000 purchase decisions.`;

const USER_PROMPT = (make, model, year) => `Analyze these photos of a ${year} ${make} ${model} with expert precision.

SCORING GUIDE:
- 10: Showroom/concours condition — flawless
- 9: Near-perfect, only factory imperfections
- 8: Excellent — very light wear consistent with careful use
- 7: Very good — minor cosmetic wear, no significant issues
- 6: Good — some visible wear, light scratches/marks
- 5: Average for age/mileage — moderate wear
- 4: Below average — noticeable damage or heavy wear
- 3: Poor — significant damage, heavy wear, needs reconditioning
- 2: Very poor — major structural or cosmetic issues
- 1: Severe damage — not economically viable to repair

WHAT TO LOOK FOR:
Exterior: Paint condition (swirls, chips, respray evidence), panel gaps/alignment, wheel/rim condition (curb rash), glass condition, headlight clarity, trim condition, undercarriage if visible
Interior: Seat wear (bolsters, stitching), dashboard/trim condition, steering wheel wear, headliner, carpet, pedal wear, infotainment screen condition
Modifications: Factory vs. aftermarket (affects resale), quality of any mods, reversibility
TUV Import Risks: Non-EU headlight configuration, modified exhaust, structural modifications, tinted windows beyond limits, aftermarket wheels without ABE certification

CRITICAL INSTRUCTIONS:
- Score RELATIVE to what's expected for this ${year} ${make} ${model} at its apparent age
- If you can see the steering wheel position, note whether it's LHD or RHD
- Flag ANY item that could fail German TUV inspection
- Distinguish factory options from aftermarket modifications
- Note if interior appears factory-original (premium) or replaced (discount)

Return ONLY valid JSON:
{
  "exterior_score": <number 1-10>,
  "exterior_notes": ["specific observation 1", "specific observation 2"],
  "interior_score": <number 1-10>,
  "interior_notes": ["specific observation 1", "specific observation 2"],
  "visible_modifications": ["mod 1 — factory/aftermarket"] or [],
  "visible_damage": ["damage description with severity"] or [],
  "notable_features_spotted": ["factory option or feature"],
  "tuv_risk_flags": ["potential TUV issue 1"] or [],
  "drive_side_observed": "LHD" or "RHD" or null,
  "interior_originality": "FACTORY_ORIGINAL" or "PARTIALLY_MODIFIED" or "HEAVILY_MODIFIED" or "UNKNOWN",
  "overall_impression": "2-3 sentence expert summary including condition relative to age/model expectations",
  "confidence": <number 0.0-1.0 — lower if few photos, poor lighting, or unclear images>
}`;

// ── Photo Classification ──

const CLASSIFY_PROMPT = (count) => `Classify these ${count} vehicle photos by type. Return ONLY a JSON array of objects in the same order as the images:
[
  {"index": 0, "type": "EXTERIOR_FRONT", "priority": 1},
  {"index": 1, "type": "INTERIOR_OVERVIEW", "priority": 1},
  ...
]

Types (in priority order):
- EXTERIOR_FRONT (front 3/4 view) — priority 1
- EXTERIOR_REAR (rear 3/4 view) — priority 1
- EXTERIOR_SIDE (profile view) — priority 1
- INTERIOR_OVERVIEW (cabin overview) — priority 1
- DASHBOARD (instrument cluster/infotainment) — priority 1
- ENGINE_BAY (engine compartment) — priority 1
- WHEEL_CLOSEUP (wheel/brake detail) — priority 2
- INTERIOR_DETAIL (seats, trim closeups) — priority 2
- DAMAGE_DETAIL (damage/wear closeup) — priority 2
- TRUNK (boot/trunk area) — priority 3
- UNDERCARRIAGE (underbody) — priority 3
- DOCUMENT (paper, screen, VIN plate) — priority 4
- OTHER (unknown/unclear) — priority 4

Priority 1 photos are most important for condition assessment.`;

/**
 * Select representative photos from a larger set using AI classification.
 * If <=10 photos, returns all. If >10, classifies and picks best representative set.
 */
async function selectRepresentativePhotos(images) {
  if (images.length <= 10) return images;

  // Use fast Claude to classify photos
  try {
    const classifications = await callClaudeVision({
      prompt: CLASSIFY_PROMPT(images.length),
      images: images.slice(0, 20), // classify up to 20
      system: "You are a photo classifier for vehicle condition assessment.",
      maxTokens: 2048,
    });

    if (Array.isArray(classifications)) {
      // Sort by priority, pick diverse set
      const sorted = classifications.sort((a, b) => (a.priority || 4) - (b.priority || 4));
      const selectedIndices = new Set();
      const typesSeen = new Set();

      // First pass: one of each type, priority order
      for (const item of sorted) {
        if (selectedIndices.size >= 10) break;
        if (!typesSeen.has(item.type)) {
          typesSeen.add(item.type);
          selectedIndices.add(item.index);
        }
      }

      // Second pass: fill remaining slots with damage/detail shots
      for (const item of sorted) {
        if (selectedIndices.size >= 10) break;
        if (["DAMAGE_DETAIL", "INTERIOR_DETAIL", "WHEEL_CLOSEUP"].includes(item.type) && !selectedIndices.has(item.index)) {
          selectedIndices.add(item.index);
        }
      }

      // Third pass: fill any remaining slots
      for (const item of sorted) {
        if (selectedIndices.size >= 10) break;
        if (!selectedIndices.has(item.index)) {
          selectedIndices.add(item.index);
        }
      }

      return Array.from(selectedIndices)
        .filter((i) => i >= 0 && i < images.length)
        .map((i) => images[i]);
    }
  } catch (e) {
    console.warn("Photo classification failed, using first 10:", e.message);
  }

  return images.slice(0, 10);
}

/**
 * Analyze vehicle photos using Claude Vision with intelligent photo selection.
 * @param {Array<{data: string, mediaType: string}>} images - Base64 encoded images
 * @param {string} make
 * @param {string} model
 * @param {number} year
 * @returns {object|null} Condition assessment or null
 */
export async function analyzePhotos(images, make, model, year) {
  if (!images || images.length === 0) return null;

  // Select representative photos if too many
  const selected = await selectRepresentativePhotos(images);

  const result = await callClaudeVision({
    prompt: USER_PROMPT(make, model, year),
    images: selected,
    system: SYSTEM_PROMPT,
  });

  const validated = validatePhotoOutput(result);
  if (!validated) return null;

  // Everything photo-derived is an AI estimate by definition — no field on
  // a photo is "extracted" in the sheet-parser sense. Surface this
  // explicitly so the UI can annotate every score/note with "(Estimated)".
  validated._all_fields_estimated = true;
  validated._estimation_labels = {
    exterior_score: "Estimated",
    interior_score: "Estimated",
    exterior_notes: "Estimated",
    interior_notes: "Estimated",
    visible_modifications: "Estimated",
    visible_damage: "Estimated",
    overall_impression: "Estimated",
    notable_features_spotted: "Estimated",
    tuv_risk_flags: "Estimated",
    respray_detected: "Estimated",
    interior_originality: "Estimated",
    drive_side_observed: "Estimated",
    confidence: "Estimated",
  };

  return validated;
}
