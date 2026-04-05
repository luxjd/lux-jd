import { callClaudeVision } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert at reading Japanese vehicle auction inspection sheets (検査表 / Shaken). You can read Japanese text, auction condition codes, and damage diagrams. Always translate findings to English.`;

const USER_PROMPT = `Analyze this Japanese vehicle auction inspection sheet and extract ALL information visible.

Return ONLY valid JSON with this exact structure:
{
  "overall_grade": <float 1.0-6.0 or null if not visible>,
  "interior_grade": "<A/B/C/D or null>",
  "panel_conditions": {
    "front_bumper": "condition description",
    "hood": "condition description",
    "roof": "condition description",
    "left_front_fender": "condition description",
    "right_front_fender": "condition description",
    "left_rear_fender": "condition description",
    "right_rear_fender": "condition description",
    "trunk": "condition description",
    "rear_bumper": "condition description"
  },
  "mechanical_notes": ["translated to English"],
  "modification_notes": ["translated to English"],
  "damage_codes": [{"location": "...", "code": "...", "meaning": "English translation"}],
  "accident_indicator": <true/false>,
  "mileage_reading": <integer or null>,
  "equipment_notes": ["translated to English"],
  "overall_assessment": "1-2 sentence summary in English",
  "confidence": <number 0.0-1.0>
}

If any section is not readable or not present on the sheet, use null. Be precise with damage codes — translate every Japanese code to its English meaning.`;

/**
 * Parse a Japanese auction inspection sheet using Claude Vision.
 * @param {{data: string, mediaType: string}} image - Base64 encoded auction sheet
 * @returns {object|null} Parsed sheet data or null if AI unavailable
 */
export async function parseAuctionSheet(image) {
  if (!image) return null;

  const result = await callClaudeVision({
    prompt: USER_PROMPT,
    images: [image],
    system: SYSTEM_PROMPT,
  });

  return result;
}
