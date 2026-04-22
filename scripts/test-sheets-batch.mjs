// Batch calibration harness — runs the unified parser on every sheet in
// src/auction_sheets and scores each against the hand-verified ground
// truth. Reports per-sheet and aggregate accuracy so we can measure what
// "training on our sheets" (= iterative tuning against this set) actually
// buys us.
//
// Usage:
//   npx tsx --tsconfig tsconfig.tsx.json scripts/test-sheets-batch.mjs
//   SHEET_PREPROCESS=1 SHEET_ENSEMBLE=1 SHEET_MILEAGE_ZONE=1 npx tsx ...

import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, extname } from "node:path";

try {
  for (const line of readFileSync(resolve(".", ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* optional */ }

const { extractVehicleData } = await import("../src/lib/agents/valuation/sheet-parser.js");

const SHEETS_DIR = resolve("src/auction_sheets");
const GT_PATH = resolve("tests/fixtures/auction_sheets_ground_truth.json");
const groundTruth = JSON.parse(readFileSync(GT_PATH, "utf8"));

// ─────────────────────────────────────────────────────────────
// Scoring rules — one entry per field we want to measure.
//  - `path`: where to look in the extracted object
//  - `type`: exact | contains | approx | substring-of-expected
//  - `weight`: 1.0 for load-bearing (drives verdict), 0.5 for identity
// ─────────────────────────────────────────────────────────────
const CHECKS = [
  { key: "auction_house", path: "auctionHouse", type: "exact", weight: 0.5 },
  { key: "lot_number",    path: "lotNumber",    type: "exact", weight: 0.5 },
  { key: "make",          path: "make",         type: "exact", weight: 1.0 },
  { key: "model",         path: "model",        type: "exact", weight: 1.0, fallbackGtKey: "model_contains", fallbackType: "contains" },
  { key: "model_code",    path: "modelCode",    type: "exact", weight: 1.0 },
  { key: "year",          path: "year",         type: "exact", weight: 1.0 },
  { key: "year_era",      path: "yearEra",      type: "exact", weight: 0.5 },
  { key: "mileage_km",    path: "mileageKm",    type: "approx", weight: 1.0, gtKey: "mileage_km_approx", tolKey: "mileage_tolerance", defaultTol: 0.05 },
  { key: "displacement",  path: "displacement", type: "exact", weight: 0.5, gtKey: "displacement_cc" },
  { key: "transmission",  path: "transmission", type: "exact", weight: 1.0 },
  { key: "fuel_type",     path: "fuelType",     type: "exact", weight: 0.5 },
  { key: "drive_side",    path: "driveSide",    type: "exact", weight: 1.0 },
  { key: "overall_grade", path: "auctionGrade", type: "exact", weight: 1.0 },
  { key: "interior_grade",path: "interiorGrade",type: "exact", weight: 0.5 },
  { key: "accident_history", path: "accidentHistory", type: "exact-bool", weight: 1.0 },
  { key: "vin",           path: "vin",          type: "exact", weight: 1.0 },
  { key: "import_type",   path: "importType",   type: "contains", weight: 0.5 },
  { key: "recycling_deposit", path: "recyclingDepositJpy", type: "approx", weight: 0.25,
    gtKey: "recycling_deposit_jpy_approx", defaultTol: 0.01 },
  { key: "registration_plate", path: "registrationPlate", type: "contains", weight: 0.25,
    fallbackGtKey: "registration_plate_contains" },
];

function getExtracted(extracted, path) {
  return extracted?.[path];
}

function scoreField(check, extracted, gt) {
  const actual = getExtracted(extracted, check.path);
  const expected = gt[check.gtKey || check.key];
  const containsExpected = check.fallbackGtKey ? gt[check.fallbackGtKey] : null;

  if (actual == null || actual === "") {
    return { pass: false, reason: "missing", weight: check.weight, expected: expected ?? containsExpected, actual: null };
  }

  if (check.type === "exact") {
    if (expected == null && containsExpected == null) return { pass: true, reason: "no-gt", weight: 0, expected: null, actual };
    if (expected != null && String(actual).trim() === String(expected).trim()) {
      return { pass: true, reason: "exact", weight: check.weight, expected, actual };
    }
    // Fallback to contains if defined
    if (containsExpected && String(actual).toLowerCase().includes(String(containsExpected).toLowerCase())) {
      return { pass: true, reason: `contains:${containsExpected}`, weight: check.weight, expected: containsExpected, actual };
    }
    return { pass: false, reason: "mismatch", weight: check.weight, expected: expected ?? containsExpected, actual };
  }

  if (check.type === "contains") {
    const target = containsExpected || expected;
    if (target == null) return { pass: true, reason: "no-gt", weight: 0, expected: null, actual };
    const ok = String(actual).toLowerCase().includes(String(target).toLowerCase());
    return { pass: ok, reason: ok ? "contains" : "no-match", weight: check.weight, expected: target, actual };
  }

  if (check.type === "approx") {
    if (expected == null) return { pass: true, reason: "no-gt", weight: 0, expected: null, actual };
    const tol = gt[check.tolKey] ?? check.defaultTol ?? 0.05;
    const diff = Math.abs(Number(actual) - Number(expected));
    const pct = Number(expected) === 0 ? 0 : (diff / Math.abs(Number(expected)));
    return {
      pass: pct <= tol,
      reason: pct <= tol ? `±${(pct * 100).toFixed(1)}%` : `off ${(pct * 100).toFixed(1)}%`,
      weight: check.weight, expected, actual,
    };
  }

  if (check.type === "exact-bool") {
    if (expected == null) return { pass: true, reason: "no-gt", weight: 0, expected: null, actual };
    const ok = Boolean(actual) === Boolean(expected);
    return { pass: ok, reason: ok ? "exact" : "mismatch", weight: check.weight, expected, actual };
  }

  return { pass: false, reason: "unknown-check", weight: 0, expected, actual };
}

function scoreSheet(extracted, gt) {
  const results = CHECKS.map((c) => ({ check: c, ...scoreField(c, extracted, gt) }));
  const applicable = results.filter((r) => r.weight > 0);
  const totalWeight = applicable.reduce((s, r) => s + r.weight, 0);
  const passedWeight = applicable.filter((r) => r.pass).reduce((s, r) => s + r.weight, 0);
  return {
    results,
    applicable,
    pass: applicable.filter((r) => r.pass).length,
    fail: applicable.filter((r) => !r.pass).length,
    total: applicable.length,
    weightedPct: totalWeight === 0 ? 0 : (passedWeight / totalWeight) * 100,
  };
}

// ─────────────────────────────────────────────────────────────

const sheetFiles = readdirSync(SHEETS_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
console.error(`→ Running ${sheetFiles.length} sheets through extractVehicleData\n`);
console.error(`  Flags: SHEET_PREPROCESS=${process.env.SHEET_PREPROCESS || "0"} SHEET_ENSEMBLE=${process.env.SHEET_ENSEMBLE || "0"} SHEET_MILEAGE_ZONE=${process.env.SHEET_MILEAGE_ZONE || "0"}`);
console.error();

const sheetResults = [];

for (const file of sheetFiles) {
  const path = join(SHEETS_DIR, file);
  const buf = readFileSync(path);
  const ext = extname(file).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : "image/jpeg";
  const image = { data: buf.toString("base64"), mediaType };

  console.error(`→ ${file} (${(buf.length / 1024).toFixed(0)} KB)...`);
  const t0 = Date.now();
  let extracted, error;
  try {
    const r = await extractVehicleData([image]);
    extracted = r.extracted || {};
  } catch (e) {
    error = e.message;
    extracted = {};
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const gt = groundTruth[file] || {};
  const score = scoreSheet(extracted, gt);

  sheetResults.push({ file, elapsed, gt, extracted, score, error });

  console.error(`   ${score.pass}/${score.total} fields correct (${score.weightedPct.toFixed(1)}% weighted) in ${elapsed}s${error ? `  ✗ error: ${error}` : ""}`);
}

// ─────────────────────────────────────────────────────────────
// Full report
// ─────────────────────────────────────────────────────────────

console.log();
console.log("═".repeat(100));
console.log("  BATCH RESULTS  — per-sheet detail");
console.log("═".repeat(100));

for (const r of sheetResults) {
  console.log();
  console.log("─".repeat(100));
  console.log(`  ${r.file} — ${r.gt.description || "?"}`);
  console.log(`  ${r.score.pass}/${r.score.total} fields, ${r.score.weightedPct.toFixed(1)}% weighted  (${r.elapsed}s)`);
  console.log("─".repeat(100));

  for (const res of r.score.results) {
    if (res.weight === 0) continue;
    const mark = res.pass ? "✓" : "✗";
    const exp = res.expected != null ? String(res.expected) : "—";
    const act = res.actual != null ? String(res.actual) : "—";
    const line = `  ${mark} ${res.check.key.padEnd(20)} expected=${exp.padEnd(22).slice(0, 22)} got=${act.padEnd(22).slice(0, 22)} ${res.reason}`;
    console.log(line);
  }
}

// Aggregate
const totalPass = sheetResults.reduce((s, r) => s + r.score.pass, 0);
const totalFields = sheetResults.reduce((s, r) => s + r.score.total, 0);
const avgWeighted = sheetResults.reduce((s, r) => s + r.score.weightedPct, 0) / sheetResults.length;

console.log();
console.log("═".repeat(100));
console.log(`  AGGREGATE  — ${sheetResults.length} sheets`);
console.log("═".repeat(100));
console.log(`  Fields correct:          ${totalPass} / ${totalFields}  (${((totalPass / totalFields) * 100).toFixed(1)}%)`);
console.log(`  Average weighted score:  ${avgWeighted.toFixed(1)}%`);
console.log();

// Per-field failure breakdown — which fields fail most often across all sheets.
const fieldFailures = {};
for (const r of sheetResults) {
  for (const res of r.score.results) {
    if (res.weight > 0 && !res.pass) {
      fieldFailures[res.check.key] = (fieldFailures[res.check.key] || 0) + 1;
    }
  }
}
const sortedFailures = Object.entries(fieldFailures).sort((a, b) => b[1] - a[1]);
if (sortedFailures.length) {
  console.log("  Fields that failed most often (systematic issues to target):");
  for (const [field, count] of sortedFailures) {
    console.log(`    ${field.padEnd(20)} failed ${count}/${sheetResults.length} sheets`);
  }
}
console.log("═".repeat(100));

// JSON dump for follow-up
const dumpPath = resolve("tests/fixtures/batch-run-latest.json");
const { writeFileSync } = await import("node:fs");
writeFileSync(dumpPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  flags: {
    preprocess: process.env.SHEET_PREPROCESS === "1",
    ensemble: process.env.SHEET_ENSEMBLE === "1",
    mileageZone: process.env.SHEET_MILEAGE_ZONE === "1",
  },
  sheets: sheetResults,
  aggregate: { totalPass, totalFields, avgWeighted },
}, null, 2));
console.log(`\n  Detail dumped to ${dumpPath}`);
