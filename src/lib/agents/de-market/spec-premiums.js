const COMMON_COLORS = {
  Ferrari: { "Rosso Corsa": 1.0, "Nero": 0.98, "Blu Pozzi": 1.05, "Giallo Modena": 1.06, "Grigio Silverstone": 1.03, "Verde British Racing": 1.05 },
  Porsche: { "GT Silver Metallic": 1.04, "Chalk": 1.05, "Guards Red": 1.0, "Jet Black Metallic": 0.99, "Crayon": 1.04, "Gentian Blue": 1.03 },
  "Mercedes-AMG": { "Selenite Grey Magno": 1.04, "Obsidian Black": 0.99, "Solarbeam Yellow": 1.03, "Designo Diamond White": 1.03 },
  Lamborghini: { "Verde Mantis": 1.05, "Arancio Borealis": 1.04, "Nero Nemesis": 0.99, "Giallo Auge": 1.04 },
  "Aston Martin": { "Jet Black": 0.99, "Skyfall Silver": 1.0, "Zaffre Blue": 1.03, "Stratus White": 1.0 },
  Bentley: { "Beluga Black": 0.98, "Onyx": 0.98, "St James Red": 1.03, "Glacier White": 1.0 },
};

const OPTION_PREMIUMS = {
  Ferrari: {
    "Daytona seats": { modifier: 1.04, premium_eur: 6000, reason: "Rare option, strong resale" },
    "Carbon fiber racing package": { modifier: 1.05, premium_eur: 7000, reason: "Visible distinguishing feature" },
    "Scuderia Ferrari shields": { modifier: 1.02, premium_eur: 1500, reason: "Small cost, status marker" },
    "Lift system": { modifier: 1.015, premium_eur: 2500, reason: "Practical upgrade" },
    "Forged wheels": { modifier: 1.02, premium_eur: 3000, reason: "Weight saving, aesthetics" },
    "JBL audio": { modifier: 1.01, premium_eur: 1200, reason: "Interior upgrade" },
  },
  Porsche: {
    "PCCB (Carbon Ceramic Brakes)": { modifier: 1.05, premium_eur: 7500, reason: "Most valuable single option" },
    "Sport Chrono Package": { modifier: 1.025, premium_eur: 2500, reason: "Performance pack + dashboard clock" },
    "PDCC (Dynamic Chassis Control)": { modifier: 1.02, premium_eur: 2500, reason: "Driving dynamics" },
    "Rear-axle steering": { modifier: 1.03, premium_eur: 3000, reason: "Handling aid, 991.2/992" },
    "Bose/Burmester audio": { modifier: 1.015, premium_eur: 2500, reason: "Interior upgrade" },
    "Sport exhaust": { modifier: 1.02, premium_eur: 2000, reason: "Sound + visible tips" },
    "LED Matrix headlights": { modifier: 1.015, premium_eur: 1500, reason: "Modern safety feature" },
    "Adaptive sport seats Plus (18-way)": { modifier: 1.02, premium_eur: 2000, reason: "Comfort + adjustability" },
  },
  "Mercedes-AMG": {
    "AMG performance seats": { modifier: 1.025, premium_eur: 3000, reason: "Visible racing-style seats" },
    "Carbon fiber trim": { modifier: 1.02, premium_eur: 2500, reason: "Interior differentiation" },
    "Burmester 3D surround": { modifier: 1.015, premium_eur: 2000, reason: "Premium audio" },
    "AMG Aerodynamics Package": { modifier: 1.03, premium_eur: 4000, reason: "Visible aero kit" },
    "AMG Night Package": { modifier: 1.015, premium_eur: 1500, reason: "Murdered-out spec" },
    "Ceramic brakes": { modifier: 1.04, premium_eur: 6000, reason: "High-cost factory option" },
  },
  Lamborghini: {
    "Ad Personam color": { modifier: 1.06, premium_eur: 8000, reason: "Bespoke paint" },
    "Carbon fiber engine bay": { modifier: 1.04, premium_eur: 6000, reason: "Visual + weight" },
    "Forged wheels (Loge/Aesir)": { modifier: 1.03, premium_eur: 4000, reason: "Light, distinctive" },
    "Alcantara interior": { modifier: 1.02, premium_eur: 2500, reason: "Racing interior" },
  },
  "Aston Martin": {
    "Q by Aston Martin bespoke": { modifier: 1.06, premium_eur: 10000, reason: "Commission-level personalization" },
    "Carbon fiber pack": { modifier: 1.03, premium_eur: 5000, reason: "Exterior trim" },
    "AML 1000W audio": { modifier: 1.015, premium_eur: 2500, reason: "Hi-fi upgrade" },
  },
  Bentley: {
    "Mulliner Specification": { modifier: 1.05, premium_eur: 10000, reason: "Bespoke luxury pack" },
    "Naim audio": { modifier: 1.03, premium_eur: 6500, reason: "Reference-grade stereo" },
    "Rotating display": { modifier: 1.02, premium_eur: 5000, reason: "Continental GT signature" },
    "Mulliner Driving Spec": { modifier: 1.025, premium_eur: 4000, reason: "Sport pack" },
  },
  "BMW M": {
    "M Carbon ceramic brakes": { modifier: 1.04, premium_eur: 6000, reason: "Performance + visual" },
    "M Driver's Package": { modifier: 1.02, premium_eur: 1500, reason: "Top-speed unlock + training" },
    "Carbon exterior package": { modifier: 1.025, premium_eur: 3000, reason: "Visible carbon trim" },
    "Harman Kardon / B&W Diamond": { modifier: 1.015, premium_eur: 2000, reason: "Audio upgrade" },
  },
};

const AVOID_SPECS_BY_BRAND = {
  Ferrari: ["Non-original wheels", "Aftermarket exhaust (non-Tubi)", "Repainted panels", "Incomplete service book"],
  Porsche: ["Non-original wheels", "Aftermarket coilovers", "Modified ECU", "Accident-repaired front structure"],
  "Mercedes-AMG": ["Lowering springs", "Non-AMG wheels", "Aftermarket remap without AMG stamp"],
  Lamborghini: ["Non-OEM wrap residue", "Aftermarket exhaust", "Missing books/tools"],
  "Aston Martin": ["Mismatched interior re-trim", "Incomplete service history"],
  Bentley: ["Worn piano black trim", "Cheap tire brands", "Missing Mulliner docs"],
  "BMW M": ["Non-M wheels", "Aftermarket exhaust", "Tuned ECU without documentation"],
};

export function getSeedPremiums(make) {
  const brand = Object.keys(COMMON_COLORS).find((k) => k.toLowerCase() === (make || "").toLowerCase());
  if (!brand) return { colors: {}, options: {}, avoid_specs: [], brand: null };
  return {
    colors: COMMON_COLORS[brand] || {},
    options: OPTION_PREMIUMS[brand] || {},
    avoid_specs: AVOID_SPECS_BY_BRAND[brand] || [],
    brand,
  };
}

export function mergeSeedWithAi(seed, ai) {
  return {
    colors: { ...(ai?.colors || {}), ...(seed?.colors || {}) },
    options: { ...(ai?.options || {}), ...(seed?.options || {}) },
    avoid_specs: Array.from(new Set([...(seed?.avoid_specs || []), ...(ai?.avoid_specs || [])])),
    seededBrand: seed?.brand || null,
    seededColorCount: Object.keys(seed?.colors || {}).length,
    seededOptionCount: Object.keys(seed?.options || {}).length,
  };
}
