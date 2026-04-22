import { callClaudeVision, callClaude } from "@/lib/claude";
import { validatePhotoOutput } from "./validation";
import { loadPrompt } from "./prompts/loader";

// Spec §8.1: prompts live in prompts/*.txt — no hardcoded strings here.

/**
 * Select representative photos from a larger set using AI classification.
 * If <=10 photos, returns all. If >10, classifies and picks best representative set.
 */
async function selectRepresentativePhotos(images) {
  if (images.length <= 10) return images;

  // Use fast Claude to classify photos
  try {
    const classifications = await callClaudeVision({
      prompt: loadPrompt("photo_classification", { count: images.length }),
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
    prompt: loadPrompt("photo_analysis", { make, model, year }),
    images: selected,
    system: loadPrompt("photo_analysis.system"),
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
