#!/usr/bin/env node
/**
 * Spec §2.2.2 — Valuation Agent CLI.
 *
 *   npm run valuate -- --make Ferrari --model "488 GTB" --year 2017 \
 *     --mileage 18000 --drive-side LHD --price-jpy 16500000 \
 *     --color-ext "Rosso Corsa" --color-int Nero \
 *     --photos ./photos --auction-sheet ./sheet.jpg \
 *     --output ./valuation_report.json
 *
 * Pass --guidance-mode without --price-jpy to get a max-bid ceiling only.
 * Pass --snake-case to emit the report in spec-compliant snake_case shape.
 *
 * This script runs via `tsx` so the @/ path aliases used internally by
 * the valuation engine resolve against jsconfig.json automatically.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

// Load .env.local before we touch any module that reads env vars.
try {
  const envPath = resolve(process.cwd(), ".env.local");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...vals] = line.split("=");
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  }
} catch {
  // .env.local optional — the user may have already exported vars.
}

const { generateRealValuation } = await import("../src/lib/agents/valuation/real-engine.js");
const { deepSnakeCase } = await import("../src/lib/agents/valuation/snake-case.js");

// ─────────────────────────────────────────────────────────────
// Argument parsing (no external dep — zero-config CLI).
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        i++;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function loadImageAsBase64(path) {
  const buf = readFileSync(path);
  const ext = extname(path).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
  return { data: buf.toString("base64"), mediaType };
}

function loadImagesFromPathArg(arg) {
  if (!arg) return [];
  const p = resolve(arg);
  const st = statSync(p);
  if (st.isDirectory()) {
    return readdirSync(p)
      .filter((name) => IMG_EXT.has(extname(name).toLowerCase()))
      .sort()
      .map((name) => loadImageAsBase64(join(p, name)));
  }
  return [loadImageAsBase64(p)];
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`Valuation Agent CLI (spec §2.2.2)

Required:
  --make <brand>              Ferrari, Mercedes-AMG, Porsche, ...
  --model <name>              e.g. "488 GTB"
  --year <int>                Model year (1990-current)
  --mileage <km>              Odometer reading in kilometers
  --drive-side <LHD|RHD>
  --color-ext <text>          Exterior color
  --price-jpy <int>           Asking price (or use --guidance-mode)

Optional:
  --color-int <text>          Interior color
  --transmission <enum>       MANUAL, AUTOMATIC, DCT, PDK, SMG
  --fuel-type <enum>          PETROL, DIESEL, HYBRID, ELECTRIC
  --service-history <enum>    FULL_DEALER, PARTIAL_DEALER, INDEPENDENT, UNKNOWN
  --accident                  Flag documented accident history
  --auction-grade <float>     1.0-6.0 or 6.5 for S grade
  --spec-notes <text>         Free-text options/features
  --photos <dir|file>         Folder of vehicle photos, or single image file
  --auction-sheet <file>      Japanese auction sheet image
  --additional-docs <dir>     Service booklet / CoC / build sheet images
  --guidance-mode             Derive max-bid ceiling (no --price-jpy)

Output:
  --output <file>             Write JSON report here (default: stdout)
  --snake-case                Emit report in spec-compliant snake_case
  --help                      Show this help
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const required = [
  ["make", "--make"],
  ["model", "--model"],
  ["year", "--year"],
  ["mileage", "--mileage"],
  ["drive-side", "--drive-side"],
  ["color-ext", "--color-ext"],
];

const missing = required.filter(([key]) => !args[key]).map(([, flag]) => flag);
if (missing.length) {
  console.error(`Missing required flag(s): ${missing.join(", ")}\n`);
  printHelp();
  process.exit(2);
}

if (!args["price-jpy"] && !args["guidance-mode"]) {
  console.error("Missing --price-jpy. Pass --guidance-mode to derive a max-bid ceiling instead.\n");
  process.exit(2);
}

const input = {
  make: String(args.make),
  model: String(args.model),
  year: parseInt(args.year, 10),
  mileageKm: parseInt(args.mileage, 10),
  driveSide: String(args["drive-side"]).toUpperCase(),
  askingPriceJpy: args["price-jpy"] ? parseInt(args["price-jpy"], 10) : null,
  exteriorColor: String(args["color-ext"]),
  interiorColor: args["color-int"] ? String(args["color-int"]) : "",
  transmission: args.transmission ? String(args.transmission).toUpperCase() : "",
  fuelType: args["fuel-type"] ? String(args["fuel-type"]).toUpperCase() : "",
  serviceHistory: args["service-history"] ? String(args["service-history"]).toUpperCase() : "UNKNOWN",
  accidentHistory: !!args.accident,
  auctionGrade: args["auction-grade"] ? parseFloat(args["auction-grade"]) : null,
  specificationNotes: args["spec-notes"] ? String(args["spec-notes"]) : "",
  guidanceMode: !!args["guidance-mode"] || !args["price-jpy"],
  images: loadImagesFromPathArg(args.photos).length ? loadImagesFromPathArg(args.photos) : null,
  auctionSheetImage: args["auction-sheet"] ? loadImageAsBase64(resolve(String(args["auction-sheet"]))) : null,
  additionalDocImages: args["additional-docs"] ? loadImagesFromPathArg(args["additional-docs"]) : null,
};

console.error(`→ Running valuation for ${input.make} ${input.model} (${input.year}) ...`);
const startedAt = Date.now();

try {
  const report = await generateRealValuation(input);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.error(`→ Completed in ${elapsed}s. Verdict: ${report.recommendation?.verdict ?? "n/a"}`);

  const output = args["snake-case"]
    ? { valuation_id: report.valuationId, status: "completed", report: deepSnakeCase(report) }
    : report;
  const json = JSON.stringify(output, null, 2);
  if (args.output) {
    writeFileSync(resolve(String(args.output)), json, "utf8");
    console.error(`→ Wrote report to ${args.output}`);
  } else {
    process.stdout.write(json + "\n");
  }
  process.exit(0);
} catch (err) {
  console.error(`✗ Valuation failed: ${err.message}`);
  if (err.code) console.error(`  code: ${err.code}`);
  process.exit(1);
}
