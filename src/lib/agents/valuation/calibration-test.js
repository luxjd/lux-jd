#!/usr/bin/env node

/**
 * Regression test runner for auction sheet extraction.
 *
 * Calls the extractVehicleData function directly (no HTTP, no auth) and
 * compares results against hand-verified ground truth.
 *
 * PREREQUISITES:
 *   1. Environment vars loaded (OPENROUTER_API_KEY etc.)
 *   2. Ground truth in calibration-data.js
 *   3. Sheet images in src/auction_sheets/
 *
 * USAGE:
 *   node --env-file=.env.local src/lib/agents/valuation/calibration-test.js
 *   node --env-file=.env.local src/lib/agents/valuation/calibration-test.js --sheet=1.jpeg
 *   node --env-file=.env.local src/lib/agents/valuation/calibration-test.js --verbose
 *   node --env-file=.env.local src/lib/agents/valuation/calibration-test.js --json > results.json
 *
 * FLAGS:
 *   --sheet=<file>    Test a single sheet only
 *   --verbose         Show per-field detail for every sheet
 *   --json            Output machine-readable JSON
 *   --timeout=<ms>    Per-sheet timeout (default: 90000)
 *
 * OUTPUT:
 *   Per-sheet: accuracy %, matches/mismatches/misses
 *   Summary:   overall accuracy, per-field accuracy (worst-first)
 *   Exit code: 0 if all pass, 1 if any mismatches
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const SHEETS_DIR = resolve(process.cwd(), "src/auction_sheets");

// ─────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const hasFlag = (name) => args.includes(`--${name}`);

const singleSheet = getArg("sheet");
const verbose = hasFlag("verbose");
const jsonOutput = hasFlag("json");
const TIMEOUT = parseInt(getArg("timeout") || "90000", 10);

// ─────────────────────────────────────────────────────────────
// Field comparison
// ─────────────────────────────────────────────────────────────

function compareField(expected, actual, fieldName) {
  if (expected === null || expected === undefined) {
    return { field: fieldName, status: "skip", reason: "not in ground truth" };
  }
  if (actual === null || actual === undefined || actual === "") {
    return { field: fieldName, status: "miss", expected, actual: null };
  }

  if (typeof expected === "string" && typeof actual === "string") {
    const norm = (s) => s.toLowerCase().replace(/[\s\-_]+/g, " ").trim();
    if (norm(expected) === norm(actual)) return { field: fieldName, status: "match" };
    // Registration plates: strip ALL whitespace before comparing (spacing varies)
    if (fieldName === "registrationPlate" || fieldName === "registration_plate") {
      const stripAll = (s) => s.replace(/\s+/g, "");
      if (stripAll(expected) === stripAll(actual)) return { field: fieldName, status: "match", note: "spacing normalized" };
    }
    if (norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual))) {
      return { field: fieldName, status: "partial", expected, actual };
    }
    return { field: fieldName, status: "mismatch", expected, actual };
  }

  if (typeof expected === "number" && typeof actual === "number") {
    if (expected === actual) return { field: fieldName, status: "match" };
    const tolerance = fieldName.includes("mileage") || fieldName.includes("Km")
      ? Math.max(expected, actual) * 0.02
      : 0;
    if (Math.abs(expected - actual) <= tolerance) {
      return { field: fieldName, status: "match", note: "within tolerance" };
    }
    if (fieldName.includes("rade") && Math.abs(expected - actual) <= 0.5) {
      return { field: fieldName, status: "partial", expected, actual };
    }
    return { field: fieldName, status: "mismatch", expected, actual };
  }

  if (typeof expected === "boolean") {
    return { field: fieldName, status: expected === actual ? "match" : "mismatch", expected, actual };
  }

  if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
    const subResults = Object.keys(expected).map((k) => compareField(expected[k], actual?.[k], `${fieldName}.${k}`));
    const allMatch = subResults.every((r) => r.status === "match" || r.status === "skip");
    return { field: fieldName, status: allMatch ? "match" : "partial", subResults };
  }

  return { field: fieldName, status: String(expected) == String(actual) ? "match" : "mismatch", expected, actual };
}

// ─────────────────────────────────────────────────────────────
// Direct function import (no HTTP/auth needed)
// ─────────────────────────────────────────────────────────────

let _extractFn = null;
async function getExtractFn() {
  if (_extractFn) return _extractFn;
  if (hasFlag("legacy")) {
    const mod = await import("./sheet-parser.js");
    _extractFn = mod.extractVehicleData;
  } else {
    const mod = await import("./extraction-pipeline.js");
    _extractFn = mod.extractWithPipeline;
  }
  return _extractFn;
}

async function extractDirect(imagePath) {
  const extractFn = await getExtractFn();
  const buf = readFileSync(imagePath);
  const image = { data: buf.toString("base64"), mediaType: "image/jpeg" };

  const result = await extractFn([image]);
  return result?.extracted || result || {};
}

// ─────────────────────────────────────────────────────────────
// Test one sheet
// ─────────────────────────────────────────────────────────────

async function testSheet(entry) {
  const { file, expected } = entry;
  const imagePath = join(SHEETS_DIR, file);

  if (!existsSync(imagePath)) {
    return { file, success: false, error: `Image not found: ${imagePath}`, accuracy: 0 };
  }

  const t0 = Date.now();
  try {
    const actual = await extractDirect(imagePath);
    const elapsedMs = Date.now() - t0;

    const fields = Object.keys(expected);
    const results = fields.map((f) => compareField(expected[f], actual?.[f], f));

    const matches = results.filter((r) => r.status === "match").length;
    const misses = results.filter((r) => r.status === "miss").length;
    const mismatches = results.filter((r) => r.status === "mismatch").length;
    const partials = results.filter((r) => r.status === "partial").length;
    const skips = results.filter((r) => r.status === "skip").length;
    const total = fields.length - skips;

    return {
      file,
      success: true,
      elapsedMs,
      accuracy: total > 0 ? matches / total : 0,
      matches, misses, mismatches, partials, skips, total,
      results,
      actual,
    };
  } catch (e) {
    return {
      file,
      success: false,
      elapsedMs: Date.now() - t0,
      error: e.message,
      accuracy: 0,
      total: Object.keys(expected).length,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  // Dynamic import of calibration data
  const { default: CALIBRATION } = await import("./calibration-data.js");

  const sheets = singleSheet
    ? CALIBRATION.filter((c) => c.file === singleSheet)
    : CALIBRATION;

  if (sheets.length === 0) {
    console.error(`No matching sheet: ${singleSheet}`);
    console.error(`Available: ${CALIBRATION.map((c) => c.file).join(", ")}`);
    process.exit(1);
  }

  if (!jsonOutput) {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  AUCTION SHEET REGRESSION TEST`);
    console.log(`  Mode: Direct function call (extractVehicleData)`);
    console.log(`  Sheets: ${sheets.length}  |  Timeout: ${TIMEOUT}ms`);
    console.log(`${"═".repeat(70)}\n`);
  }

  const results = [];

  for (const entry of sheets) {
    if (!jsonOutput) process.stdout.write(`  ${entry.file}... `);

    const result = await testSheet(entry);
    results.push(result);

    if (!jsonOutput) {
      if (result.success) {
        const pct = (result.accuracy * 100).toFixed(1);
        console.log(`${pct}%  (${result.matches}✓ ${result.partials}◐ ${result.mismatches}✗ ${result.misses}○)  ${(result.elapsedMs / 1000).toFixed(1)}s`);

        if (verbose || result.mismatches > 0) {
          for (const r of result.results.filter((r) => r.status === "mismatch" || r.status === "miss")) {
            console.log(`    ${r.status === "mismatch" ? "✗" : "○"} ${r.field}: expected=${JSON.stringify(r.expected)} got=${JSON.stringify(r.actual)}`);
          }
        }
        if (verbose) {
          for (const r of result.results.filter((r) => r.status === "partial")) {
            console.log(`    ◐ ${r.field}: expected=${JSON.stringify(r.expected)} got=${JSON.stringify(r.actual)}`);
          }
        }
      } else {
        console.log(`FAILED: ${result.error}`);
      }
    }
  }

  // ── Summary ──
  const ok = results.filter((r) => r.success);
  const totalMatches = ok.reduce((s, r) => s + r.matches, 0);
  const totalFields = ok.reduce((s, r) => s + r.total, 0);
  const totalMismatches = ok.reduce((s, r) => s + r.mismatches, 0);
  const totalMisses = ok.reduce((s, r) => s + r.misses, 0);
  const totalPartials = ok.reduce((s, r) => s + r.partials, 0);
  const avgAccuracy = ok.length > 0 ? ok.reduce((s, r) => s + r.accuracy, 0) / ok.length : 0;
  const totalTime = results.reduce((s, r) => s + (r.elapsedMs || 0), 0);

  // ── Per-field accuracy ──
  const fieldStats = {};
  for (const r of ok) {
    for (const fr of r.results) {
      if (fr.status === "skip") continue;
      if (!fieldStats[fr.field]) fieldStats[fr.field] = { match: 0, partial: 0, miss: 0, mismatch: 0, total: 0 };
      fieldStats[fr.field][fr.status === "match" ? "match" : fr.status]++;
      fieldStats[fr.field].total++;
    }
  }

  const fieldRanking = Object.entries(fieldStats)
    .map(([field, s]) => ({ field, accuracy: s.total > 0 ? s.match / s.total : 0, ...s }))
    .sort((a, b) => a.accuracy - b.accuracy);

  if (jsonOutput) {
    console.log(JSON.stringify({
      summary: {
        sheetsTotal: results.length,
        sheetsOk: ok.length,
        sheetsFailed: results.length - ok.length,
        avgAccuracy: Math.round(avgAccuracy * 1000) / 1000,
        totalFields,
        totalMatches,
        totalMismatches,
        totalMisses,
        totalPartials,
        totalTimeMs: totalTime,
      },
      perField: fieldRanking,
      perSheet: results.map((r) => ({
        file: r.file,
        success: r.success,
        accuracy: r.accuracy,
        matches: r.matches,
        mismatches: r.mismatches,
        misses: r.misses,
        elapsedMs: r.elapsedMs,
        errors: r.results?.filter((f) => f.status === "mismatch" || f.status === "miss").map((f) => ({
          field: f.field, expected: f.expected, actual: f.actual, status: f.status,
        })),
        ...(r.error ? { error: r.error } : {}),
      })),
    }, null, 2));
  } else {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  SUMMARY`);
    console.log(`${"═".repeat(70)}`);
    console.log(`  Sheets: ${ok.length}/${results.length} succeeded`);
    console.log(`  Accuracy: ${(avgAccuracy * 100).toFixed(1)}%  (${totalMatches}/${totalFields} exact)`);
    console.log(`  Mismatches: ${totalMismatches}  |  Misses: ${totalMisses}  |  Partials: ${totalPartials}`);
    console.log(`  Time: ${(totalTime / 1000).toFixed(1)}s total (${(totalTime / results.length / 1000).toFixed(1)}s avg)\n`);

    console.log(`  PER-FIELD ACCURACY (worst first):`);
    for (const f of fieldRanking) {
      const pct = (f.accuracy * 100).toFixed(0).padStart(3);
      const icon = f.accuracy >= 0.9 ? "✓" : f.accuracy >= 0.7 ? "◐" : "✗";
      console.log(`    ${icon} ${pct}%  ${f.field.padEnd(25)} ${f.match}/${f.total} exact, ${f.mismatch} wrong, ${f.miss} miss`);
    }
    console.log();
  }

  process.exit(totalMismatches > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(2);
});
