/**
 * Ground truth calibration data for the 13 auction sheets in src/auction_sheets/.
 *
 * Hand-verified by reading every field on every sheet image. Used for:
 *   1. Few-shot examples in the extraction prompt (3 representative sheets)
 *   2. Regression testing via calibration-test.js
 *   3. Post-normalization rule derivation
 *
 * Field names match the extractVehicleData output schema (camelCase).
 * null = field is genuinely not on the sheet (not "we couldn't read it").
 *
 * STRICT EXTRACTION RULES:
 * - Only values explicitly printed on the sheet are included.
 * - Inferred values (bodyType from model knowledge, drivetrain from
 *   common knowledge) are set to null unless explicitly printed.
 * - Mileage values for miles-unit sheets are RAW readings, NOT converted.
 * - make is read from 車名 field ONLY, not inferred from grade.
 */

const CALIBRATION = [
  // ──────────────────────────────────────────────────────────
  // sheet1.jpeg — Jaguar XK Convertible (USS 輸入車コーナー)
  // Typed sheet with vehicle photos, moderate complexity
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet1.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "70336",
      make: "Jaguar",
      model: "XK",
      grade: "Convertible",
      modelCode: "J435A",
      year: 2006,
      yearEra: "H18",
      displacement: 4200,
      mileageKm: 62074,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: null, // not clearly marked on this sheet
      exteriorColor: "Light Blue",
      exteriorColorJapanese: "Lブルー",
      colorCode: null,
      interiorColor: null,
      auctionGrade: 4,
      interiorGrade: "B",
      accidentHistory: false,
      serviceBookPresent: null,
      vin: "SAJKA44K47SB11063",
      registrationPlate: null,
      shakenExpiry: null,
      recyclingDepositJpy: 14550,
      seatingCapacity: null,
      dimensions: { length_mm: 4790, width_mm: 1910, height_mm: 1230 },
      bodyType: null, // not explicitly printed as a body type code
    },
  },

  // ──────────────────────────────────────────────────────────
  // sheet2.jpeg — Mercedes-AMG GT S 130th Anniversary Edition
  // (USS ワンモア輸入車コーナー) — typed with photos
  // Key test: "S 130th" grade must not be truncated to "10th"
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet2.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "78014",
      make: "Mercedes-AMG",
      model: "GT",
      grade: "S 130th Anniversary Edition",
      modelCode: "CBA-190378",
      year: 2016,
      yearEra: "H28",
      displacement: 4000,
      mileageKm: 31397,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Black",
      exteriorColorJapanese: "クロ",
      colorCode: "183",
      interiorColor: null,
      auctionGrade: 4,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: true,
      vin: "WDD1903781A009131",
      registrationPlate: null,
      shakenExpiry: null,
      recyclingDepositJpy: 16930,
      seatingCapacity: 2,
      dimensions: { length_mm: 4560, width_mm: 1940, height_mm: 1290 },
      bodyType: "3D", // sheet prints "3D" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // sheet3.jpeg — Mercedes-AMG CLS63 S 4Matic
  // (USS 輸入車プライムコーナー) — typed with photos
  // Key test: AMG make detection, CLS model vs grade split
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet3.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75449",
      make: "Mercedes-AMG",
      model: "CLS Class",
      grade: "CLS63 S 4Matic",
      modelCode: "CBA-218376",
      year: 2013,
      yearEra: "H25",
      displacement: 5500,
      mileageKm: 45796,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Gunmetal",
      exteriorColorJapanese: "ゲンシャ",
      colorCode: "032",
      interiorColor: null,
      auctionGrade: 4.5,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD2183761A109221",
      registrationPlate: "横浜 306 て 1903",
      shakenExpiry: "2026-12",
      recyclingDepositJpy: 21340,
      seatingCapacity: 4,
      dimensions: { length_mm: 4990, width_mm: 1880, height_mm: 1290 },
      bodyType: "4D", // sheet prints "4D" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // sheet4.jpeg — Mercedes-AMG GT S 130th Anniversary Edition
  // (USS 輸入車プライムコーナー) — clean typed sheet
  // Key test: 130th grade, interior two-tone Black/White
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet4.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75743",
      make: "Mercedes-AMG",
      model: "GT",
      grade: "S 130th Anniversary Edition",
      modelCode: "CBA-190378",
      year: 2017,
      yearEra: "H29",
      displacement: 4000,
      mileageKm: 9816,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Pearl",
      exteriorColorJapanese: "パール",
      colorCode: "799",
      interiorColor: "Black/White",
      auctionGrade: 5,
      interiorGrade: "A",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD1903781A009275",
      registrationPlate: "杉並 300 た 8546",
      shakenExpiry: "2026-05",
      recyclingDepositJpy: 16930,
      seatingCapacity: 2,
      dimensions: { length_mm: 4560, width_mm: 1940, height_mm: 1290 },
      bodyType: "3D", // sheet prints "3D" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // sheet5.jpeg — Mercedes-AMG C63 S Cabriolet
  // (USS 輸入車プライムコーナー) — typed
  // Key test: color changed (レッド→クロ), Reiwa era (R3=2021)
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet5.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75482",
      make: "Mercedes-AMG",
      model: "C Class",
      grade: "C63 S Cabriolet",
      modelCode: "CBA-205487",
      year: 2021,
      yearEra: "R3",
      displacement: 4000,
      mileageKm: 16510,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Red",
      exteriorColorJapanese: "レッド",
      colorCode: "996",
      colorChanged: true,
      interiorColor: "Black",
      auctionGrade: 5,
      interiorGrade: "A",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD2054871F833473",
      registrationPlate: "品川 366 み 30",
      shakenExpiry: "2028-02",
      recyclingDepositJpy: 23190,
      seatingCapacity: 4,
      dimensions: { length_mm: 4750, width_mm: 1870, height_mm: 1410 },
      bodyType: "OP", // sheet prints "OP" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // sheet6.jpeg — Mercedes-Benz SL550 (HANDWRITTEN sheet)
  // (USS 輸入車プライムコーナー)
  // Key test: handwriting, MILES unit (マイル), Cavansite Blue
  // ──────────────────────────────────────────────────────────
  {
    file: "sheet6.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "58225",
      make: "Mercedes-Benz",
      model: "SL550",
      grade: null,
      modelCode: "CBA-231473",
      year: 2012,
      yearEra: "H24",
      displacement: 4660,
      mileageKm: 85483, // RAW digit reading — do NOT convert. Unit is "miles".
      mileageUnit: "miles",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Cavansite Blue",
      exteriorColorJapanese: "カバンサイトブルー",
      colorCode: "890",
      interiorColor: null,
      auctionGrade: 4,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDB2314731F004822",
      registrationPlate: "三重 302 な 2598",
      shakenExpiry: null,
      recyclingDepositJpy: 13030,
      seatingCapacity: null,
      dimensions: { length_mm: 4610, width_mm: 1870, height_mm: 1300 },
      bodyType: "2", // sheet prints "2" in 形状 field (handwritten, hard to read)
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // 1.jpeg — Porsche 911 Carrera T
  // (USS 輸入車プライムコーナー) — very clean typed
  // Key test: Reiwa 7 = 2025, F6 = MANUAL, grade 6
  // ──────────────────────────────────────────────────────────
  {
    file: "1.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75133",
      make: "Porsche",
      model: "911",
      grade: "Carrera T",
      modelCode: "7BA-992SK1",
      year: 2025,
      yearEra: "R7",
      displacement: 3000,
      mileageKm: 2567,
      mileageUnit: "km",
      transmission: "MANUAL",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "White",
      exteriorColorJapanese: "ホワイト",
      colorCode: null,
      interiorColor: null,
      auctionGrade: 6,
      interiorGrade: "A",
      accidentHistory: null,
      serviceBookPresent: true,
      vin: "WP0ZZZ99ZSS205247",
      registrationPlate: null,
      shakenExpiry: null,
      recyclingDepositJpy: 21600,
      seatingCapacity: 4,
      dimensions: null,
      bodyType: "CP", // sheet prints "CP" in 形状 field
      importType: null,
      drivetrain: "2WD", // explicitly printed in 駆動 field
    },
  },

  // ──────────────────────────────────────────────────────────
  // 2.jpeg — Audi R8 Spyder
  // (USS 輸入車プライムコーナー) — typed
  // Key test: Audi WMI=WUAZZZ, body type OP, 4WD
  // ──────────────────────────────────────────────────────────
  {
    file: "2.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75142",
      make: "Audi",
      model: "R8 Spyder",
      grade: "Base Grade",
      modelCode: "ABA-42CTYF",
      year: 2016,
      yearEra: "H28",
      displacement: 5200,
      mileageKm: 43998,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Black",
      exteriorColorJapanese: "クロ",
      colorCode: null,
      interiorColor: "Black",
      auctionGrade: 4,
      interiorGrade: "C",
      accidentHistory: null,
      serviceBookPresent: true,
      vin: "WUAZZZ424F7001376",
      registrationPlate: "世田谷 300 ぬ 2899",
      shakenExpiry: "2027-05",
      recyclingDepositJpy: 16500,
      seatingCapacity: 2,
      dimensions: { length_mm: 4440, width_mm: 1900, height_mm: 1240 },
      bodyType: "OP", // sheet prints "OP" in 形状 field
      importType: "Dealer",
      drivetrain: "4WD", // explicitly printed in 駆動 field
    },
  },

  // ──────────────────────────────────────────────────────────
  // 3.jpeg — Mercedes-AMG GT S 130th Anniversary Edition
  // (事故・現状コーナー — Accident/As-Is Corner)
  // Key test: 無効 grade (void), accident corner, color change arrow
  // ──────────────────────────────────────────────────────────
  {
    file: "3.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "11033",
      make: "Mercedes-AMG",
      model: "GT",
      grade: "S 130th Anniversary Edition",
      modelCode: "CBA-190378",
      year: 2016,
      yearEra: "H28",
      displacement: 4000,
      mileageKm: 57472,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "White",
      exteriorColorJapanese: "ホワイト",
      colorCode: "799",
      colorChanged: true,
      interiorColor: null,
      auctionGrade: null, // 無効 = void/invalid
      interiorGrade: null,
      accidentHistory: true, // implied by 事故・現状コーナー
      serviceBookPresent: true,
      vin: "WDD1903781A008939",
      registrationPlate: "宇都宮 346 ゆ 38",
      shakenExpiry: "2027-07",
      recyclingDepositJpy: 16930,
      seatingCapacity: 2,
      dimensions: null,
      bodyType: "3D", // sheet prints "3D" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // 4.jpeg — Mercedes-AMG GT R
  // (USS 輸入車プライムコーナー) — typed, many notes
  // Key test: grade "R" is a trim (NOT accident indicator!),
  //           Green Hell Magno color, extensive equipment list
  // ──────────────────────────────────────────────────────────
  {
    file: "4.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "58175",
      make: "Mercedes-AMG",
      model: "GT",
      grade: "R",
      modelCode: "ABA-190379",
      year: 2017,
      yearEra: "H29",
      displacement: 4000,
      mileageKm: 16888,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Green",
      exteriorColorJapanese: "グリーン",
      colorCode: "376",
      interiorColor: "Black",
      auctionGrade: 4.5,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD1903791A012383",
      registrationPlate: "春日井 310 ほ 138",
      shakenExpiry: "2026-08",
      recyclingDepositJpy: 16900,
      seatingCapacity: 2,
      dimensions: null,
      bodyType: "3D", // sheet prints "3D" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // 5.jpeg — Mercedes-Benz E400 4Matic Cabriolet Sport
  // (USS 輸入車プライムコーナー) — partially handwritten
  // Key test: MILES mileage (51,170 マイル → ~82,342 km),
  //           parallel import, Pearl color code 799
  // ──────────────────────────────────────────────────────────
  {
    file: "5.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "75460",
      make: "Mercedes-Benz",
      model: "E400",
      grade: "4Matic Cabriolet Sport",
      modelCode: "DBA-238466",
      year: 2018,
      yearEra: "H30",
      displacement: 3000,
      mileageKm: 51170, // RAW digit reading — do NOT convert. Unit is "miles".
      mileageUnit: "miles",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Pearl",
      exteriorColorJapanese: "パール",
      colorCode: "799",
      interiorColor: null,
      auctionGrade: 4.5,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD2384661F049432",
      registrationPlate: "府沢 302 つ 1206",
      shakenExpiry: null,
      recyclingDepositJpy: 18800,
      seatingCapacity: 4,
      dimensions: { length_mm: 4850, width_mm: 1860, height_mm: 1430 },
      bodyType: "OP", // sheet prints "OP" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // 6.jpeg — Mercedes-Benz SL400
  // (USS 輸入車プライムコーナー) — handwritten
  // Key test: handwriting OCR, SL400 model, parallel import
  // ──────────────────────────────────────────────────────────
  {
    file: "6.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "88019",
      make: "Mercedes-Benz",
      model: "SL400",
      grade: null,
      modelCode: "DBA-231466",
      year: 2018,
      yearEra: "H30",
      displacement: 3000,
      mileageKm: 36774,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Pearl",
      exteriorColorJapanese: "パール",
      colorCode: "799",
      interiorColor: null,
      auctionGrade: 4.5,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDD2314661F052249",
      registrationPlate: "和泉 330 5 231",
      shakenExpiry: null,
      recyclingDepositJpy: 17570,
      seatingCapacity: 2,
      dimensions: null,
      bodyType: "2", // sheet prints "2" in 形状 field
      importType: "Dealer",
    },
  },

  // ──────────────────────────────────────────────────────────
  // 7.jpeg — Mercedes-Benz G-Class G500 Cabriolet
  // (USS 輸入車プライムコーナー) — typed
  // Key test: old Heisei year (H14=2002), model code "フメイ"
  //           (unknown), 4WD, G-Class body type
  // ──────────────────────────────────────────────────────────
  {
    file: "7.jpeg",
    expected: {
      auctionHouse: "USS",
      lotNumber: "82013",
      make: "Mercedes-Benz",
      model: "G-Class",
      grade: "G500 Cabriolet",
      modelCode: null, // フメイ = Unknown
      year: 2002,
      yearEra: "H14",
      displacement: 5000,
      mileageKm: 43928,
      mileageUnit: "km",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      driveSide: "LHD",
      exteriorColor: "Blue",
      exteriorColorJapanese: "ブルー",
      colorCode: "5359",
      interiorColor: null,
      auctionGrade: 4.5,
      interiorGrade: "B",
      accidentHistory: null,
      serviceBookPresent: null,
      vin: "WDB4632541X133729",
      registrationPlate: "神戸 304 ら 9267",
      shakenExpiry: "2027-09",
      recyclingDepositJpy: 18930,
      seatingCapacity: 5,
      dimensions: { length_mm: 4070, width_mm: 1810, height_mm: 1970 },
      bodyType: "OP", // sheet prints "OP" in 形状 field — do NOT infer "SUV" from model name
      importType: null,
      drivetrain: "4WD", // explicitly printed in 駆動 field
    },
  },
];

// ──────────────────────────────────────────────────────────
// FEW-SHOT EXAMPLES
// Selected for diversity: clean typed, handwritten, miles unit
// ──────────────────────────────────────────────────────────
export const FEW_SHOT_INDICES = [7, 3, 10]; // 1.jpeg (Porsche), sheet4.jpeg (AMG GT), 5.jpeg (E400 miles)

export function getFewShotExamples() {
  return FEW_SHOT_INDICES.map((i) => {
    const c = CALIBRATION[i]; // 0-indexed, but we use the actual index
    return {
      file: c.file,
      expected: c.expected,
    };
  });
}

// Sheets reserved for testing (not used as few-shot examples)
export function getTestSheets() {
  return CALIBRATION.filter((_, i) => !FEW_SHOT_INDICES.includes(i));
}

export default CALIBRATION;

// ──────────────────────────────────────────────────────────
// Field comparison helpers for the test harness
// ──────────────────────────────────────────────────────────

export function compareField(expected, actual, fieldName) {
  if (expected === null || expected === undefined) {
    return { field: fieldName, status: "skip", reason: "expected is null" };
  }
  if (actual === null || actual === undefined) {
    return { field: fieldName, status: "miss", expected, actual: null };
  }

  // String comparison (case-insensitive, whitespace-normalized)
  if (typeof expected === "string" && typeof actual === "string") {
    const norm = (s) => s.toLowerCase().replace(/[\s\-_]+/g, " ").trim();
    if (norm(expected) === norm(actual)) {
      return { field: fieldName, status: "match" };
    }
    // Partial match — check if one contains the other
    if (norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual))) {
      return { field: fieldName, status: "partial", expected, actual };
    }
    return { field: fieldName, status: "mismatch", expected, actual };
  }

  // Numeric comparison (within tolerance for mileage)
  if (typeof expected === "number" && typeof actual === "number") {
    if (expected === actual) {
      return { field: fieldName, status: "match" };
    }
    // Mileage: within 2% is acceptable (miles conversion rounding)
    if (fieldName.includes("mileage") || fieldName.includes("Km")) {
      const tolerance = Math.max(expected, actual) * 0.02;
      if (Math.abs(expected - actual) <= tolerance) {
        return { field: fieldName, status: "match", note: "within 2% tolerance" };
      }
    }
    // Grade: within 0.5 step
    if (fieldName.includes("rade")) {
      if (Math.abs(expected - actual) <= 0.5) {
        return { field: fieldName, status: "partial", expected, actual };
      }
    }
    return { field: fieldName, status: "mismatch", expected, actual };
  }

  // Boolean comparison
  if (typeof expected === "boolean") {
    if (expected === actual) {
      return { field: fieldName, status: "match" };
    }
    return { field: fieldName, status: "mismatch", expected, actual };
  }

  // Object comparison (dimensions)
  if (typeof expected === "object" && typeof actual === "object") {
    const subResults = [];
    for (const key of Object.keys(expected)) {
      subResults.push(compareField(expected[key], actual?.[key], `${fieldName}.${key}`));
    }
    const allMatch = subResults.every((r) => r.status === "match" || r.status === "skip");
    return { field: fieldName, status: allMatch ? "match" : "partial", subResults };
  }

  // Fallback: strict equality
  return {
    field: fieldName,
    status: expected == actual ? "match" : "mismatch",
    expected,
    actual,
  };
}

export function compareSheet(expected, actual) {
  const fields = Object.keys(expected);
  const results = fields.map((f) => compareField(expected[f], actual?.[f], f));

  const matches = results.filter((r) => r.status === "match").length;
  const misses = results.filter((r) => r.status === "miss").length;
  const mismatches = results.filter((r) => r.status === "mismatch").length;
  const partials = results.filter((r) => r.status === "partial").length;
  const skips = results.filter((r) => r.status === "skip").length;
  const total = fields.length - skips;

  return {
    accuracy: total > 0 ? matches / total : 0,
    accuracyWithPartials: total > 0 ? (matches + partials * 0.5) / total : 0,
    matches,
    misses,
    mismatches,
    partials,
    skips,
    total,
    results,
  };
}
