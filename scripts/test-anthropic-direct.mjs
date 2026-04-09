/**
 * Test with DIRECT Anthropic API (not OpenRouter) to compare accuracy.
 * Tests whether the mileage issue is caused by OpenRouter's image proxy.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ANTHROPIC_API_KEY = process.argv[3] || process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.argv[4] || "claude-sonnet-4-20250514";

async function callAnthropicVision({ prompt, image, system = "", maxTokens = 4096 }) {
  const content = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data,
      },
    },
    { type: "text", text: prompt },
  ];

  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  };
  if (system) body.system = system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1] || jsonMatch[0]); } catch { return text; }
  }
  return text;
}

// Proven clean prompt from Claude.ai
const SYSTEM = "You are an expert at reading and extracting data from Japanese vehicle auction sheets (USS, TAA, JU, HAA, etc.).";

const PROMPT = `Given an image of a Japanese car auction sheet, extract ALL available data and return it as a structured JSON object.

Extract the following fields (use null if not found):

{
  "auction_info": { "auction_house": "", "lot_number": "", "auction_date": "" },
  "vehicle_basic": { "make": "", "model": "", "grade_trim": "", "chassis_code": "", "displacement_cc": "", "drive_type": "", "transmission": "", "fuel_type": "", "steering": "", "seating_capacity": "", "body_type": "", "doors": "" },
  "registration": { "first_registration_year": "", "first_registration_month": "", "inspection_expiry_year": "", "inspection_expiry_month": "", "registration_plate": "", "chassis_number": "", "import_type": "" },
  "condition": { "odometer_km": "", "odometer_unit": "", "exterior_color": "", "color_code": "", "interior_color": "", "auction_grade": "", "interior_grade": "", "air_conditioning": "" },
  "features": [],
  "inspector_notes": { "raw_notes": "", "damage_items": [] },
  "damage_diagram": { "locations": [] },
  "financials": { "recycle_fee_jpy": "", "other_fees": "" },
  "dimensions": { "length_cm": "", "width_cm": "", "height_cm": "" },
  "new_car_warranty": "",
  "notes": ""
}

IMPORTANT RULES:
1. For Japanese era years: Heisei (平成/H) add 1988 (H24=2012). Reiwa (令和/R) add 2018 (R5=2023).
2. Extract odometer carefully — note whether km or miles.
3. Auction grades: 6 (best) → 1 (worst). R/RA = repaired/accident history.
4. Interior grades: A (best) → E (worst).
5. For damage diagram, map codes to plain English locations.
6. Return ONLY valid JSON.
7. If a field is unreadable or not present, use null.`;

async function main() {
  const imagePath = process.argv[2] || "auc.jpeg";

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  DIRECT ANTHROPIC API TEST`);
  console.log(`  Image: ${imagePath}`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  API: api.anthropic.com (NOT OpenRouter)`);
  console.log(`${"═".repeat(64)}\n`);

  const imageBuffer = readFileSync(resolve(".", imagePath));
  const base64 = imageBuffer.toString("base64");
  const image = { data: base64, mediaType: "image/jpeg" };

  // ── Single pass with the proven prompt ──
  console.log("▶ Extracting with direct Anthropic API...");
  const t = Date.now();
  const result = await callAnthropicVision({ prompt: PROMPT, image, system: SYSTEM });
  console.log(`  ✓ Complete (${((Date.now() - t) / 1000).toFixed(1)}s)\n`);

  // ── Ground truth comparison ──
  const expected = {
    mileage: 85483,
    color: "Cavansite Blue",
    color_code: "890",
    vin: "WDD2314731F005822",
    year: 2012,
    grade: "4",
    interior_grade: "B",
  };

  const cond = result?.condition || {};
  const reg = result?.registration || {};
  const vb = result?.vehicle_basic || {};

  const actual = {
    mileage: parseInt(String(cond.odometer_km || "").replace(/,/g, "")),
    color: cond.exterior_color,
    color_code: cond.color_code,
    vin: reg.chassis_number,
    year: parseInt(reg.first_registration_year),
    grade: String(cond.auction_grade),
    interior_grade: cond.interior_grade,
  };

  console.log("══ ACCURACY CHECK (vs ground truth) ══");
  let correct = 0, total = 0;
  for (const [key, exp] of Object.entries(expected)) {
    const act = actual[key];
    const match = String(act).toLowerCase().includes(String(exp).toLowerCase());
    console.log(`  ${match ? "✓" : "✗"} ${key}: ${act} ${match ? "" : `(expected: ${exp})`}`);
    if (match) correct++;
    total++;
  }
  console.log(`\n  ACCURACY: ${correct}/${total} (${((correct / total) * 100).toFixed(0)}%)\n`);

  console.log("══ FULL OUTPUT ══");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
