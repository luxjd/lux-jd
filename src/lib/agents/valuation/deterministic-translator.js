import {
  COLORS,
  BRANDS,
  TRANSMISSIONS,
  FUELS,
  DRIVE_SIDES,
  DRIVETRAINS,
  BODY_TYPES,
  IMPORT_TYPES,
  EQUIPMENT,
  INSPECTOR_TERMS,
  SALES_PHRASES,
  CAUTION_PHRASES,
  AUCTION_HOUSES,
  lookup,
  translateTerm,
  translateArray,
} from "./ja-dictionary.js";

const PASSTHROUGH_FIELDS = new Set([
  "exteriorColorJapanese",
  "exterior_color_japanese",
]);

const ENUM_FIELDS = {
  exteriorColor: COLORS,
  exterior_color: COLORS,
  interiorColor: COLORS,
  interior_color: COLORS,
  make: BRANDS,
  transmission: TRANSMISSIONS,
  fuelType: FUELS,
  fuel_type: FUELS,
  driveSide: DRIVE_SIDES,
  drive_side: DRIVE_SIDES,
  drivetrain: DRIVETRAINS,
  bodyType: BODY_TYPES,
  body_type: BODY_TYPES,
  importType: IMPORT_TYPES,
  import_type: IMPORT_TYPES,
  auctionHouse: AUCTION_HOUSES,
  auction_house: AUCTION_HOUSES,
};

const ARRAY_ENUM_FIELDS = {
  featureCodes: EQUIPMENT,
  equipment_translated: EQUIPMENT,
};

const FREE_TEXT_ARRAY_FIELDS = {
  salesPoints: [SALES_PHRASES],
  sales_points: [SALES_PHRASES],
  cautionNotes: [CAUTION_PHRASES, INSPECTOR_TERMS],
  caution_notes: [CAUTION_PHRASES, INSPECTOR_TERMS],
  inspectorNotes: [INSPECTOR_TERMS],
  inspector_notes: [INSPECTOR_TERMS],
};

const COLOR_FIELDS = new Set([
  "exteriorColor",
  "exterior_color",
  "interiorColor",
  "interior_color",
]);

const TWO_TONE_FIELDS = new Set([
  "interiorColor",
  "interior_color",
]);

function stripColorSuffix(value) {
  if (typeof value !== "string") return value;
  return value.replace(/系$/, "");
}

function translateColor(value, untranslated) {
  if (!value || typeof value !== "string") return value;
  const cleaned = value.trim();
  const stripped = stripColorSuffix(cleaned);
  const result = lookup(cleaned, COLORS) || lookup(stripped, COLORS);
  if (result) return result.translated;
  untranslated.push(cleaned);
  return cleaned;
}

function translateTwoToneColor(value, untranslated) {
  if (!value || typeof value !== "string") return value;
  const parts = value.split("/");
  if (parts.length === 1) return translateColor(value, untranslated);
  return parts.map((p) => translateColor(p.trim(), untranslated)).join("/");
}

function translateEnum(value, dictionary, untranslated) {
  if (!value || typeof value !== "string") return value;
  const cleaned = value.trim();
  const result = lookup(cleaned, dictionary);
  if (result) return result.translated;
  untranslated.push(cleaned);
  return cleaned;
}

function translateArrayEnum(values, dictionary, untranslated) {
  if (!Array.isArray(values)) return values;
  return values.map((item) => {
    if (typeof item !== "string") return item;
    const cleaned = item.trim();
    const result = lookup(cleaned, dictionary);
    if (result) return result.translated;
    untranslated.push(cleaned);
    return cleaned;
  });
}

function translateFreeTextItem(text, dictionaries) {
  if (typeof text !== "string") return { value: text, source: "passthrough" };
  const cleaned = text.trim();
  for (const dict of dictionaries) {
    const result = lookup(cleaned, dict);
    if (result) return { value: result.translated, source: "dictionary" };
  }
  let working = cleaned;
  let hadMatch = false;
  for (const dict of dictionaries) {
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (working.includes(key)) {
        working = working.split(key).join(dict[key]);
        hadMatch = true;
      }
    }
  }
  if (hadMatch) return { value: working, source: "partial_dictionary" };
  return { value: cleaned, source: "passthrough" };
}

function translateFreeTextArray(values, dictionaries, untranslated) {
  if (!Array.isArray(values)) return values;
  return values.map((item) => {
    const result = translateFreeTextItem(item, dictionaries);
    if (result.source === "passthrough") untranslated.push(item);
    return result.value;
  });
}

export function applyDictionaryTranslation(extracted) {
  if (!extracted || typeof extracted !== "object") {
    return { translated: extracted, untranslatedTerms: [] };
  }

  const translated = { ...extracted };
  const untranslatedTerms = [];

  // bodyType: reverse-map English names back to USS raw codes.
  // The prompt asks for raw codes (3D, OP, CP) but models sometimes
  // return English anyway. This safety net normalizes them back.
  const BODY_TYPE_REVERSE = {
    "coupe": "CP", "coupé": "CP",
    "convertible": "OP", "cabriolet": "OP", "open": "OP",
    "open/convertible": "OP", "roadster": "OP", "spyder": "OP", "spider": "OP",
    "sedan": "SD", "saloon": "SD",
    "wagon": "SW", "estate": "SW", "station wagon": "SW",
    "hatchback": "HB",
    "van": "VN", "minivan": "VN",
    "truck": "TK",
    "limousine": "SD",
  };

  for (const [field, value] of Object.entries(extracted)) {
    if (value === null || value === undefined || value === "") continue;

    if (PASSTHROUGH_FIELDS.has(field)) continue;

    // bodyType: reverse English → USS code
    if ((field === "bodyType" || field === "body_type") && typeof value === "string") {
      const lc = value.toLowerCase().trim();
      if (BODY_TYPE_REVERSE[lc]) {
        translated[field] = BODY_TYPE_REVERSE[lc];
      }
      continue;
    }

    if (field in ENUM_FIELDS) {
      if (TWO_TONE_FIELDS.has(field)) {
        translated[field] = translateTwoToneColor(value, untranslatedTerms);
      } else if (COLOR_FIELDS.has(field)) {
        translated[field] = translateColor(value, untranslatedTerms);
      } else {
        translated[field] = translateEnum(value, ENUM_FIELDS[field], untranslatedTerms);
      }
      continue;
    }

    if (field in ARRAY_ENUM_FIELDS) {
      translated[field] = translateArrayEnum(value, ARRAY_ENUM_FIELDS[field], untranslatedTerms);
      continue;
    }

    if (field in FREE_TEXT_ARRAY_FIELDS) {
      translated[field] = translateFreeTextArray(value, FREE_TEXT_ARRAY_FIELDS[field], untranslatedTerms);
      continue;
    }
  }

  return { translated, untranslatedTerms };
}
