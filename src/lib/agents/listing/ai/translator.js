/**
 * Japanese → DE/EN translator for listing inputs.
 *
 * Spec §6.3.2 step 2: "Translate Japanese documentation into German and English."
 *
 * Vehicle data arriving from the JP Sourcing agent may carry residual Japanese
 * in free-text fields (auction-sheet notes, condition notes, spec notes,
 * exterior/interior colour). Those get rendered into the listing copy, so we
 * need clean German and English versions before description generation.
 *
 * The translator is conservative: if a field has no CJK characters, it's passed
 * through unchanged. Only fields that actually contain Japanese trigger a Claude
 * call, and results are cached on the returned object so we don't translate the
 * same text twice within a request.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

// CJK unified ideographs + hiragana + katakana — everything Japanese text uses.
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

const TRANSLATABLE_FIELDS = [
  "auctionSheetNotes",
  "conditionNotes",
  "specNotes",
  "specificationNotes",
  "exteriorColor",
  "interiorColor",
  "photoSummary",
];

export function containsJapanese(text) {
  return typeof text === "string" && JAPANESE_REGEX.test(text);
}

/**
 * Translate a single string from Japanese to German + English.
 * Returns `{ de, en }` or `null` if AI unavailable or translation fails.
 */
export async function translateJa(text, context = "") {
  if (!text || !containsJapanese(text)) return { de: text, en: text };
  if (!isAIAvailable()) return null;

  const result = await callClaude({
    prompt: `Translate the following Japanese automotive text into German (DE) and English (EN). Preserve technical terminology (model codes, option names, grade markings). Keep translations concise and professional — this is going into a luxury vehicle listing.

Context: ${context || "vehicle auction / condition description"}
Japanese text:
"${text}"

Return ONLY valid JSON:
{ "de": "<German translation>", "en": "<English translation>" }`,
    system: "You are a bilingual automotive translator (Japanese → German/English) specialising in auction sheets and vehicle descriptions.",
    jsonMode: true,
  });

  if (!result?.de || !result?.en) return null;
  return { de: result.de, en: result.en };
}

/**
 * Walk a vehicle record, translating every Japanese free-text field in place.
 * Returns a shallow-cloned vehicle with `_translations` carrying the DE/EN
 * versions of every translated field, plus the original fields replaced with
 * the German translation (so existing consumers keep working).
 */
export async function translateVehicleDocs(vehicle) {
  if (!vehicle || typeof vehicle !== "object") return vehicle;

  const fieldsToTranslate = TRANSLATABLE_FIELDS
    .map((key) => ({ key, value: vehicle[key] }))
    .filter(({ value }) => containsJapanese(value));

  if (fieldsToTranslate.length === 0) return vehicle;
  if (!isAIAvailable()) return vehicle;

  const translations = {};
  for (const { key, value } of fieldsToTranslate) {
    const translated = await translateJa(value, `field: ${key}`);
    if (translated) {
      translations[key] = translated;
    }
  }

  const result = { ...vehicle, _translations: translations, _translatedFields: Object.keys(translations) };
  // Replace the original (likely Japanese) field with the German rendering so
  // downstream description generation reads proper German.
  for (const [key, { de }] of Object.entries(translations)) {
    result[key] = de;
  }
  return result;
}
