# Auction Sheet Regression Test Suite

## Quick Start

```bash
# 1. Start dev server
npm run dev

# 2. Run all 13 sheets
node src/lib/agents/valuation/calibration-test.js

# 3. Run a single sheet
node src/lib/agents/valuation/calibration-test.js --sheet=1.jpeg

# 4. Verbose output (shows every field)
node src/lib/agents/valuation/calibration-test.js --verbose

# 5. Machine-readable output
node src/lib/agents/valuation/calibration-test.js --json > results.json
```

## Adding New Sheets

1. Drop the sheet image (JPEG) into `src/auction_sheets/`
2. Open `src/lib/agents/valuation/calibration-data.js`
3. Add a new entry to the `CALIBRATION` array:

```js
{
  file: "new-sheet.jpeg",
  expected: {
    auctionHouse: "USS",        // or null if not visible
    lotNumber: "12345",
    make: "Porsche",
    model: "911",
    grade: "Carrera T",
    // ... fill in every field you can read from the sheet
    // null = field is not on the sheet
    // Use RAW values — do NOT convert units
  },
},
```

4. Run the test: `node src/lib/agents/valuation/calibration-test.js --sheet=new-sheet.jpeg`

## Ground Truth Rules

- **Only include values explicitly visible on the sheet** — never inferred
- **Mileage**: raw digit reading. If sheet shows miles, use the raw number and set `mileageUnit: "miles"`
- **Body type**: use the printed code (`"3D"`, `"OP"`, `"CP"`), not English interpretation
- **Make**: read from 車名 field only. `メルセデスAMG` = "Mercedes-AMG", `メルセデスベンツ` = "Mercedes-Benz"
- **Year**: converted from Japanese era (this is math, not inference)
- **null**: field is genuinely not on the sheet

## Reading the Accuracy Report

```
  PER-FIELD ACCURACY (worst first):
    ✗  62%  vin                       8/13 exact, 3 wrong, 2 miss
    ◐  77%  grade                     10/13 exact, 2 wrong, 1 miss
    ✓  92%  mileageKm                 12/13 exact, 1 wrong, 0 miss
    ✓ 100%  make                      13/13 exact, 0 wrong, 0 miss
```

- **✓ 90%+** = field is reliable
- **◐ 70-89%** = field needs improvement
- **✗ <70%** = field is unreliable, needs pipeline fix
- **exact** = value matches ground truth
- **wrong** = value was extracted but incorrect (hallucination or misread)
- **miss** = value was on the sheet but agent returned null

## Directory Structure

```
src/auction_sheets/         ← sheet images (JPEG)
  sheet1.jpeg
  sheet2.jpeg
  1.jpeg
  ...

src/lib/agents/valuation/
  calibration-data.js       ← ground truth for each sheet
  calibration-test.js       ← test runner (this tool)
  ja-dictionary.js          ← Japanese→English reference dictionary
  README-calibration.md     ← this file
```

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--sheet=<file>` | all | Test a single sheet |
| `--verbose` | off | Show per-field results for every sheet |
| `--json` | off | Output JSON (pipe to file for CI) |
| `--base=<url>` | `http://localhost:3000` | API base URL |
| `--timeout=<ms>` | `60000` | Per-sheet timeout |
