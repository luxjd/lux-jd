/**
 * Test script — runs auction sheet through the improved multi-pass analyzer.
 * Uses: TRIPLE mileage read, DUAL color read, majority vote consensus.
 * Usage: node scripts/test-sheet-parser.mjs <path-to-image>
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load env ──
const envPath = resolve(".", ".env.local");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
} catch { /* ignore */ }

// ── OpenRouter API client ──
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = process.argv[3] || "anthropic/claude-sonnet-4-6";

async function callClaudeVision({ prompt, images = [], system = "", maxTokens = 4096 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("No API key");

  const content = [];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
  }
  content.push({ type: "text", text: prompt });

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content });

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://luxjd.com",
      "X-Title": "LuxJD Sheet Parser Test v2",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1] || jsonMatch[0]); } catch { return null; }
  }
  return text;
}

// ═══════════════════════════════════════════
// PROMPTS (from refactored sheet-parser.js)
// ═══════════════════════════════════════════

// Using the EXACT proven prompt from Claude.ai that extracts correctly
const PASS1_SYSTEM = `You are an expert at reading and extracting data from Japanese vehicle auction sheets (USS, TAA, JU, HAA, etc.).`;

const PASS1_PROMPT = `Given an image of a Japanese car auction sheet, extract ALL available data and return it as a structured JSON object.

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
2. Extract odometer carefully — note whether km or miles (マイル).
3. Auction grades: 6 (best) → 1 (worst). R/RA = repaired/accident history.
4. Interior grades: A (best) → E (worst).
5. For damage diagram, map codes to plain English locations.
6. Return ONLY valid JSON. No markdown, no explanation.
7. If a field is unreadable or not present, use null.`;

const VERIFY_MILEAGE = `What is the exact mileage (走行) shown on this Japanese auction sheet? Read the digit boxes carefully. Return JSON: {"mileageKm": <number>, "confidence": <0.0-1.0>}`;

const VERIFY_YEAR = `What year was this vehicle first registered? Read the 年式 or 初度登録年月 field. Convert Japanese era: H(平成)+1988, R(令和)+2018. Example: H24=2012. Return JSON: {"era": "<e.g. H24>", "western_year": <number>, "confidence": <0.0-1.0>}`;

const VERIFY_COLOR = `What is the exterior color (外色) and color code number (カラーNo.) on this auction sheet? Return JSON: {"japanese_text": "<exact Japanese text>", "color_english": "<English>", "color_code": "<3-digit number or null>", "confidence": <0.0-1.0>}`;

// ═══════════════════════════════════════════
// MAJORITY VOTE HELPER
// ═══════════════════════════════════════════
function majorityVote(readings) {
  const valid = readings.filter(r => r != null);
  if (!valid.length) return null;
  const counts = {};
  for (const v of valid) { const k = String(v); counts[k] = (counts[k] || 0) + 1; }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { value: valid.find(v => String(v) === sorted[0][0]), votes: sorted[0][1], total: valid.length };
}

// ═══════════════════════════════════════════
// RUN PIPELINE
// ═══════════════════════════════════════════
async function main() {
  const imagePath = process.argv[2] || "auc.jpeg";
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  EXPERT AUCTION SHEET ANALYZER v2 — Majority Vote Pipeline`);
  console.log(`  Image: ${imagePath}`);
  console.log(`  Model: ${MODEL}`);
  console.log(`${"═".repeat(64)}\n`);

  const imageBuffer = readFileSync(resolve(".", imagePath));
  const base64 = imageBuffer.toString("base64");
  const image = { data: base64, mediaType: "image/jpeg" };
  const startTime = Date.now();

  // ── PASS 1: Full extraction ──
  console.log("▶ PASS 1: Full comprehensive extraction...");
  const t1 = Date.now();
  const pass1 = await callClaudeVision({ prompt: PASS1_PROMPT, images: [image], system: PASS1_SYSTEM, maxTokens: 6144 });
  console.log(`  ✓ Complete (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  console.log(`  → Mileage: ${pass1?.mileage_reading}, Color: ${pass1?.exterior_color}, Year: ${pass1?.year}\n`);

  if (!pass1 || typeof pass1 !== "object") { console.error("✗ Pass 1 failed"); process.exit(1); }

  // Normalize clean schema to flat fields for cross-validation
  const reg = pass1.registration || {};
  const cond = pass1.condition || {};
  const vb = pass1.vehicle_basic || {};
  if (cond.odometer_km) pass1.mileage_reading = parseInt(String(cond.odometer_km).replace(/,/g, ""));
  if (reg.first_registration_year) pass1.year = parseInt(reg.first_registration_year);
  if (cond.exterior_color) pass1.exterior_color = cond.exterior_color;
  if (cond.color_code) pass1.color_code = cond.color_code;
  if (vb.make) pass1.make = vb.make;
  if (reg.chassis_number) pass1.vin = reg.chassis_number;
  if (cond.auction_grade) pass1.overall_grade = parseFloat(cond.auction_grade) || cond.auction_grade;
  if (cond.interior_grade) pass1.interior_grade = cond.interior_grade;
  pass1.year_calculation = pass1.year_calculation || `Year: ${reg.first_registration_year}`;

  // ── PASS 2: 5 parallel verification calls (2x mileage, 1x year, 2x color) ──
  console.log("▶ PASS 2: Verification — 2x mileage + 1x year + 2x color (parallel)...");
  const t2 = Date.now();
  const SYS = "Read the auction sheet carefully and answer the question.";
  const [mA, mB, yV, cA, cB] = await Promise.allSettled([
    callClaudeVision({ prompt: VERIFY_MILEAGE, images: [image], system: SYS, maxTokens: 1024 }),
    callClaudeVision({ prompt: "Read the mileage number (走行) from this auction sheet. What number is shown in the digit boxes? Return JSON: {\"mileageKm\": <number>}", images: [image], system: SYS, maxTokens: 1024 }),
    callClaudeVision({ prompt: VERIFY_YEAR, images: [image], system: SYS, maxTokens: 1024 }),
    callClaudeVision({ prompt: VERIFY_COLOR, images: [image], system: SYS, maxTokens: 1024 }),
    callClaudeVision({ prompt: "What color (外色) is this vehicle? Also read the color code number (カラーNo.). Return JSON: {\"color_english\": \"<color>\", \"color_code\": \"<3-digit code>\"}", images: [image], system: SYS, maxTokens: 1024 }),
  ]);
  console.log(`  ✓ Complete (${((Date.now() - t2) / 1000).toFixed(1)}s)\n`);

  const p2mA = mA.status === "fulfilled" ? mA.value : null;
  const p2mB = mB.status === "fulfilled" ? mB.value : null;
  const p2y = yV.status === "fulfilled" ? yV.value : null;
  const p2cA = cA.status === "fulfilled" ? cA.value : null;
  const p2cB = cB.status === "fulfilled" ? cB.value : null;

  // ── CROSS-VALIDATION WITH MAJORITY VOTE ──
  console.log("▶ CROSS-VALIDATION (majority vote)...\n");
  const anomalies = [];

  // ─── MILEAGE: 3 readings → majority vote ───
  const mileageReadings = [pass1.mileage_reading, p2mA?.mileageKm, p2mB?.mileageKm];
  console.log(`  MILEAGE readings: ${mileageReadings.map(r => r ?? "null").join(" | ")}`);
  if (p2mA) console.log(`    Read A: ${p2mA.mileageKm} km (conf: ${p2mA.confidence || "?"})`);
  if (p2mB) console.log(`    Read B: ${p2mB.mileageKm} km (conf: ${p2mB.confidence || "?"})`);


  const mVote = majorityVote(mileageReadings);
  if (mVote) {
    const allAgree = mVote.votes === mVote.total;
    console.log(`  → MILEAGE WINNER: ${mVote.value} km (${mVote.votes}/${mVote.total} agree) ${allAgree ? "✓ UNANIMOUS" : "⚠ MAJORITY"}`);
    pass1.mileage_reading = mVote.value;
  }

  // ─── YEAR with PLAUSIBILITY GUARD ───
  console.log(`\n  YEAR: Pass1=${pass1.year} (${pass1.year_calculation}), Verify=${p2y?.western_year} (${p2y?.calculation})`);
  if (p2y?.western_year && p2y.western_year !== pass1.year) {
    const p1Ok = pass1.year >= 2000 && pass1.year <= new Date().getFullYear() + 1;
    const p2Ok = p2y.western_year >= 2000 && p2y.western_year <= new Date().getFullYear() + 1;
    if (p1Ok && !p2Ok) {
      console.log(`  → YEAR KEPT: ${pass1.year} (verification ${p2y.western_year} implausible for modern vehicle)`);
    } else if (!p1Ok && p2Ok) {
      console.log(`  → YEAR CORRECTED: ${pass1.year} → ${p2y.western_year}`);
      pass1.year = p2y.western_year;
    } else {
      console.log(`  → YEAR CONFLICT: Pass1=${pass1.year} vs Verify=${p2y.western_year} — keeping Pass1 (has calculation)`);
    }
  } else {
    console.log(`  → YEAR CONFIRMED: ${pass1.year}`);
  }

  // ─── COLOR: CODE LOOKUP (authoritative) + majority vote fallback ───
  const MERCEDES_COLORS = {
    "040": "Black", "149": "Polar White", "183": "Magnetite Black Metallic",
    "191": "Diamond White Metallic", "197": "Obsidian Black Metallic",
    "489": "Selenite Grey Metallic", "775": "Iridium Silver Metallic",
    "890": "Cavansite Blue Metallic", "891": "Cavansite Blue Metallic",
    "992": "Selenite Grey Metallic",
  };

  const colorReadings = [pass1.exterior_color, p2cA?.color_english, p2cB?.color_english];
  const colorCode = p2cA?.color_code || p2cB?.color_code || pass1.color_code;
  console.log(`\n  COLOR readings: ${colorReadings.map(r => r ?? "null").join(" | ")}`);
  console.log(`  COLOR CODE: ${colorCode}`);
  if (p2cA?.japanese_text) console.log(`    Read A: ${p2cA.japanese_text} = ${p2cA.color_english}`);
  if (p2cB?.japanese_text) console.log(`    Read B: ${p2cB?.japanese_text || "?"} = ${p2cB.color_english}`);

  // Check manufacturer code database FIRST
  const codeLookup = /mercedes|benz/i.test(pass1.make) && colorCode ? MERCEDES_COLORS[String(colorCode)] : null;

  if (codeLookup) {
    console.log(`  → COLOR CODE LOOKUP: ${colorCode} = "${codeLookup}" (AUTHORITATIVE — manufacturer database)`);
    pass1.exterior_color = codeLookup;
    pass1.color_code = colorCode;
  } else {
    const norm = c => c?.toLowerCase().replace(/[\s\-_]/g, "") || "";
    const colorGroups = {};
    for (const c of colorReadings.filter(Boolean)) {
      const n = norm(c);
      if (!colorGroups[n]) colorGroups[n] = { original: c, count: 0 };
      colorGroups[n].count++;
    }
    const colorWinner = Object.values(colorGroups).sort((a, b) => b.count - a.count)[0];
    if (colorWinner) {
      console.log(`  → COLOR MAJORITY: "${colorWinner.original}" (${colorWinner.count}/${colorReadings.filter(Boolean).length})`);
      pass1.exterior_color = colorWinner.original;
    }
    pass1.color_code = colorCode;
  }

  // ─── VIN ───
  if (pass1.vin && /mercedes|benz/i.test(pass1.make || "")) {
    const vin = pass1.vin.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
    console.log(`\n  VIN: ${vin} (length: ${vin.length})`);
    if (vin.length === 17 && /^WD[BCDF]/.test(vin)) {
      console.log(`  → VIN VALID: Mercedes pattern confirmed (${vin.substring(0,3)})`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  Pipeline v2 complete: ${totalTime}s | Model: ${MODEL}`);
  console.log(`${"─".repeat(64)}\n`);

  // ── EXPECTED vs ACTUAL comparison ──
  const expected = {
    mileage: 85483,
    color: "Cavansite Blue",
    color_code: "890",
    vin: "WDD2314731F005822",
    grade: 4,
    interior_grade: "B",
  };

  console.log("══ ACCURACY CHECK (vs ground truth) ══");
  const check = (label, actual, exp) => {
    const match = String(actual).toLowerCase() === String(exp).toLowerCase();
    console.log(`  ${match ? "✓" : "✗"} ${label}: ${actual} ${match ? "" : `(expected: ${exp})`}`);
    return match;
  };
  let correct = 0, total = 0;
  if (check("Mileage", pass1.mileage_reading, expected.mileage)) correct++; total++;
  if (check("Color", pass1.exterior_color, expected.color)) correct++; total++;
  if (check("Color Code", pass1.color_code, expected.color_code)) correct++; total++;
  if (check("VIN", pass1.vin, expected.vin)) correct++; total++;
  if (check("Grade", pass1.overall_grade, expected.grade)) correct++; total++;
  if (check("Interior", pass1.interior_grade, expected.interior_grade)) correct++; total++;

  console.log(`\n  ACCURACY: ${correct}/${total} (${((correct/total)*100).toFixed(0)}%)\n`);

  // Full output
  console.log("══ FULL EXTRACTION OUTPUT ══");
  console.log(JSON.stringify(pass1, null, 2));
}

main().catch(e => { console.error("Pipeline error:", e); process.exit(1); });
