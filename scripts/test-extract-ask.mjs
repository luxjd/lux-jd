// Test harness for the upload/extract flow specifically.
// Runs extractVehicleData on auc.jpeg and reports:
//   - fields successfully extracted on the first pass
//   - fields recovered by the focused retry
//   - fields still missing (what the user actually sees as questions)
//   - split between "Not on the sheet" vs "Couldn't read"
//
// Usage: npx tsx --tsconfig tsconfig.tsx.json scripts/test-extract-ask.mjs [path]

import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";

try {
  for (const line of readFileSync(resolve(".", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* optional */ }

const { extractVehicleData } = await import("../src/lib/agents/valuation/sheet-parser.js");

const imagePath = resolve(process.argv[2] || "auc.jpeg");
console.error(`→ Loading ${imagePath}`);
const buf = readFileSync(imagePath);
const ext = extname(imagePath).toLowerCase();
const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
const image = { data: buf.toString("base64"), mediaType };

console.error(`→ Image: ${(buf.length / 1024).toFixed(0)} KB ${mediaType}`);
console.error("→ Running extractVehicleData (which invokes the focused-retry pass)…\n");

const t0 = Date.now();
const result = await extractVehicleData([image]);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const extracted = result.extracted || {};
const extractedFields = Object.entries(extracted).filter(([, v]) => v !== null && v !== undefined && v !== "");

console.log("═".repeat(80));
console.log(`  EXTRACT → ASK TEST (elapsed ${elapsed}s)`);
console.log("═".repeat(80));
console.log();

// 1. Successfully extracted
console.log("─".repeat(80));
console.log(`  ✓ FIELDS EXTRACTED FROM SHEET (${extractedFields.length})`);
console.log("─".repeat(80));
for (const [k, v] of extractedFields) {
  const preview = typeof v === "object" ? JSON.stringify(v).slice(0, 40) + "…" : String(v).slice(0, 60);
  console.log(`    ${k.padEnd(24)} = ${preview}`);
}
console.log();

// 2. Retry audit
if (result._retryAudit) {
  const { recovered, stillMissing } = result._retryAudit;
  console.log("─".repeat(80));
  console.log(`  🔄 FOCUSED-RETRY PASS`);
  console.log("─".repeat(80));
  console.log(`    recovered: ${recovered.length}   still missing: ${stillMissing.length}`);
  if (recovered.length) {
    console.log();
    console.log("    Recovered on retry:");
    for (const r of recovered) {
      console.log(`      ${r.key.padEnd(24)} = ${JSON.stringify(r.value).slice(0, 60)}  (${r.votes}, ${(r.confidence * 100).toFixed(0)}%)`);
    }
  }
  if (stillMissing.length) {
    console.log();
    console.log("    Still missing after retry:");
    for (const s of stillMissing) {
      console.log(`      ${s.key.padEnd(24)} — ${s.reason}`);
    }
  }
  console.log();
}

// 3. What the UI will ask the user
const askedNotOnSheet = (result.missingExternal || []);
const askedCouldntRead = (result.missingSheetFields || []).filter((f) => f.origin === "sheet" || f.origin === "either");

console.log("─".repeat(80));
console.log(`  ❓ QUESTIONS THE UI WILL ASK (${askedNotOnSheet.length + askedCouldntRead.length})`);
console.log("─".repeat(80));

if (askedNotOnSheet.length === 0 && askedCouldntRead.length === 0) {
  console.log("    None — the agent extracted everything, no user input needed.");
} else {
  if (askedNotOnSheet.length) {
    console.log();
    console.log(`    [Not on auction sheet — always ask]  ${askedNotOnSheet.length} question(s):`);
    for (const f of askedNotOnSheet) {
      console.log(`      • ${f.question}`);
    }
  }
  if (askedCouldntRead.length) {
    console.log();
    console.log(`    [Couldn't read from sheet — please confirm]  ${askedCouldntRead.length} question(s):`);
    for (const f of askedCouldntRead) {
      console.log(`      • ${f.question}`);
    }
  }
}
console.log();

// 4. Headline
const totalFields = extractedFields.length + askedNotOnSheet.length + askedCouldntRead.length;
const extractedPct = ((extractedFields.length / totalFields) * 100).toFixed(0);
console.log("═".repeat(80));
console.log(`  ${extractedFields.length} / ${totalFields} fields extracted (${extractedPct}%)`);
console.log(`  ${askedCouldntRead.length} fields the agent will re-ask because extraction failed`);
console.log(`  ${askedNotOnSheet.length} fields the agent will ask because they're not on sheets`);
console.log("═".repeat(80));
