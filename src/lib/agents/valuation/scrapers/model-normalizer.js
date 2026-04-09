/**
 * Model name normalizer for German market scrapers.
 *
 * Auction sheet extraction produces raw model names like "C63 S Cabriolet (C-Class)"
 * or "SL550 BlueEFFICIENCY". These need platform-specific normalization to produce
 * search results on mobile.de and autoscout24.
 *
 * Exports:
 *   normalizeMobileDe(make, model)   → { searchModel, makeId, modelId }
 *   normalizeAutoScout24(make, model) → { makeSlug, modelSlug, matchWords }
 */

// ══════════════════════════════════════════
// MOBILE.DE — Make IDs (numeric)
// Source: mobile.de URL parameters
// ══════════════════════════════════════════

export const MOBILE_MAKE_IDS = {
  "Ferrari": "8600",
  "Porsche": "20100",
  "Lamborghini": "12600",
  "Bentley": "3500",
  "Aston Martin": "1900",
  "Jaguar": "11400",
  "Maserati": "14100",
  "Mercedes-AMG": "17200",
  "Mercedes-Benz": "17200",
  "Mercedes": "17200",
  "BMW M": "3000",   // Fixed: was incorrectly 3500 (Bentley)
  "BMW": "3000",
  "Range Rover": "13200",
  "Land Rover": "13200",
  "Rolls-Royce": "21700",
  "McLaren": "45400",
  "Bugatti": "4100",
  "Lotus": "13900",
  "Alfa Romeo": "900",
  "Audi": "1400",
};

// ══════════════════════════════════════════
// MOBILE.DE — Model IDs (for precise search)
// When we know the exact model, using the modelId gives much better results
// than free-text modelDescription
// ══════════════════════════════════════════

const MOBILE_MODEL_IDS = {
  // Mercedes-Benz / AMG
  "17200": {
    "C 63 AMG": "25187", "C 63": "25187",
    "E 63 AMG": "25188", "E 63": "25188",
    "S 63 AMG": "25190", "S 63": "25190",
    "G 63 AMG": "25191", "G 63": "25191",
    "AMG GT": "25169", "GT": "25169",
    "AMG GT R": "25169", "GT R": "25169",
    "AMG GT S": "25169", "GT S": "25169",
    "AMG GT C": "25169", "GT C": "25169",
    "SL": "22200", "SL 500": "22200", "SL 550": "22200", "SL 63": "22200",
    "SL 55 AMG": "22200",
    "SLS AMG": "22000",
    "CLS": "21900", "CLS 63": "21900",
    "GLE": "25380", "GLE 63": "25380",
    "GLC": "25370", "GLC 63": "25370",
    "A 45 AMG": "25185", "A 45": "25185",
  },
  // Ferrari
  "8600": {
    "488": "22300", "488 GTB": "22300", "488 Spider": "22310",
    "F12": "21700", "F12 Berlinetta": "21700",
    "812": "24700", "812 Superfast": "24700",
    "Roma": "26200",
    "Portofino": "25100", "Portofino M": "25100",
    "296": "27100", "296 GTB": "27100",
    "SF90": "26300",
    "458": "19500", "458 Italia": "19500", "458 Spider": "19510",
    "California": "17600", "California T": "17610",
    "GTC4Lusso": "24600",
    "F8": "25900", "F8 Tributo": "25900",
  },
  // Porsche
  "20100": {
    "911": "16600",
    "718": "24500", "718 Cayman": "24500", "718 Boxster": "24510",
    "Cayenne": "16700",
    "Macan": "22400",
    "Panamera": "17100",
    "Taycan": "25800",
    "GT3": "16600", "GT4": "24500",
  },
  // Lamborghini
  "12600": {
    "Huracán": "22100", "Huracan": "22100",
    "Aventador": "20200",
    "Urus": "25000",
    "Gallardo": "9400",
    "Revuelto": "27500",
  },
  // BMW
  "3000": {
    "M3": "12100", "M4": "22500",
    "M5": "12200", "M2": "24800",
    "M8": "25700",
    "X5 M": "19100", "X6 M": "19200",
    "X3 M": "25600",
  },
  // Bentley
  "3500": {
    "Continental GT": "8900", "Continental GTC": "8910",
    "Flying Spur": "12500",
    "Bentayga": "24100",
  },
  // Aston Martin
  "1900": {
    "DB11": "24200", "DB9": "9100",
    "Vantage": "14700",
    "DBS": "16100", "DBS Superleggera": "16100",
    "DBX": "26000",
    "Rapide": "17500",
  },
  // Jaguar
  "11400": {
    "F-Type": "21500",
    "XK": "9900", "XKR": "9910",
    "F-Pace": "24000",
    "XJ": "9800",
  },
  // Range Rover / Land Rover
  "13200": {
    "Range Rover Sport": "16000", "Sport": "16000",
    "Range Rover Sport SVR": "16000",
    "Range Rover": "8400",
    "Range Rover Velar": "24900",
    "Defender": "7800",
  },
  // Maserati
  "14100": {
    "GranTurismo": "16200", "Granturismo": "16200",
    "Ghibli": "22000",
    "Levante": "24300",
    "Quattroporte": "8500",
    "MC20": "26700",
  },
  // Rolls-Royce
  "21700": {
    "Ghost": "19800",
    "Wraith": "22100",
    "Dawn": "24400",
    "Phantom": "17000",
    "Cullinan": "25300",
  },
  // McLaren
  "45400": {
    "720S": "25200",
    "570S": "24600", "570GT": "24610",
    "600LT": "25500",
    "765LT": "26500",
    "GT": "26100",
    "Artura": "27200",
  },
};

// ══════════════════════════════════════════
// AUTOSCOUT24 — Model slugs
// URL format: /lst/{make-slug}/{model-slug}/
// ══════════════════════════════════════════

export const AUTOSCOUT_MAKE_SLUGS = {
  "Ferrari": "ferrari",
  "Porsche": "porsche",
  "Lamborghini": "lamborghini",
  "Bentley": "bentley",
  "Aston Martin": "aston-martin",
  "Jaguar": "jaguar",
  "Maserati": "maserati",
  "Mercedes-AMG": "mercedes-benz",
  "Mercedes-Benz": "mercedes-benz",
  "Mercedes": "mercedes-benz",
  "BMW M": "bmw",
  "BMW": "bmw",
  "Range Rover": "land-rover",
  "Land Rover": "land-rover",
  "Rolls-Royce": "rolls-royce",
  "McLaren": "mclaren",
  "Bugatti": "bugatti",
  "Lotus": "lotus",
  "Alfa Romeo": "alfa-romeo",
  "Audi": "audi",
};

const AUTOSCOUT_MODEL_SLUGS = {
  "mercedes-benz": {
    "C 63": "c-klasse-amg", "C63": "c-klasse-amg", "C 43": "c-klasse-amg",
    "E 63": "e-klasse-amg", "E63": "e-klasse-amg", "E 53": "e-klasse-amg",
    "S 63": "s-klasse-amg", "S63": "s-klasse-amg",
    "G 63": "g-klasse-amg", "G63": "g-klasse-amg",
    "AMG GT": "amg-gt", "GT R": "amg-gt", "GT S": "amg-gt", "GT C": "amg-gt",
    "SL": "sl", "SL 500": "sl", "SL 550": "sl", "SL 55": "sl", "SL 63": "sl",
    "SLS": "sls-amg",
    "CLS": "cls", "CLS 63": "cls-amg",
    "GLE 63": "gle-amg", "GLE": "gle",
    "GLC 63": "glc-amg", "GLC": "glc",
    "A 45": "a-klasse-amg", "A45": "a-klasse-amg",
    "CLA 45": "cla-amg",
  },
  "ferrari": {
    "488": "488-gtb", "488 GTB": "488-gtb", "488 Spider": "488-spider",
    "F12": "f12berlinetta", "F12 Berlinetta": "f12berlinetta",
    "812": "812", "812 Superfast": "812",
    "Roma": "roma",
    "Portofino": "portofino",
    "296": "296-gtb", "296 GTB": "296-gtb",
    "SF90": "sf90",
    "458": "458", "458 Italia": "458",
    "California": "california",
    "F8": "f8", "F8 Tributo": "f8",
    "GTC4Lusso": "gtc4lusso",
  },
  "porsche": {
    "911": "911", "992": "911", "991": "911",
    "718": "718", "718 Cayman": "718", "718 Boxster": "718",
    "Cayenne": "cayenne",
    "Macan": "macan",
    "Panamera": "panamera",
    "Taycan": "taycan",
    "GT3": "911", "GT4": "718",
  },
  "lamborghini": {
    "Huracán": "huracan", "Huracan": "huracan",
    "Aventador": "aventador",
    "Urus": "urus",
    "Gallardo": "gallardo",
    "Revuelto": "revuelto",
  },
  "bmw": {
    "M3": "m3", "M4": "m4", "M5": "m5", "M2": "m2", "M8": "m8",
    "X5 M": "x5-m", "X6 M": "x6-m", "X3 M": "x3-m",
  },
  "bentley": {
    "Continental GT": "continental-gt", "Continental GTC": "continental-gtc",
    "Flying Spur": "flying-spur",
    "Bentayga": "bentayga",
  },
  "aston-martin": {
    "DB11": "db11", "DB9": "db9",
    "Vantage": "vantage",
    "DBS": "dbs", "DBS Superleggera": "dbs",
    "DBX": "dbx",
  },
  "jaguar": {
    "F-Type": "f-type", "F Type": "f-type",
    "XK": "xk", "XKR": "xkr",
    "F-Pace": "f-pace",
  },
  "land-rover": {
    "Range Rover Sport": "range-rover-sport", "Sport SVR": "range-rover-sport",
    "Range Rover": "range-rover",
    "Range Rover Velar": "range-rover-velar",
    "Defender": "defender",
  },
  "maserati": {
    "GranTurismo": "granturismo", "Granturismo": "granturismo",
    "Ghibli": "ghibli",
    "Levante": "levante",
    "Quattroporte": "quattroporte",
    "MC20": "mc20",
  },
  "rolls-royce": {
    "Ghost": "ghost", "Wraith": "wraith", "Dawn": "dawn",
    "Phantom": "phantom", "Cullinan": "cullinan",
  },
  "mclaren": {
    "720S": "720s", "570S": "570s", "570GT": "570gt",
    "600LT": "600lt", "765LT": "765lt",
    "GT": "gt", "Artura": "artura",
  },
};

// ══════════════════════════════════════════
// NORMALIZATION LOGIC
// ══════════════════════════════════════════

/**
 * Strip parenthetical notes, extra qualifiers, and normalize spacing.
 * "C63 S Cabriolet (C-Class)" → "C63 S Cabriolet"
 * "SL550 BlueEFFICIENCY" → "SL550"
 */
function cleanModelName(model) {
  if (!model) return "";
  return model
    .replace(/\(.*?\)/g, "")           // Remove parenthetical notes
    .replace(/BlueEFFICIENCY/gi, "")   // Remove efficiency badge
    .replace(/4MATIC\+?/gi, "")        // Remove drivetrain badge
    .replace(/\b(Cabriolet|Cabrio|Convertible|Roadster|Coupe|Coupé|Sedan|Limousine|Estate|Kombi|Shooting Brake|Spyder|Spider)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the core model identifier for platform matching.
 * "C63 S Cabriolet (C-Class)" → "C 63"
 * "SL 550" → "SL 550"
 * "488 GTB" → "488"
 */
function extractCoreModel(make, model) {
  const cleaned = cleanModelName(model);

  // Mercedes: "C63 S" → "C 63", "AMG GT R" → "AMG GT"
  if (/mercedes|amg/i.test(make)) {
    // Match patterns like C63, E63, S63, G63, A45, CLA45
    const amgMatch = cleaned.match(/^([A-Z]{1,3})\s*(\d{2,3})/i);
    if (amgMatch) return `${amgMatch[1]} ${amgMatch[2]}`;
    // AMG GT variants
    if (/AMG\s*GT/i.test(cleaned)) return "AMG GT";
    // SL, SLS, CLS etc.
    const classMatch = cleaned.match(/^(SL|SLS|CLS|GLE|GLC|GLB|GLA|CLA)\s*(\d{2,3})?/i);
    if (classMatch) return classMatch[2] ? `${classMatch[1]} ${classMatch[2]}` : classMatch[1];
  }

  // Ferrari: "488 GTB" → "488", "F12 Berlinetta" → "F12"
  if (/ferrari/i.test(make)) {
    const match = cleaned.match(/^(488|458|296|812|F12|F8|SF90|Roma|Portofino|California|GTC4|LaFerrari)/i);
    if (match) return match[1];
  }

  // Porsche: "911 Carrera S" → "911", "718 Cayman GT4" → "718"
  if (/porsche/i.test(make)) {
    if (/GT3|GT3\s*RS/i.test(cleaned)) return "GT3";
    if (/GT4/i.test(cleaned)) return "GT4";
    const match = cleaned.match(/^(911|718|Cayenne|Macan|Panamera|Taycan)/i);
    if (match) return match[1];
  }

  // Lamborghini
  if (/lamborghini/i.test(make)) {
    const match = cleaned.match(/^(Hurac[aá]n|Aventador|Urus|Gallardo|Revuelto)/i);
    if (match) return match[1];
  }

  // BMW M
  if (/bmw/i.test(make)) {
    const match = cleaned.match(/^(M[2-8]|X[3-6]\s*M)/i);
    if (match) return match[1];
  }

  // Default: return first 2-3 significant words
  return cleaned.split(/\s+/).slice(0, 2).join(" ");
}

// ══════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════

/**
 * Normalize model name for mobile.de search.
 * Returns { searchModel, makeId, modelId }
 */
export function normalizeMobileDe(make, model) {
  const makeId = MOBILE_MAKE_IDS[make] || "";
  const coreModel = extractCoreModel(make, model);

  // Try to find an exact modelId for precise search
  const makeModels = MOBILE_MODEL_IDS[makeId];
  let modelId = null;
  if (makeModels) {
    // Try exact match first, then core model, then partial
    modelId = makeModels[model] || makeModels[cleanModelName(model)] || makeModels[coreModel];
    if (!modelId) {
      // Try partial match
      for (const [key, id] of Object.entries(makeModels)) {
        if (coreModel.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(coreModel.toLowerCase())) {
          modelId = id;
          break;
        }
      }
    }
  }

  // For modelDescription search, use the core model (simple, clean)
  const searchModel = coreModel;

  return { searchModel, makeId, modelId };
}

/**
 * Normalize model name for autoscout24 search.
 * Returns { makeSlug, modelSlug, matchWords }
 */
export function normalizeAutoScout24(make, model) {
  const makeSlug = AUTOSCOUT_MAKE_SLUGS[make] || make.toLowerCase().replace(/\s+/g, "-");
  const coreModel = extractCoreModel(make, model);

  // Try to find model slug
  const makeModels = AUTOSCOUT_MODEL_SLUGS[makeSlug];
  let modelSlug = null;
  if (makeModels) {
    modelSlug = makeModels[model] || makeModels[cleanModelName(model)] || makeModels[coreModel];
    if (!modelSlug) {
      for (const [key, slug] of Object.entries(makeModels)) {
        if (coreModel.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(coreModel.toLowerCase())) {
          modelSlug = slug;
          break;
        }
      }
    }
  }

  // Build match words for title filtering (used when scraping listing results)
  // Use the core model + key variant words, not the full raw model name
  const matchWords = coreModel
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  // Add German equivalents
  const deMap = { "cabriolet": "cabrio", "convertible": "cabrio", "coupe": "coupé", "roadster": "roadster" };
  const rawLower = model.toLowerCase();
  for (const [en, de] of Object.entries(deMap)) {
    if (rawLower.includes(en)) matchWords.push(de);
  }

  return { makeSlug, modelSlug, matchWords };
}
