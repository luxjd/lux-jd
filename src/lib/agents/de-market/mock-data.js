import { generatePriceHistory } from "./utils";

// ─── Agent Status ───
export const agentStatus = {
  agentId: "de-market",
  name: "DE Market Research Agent",
  codename: "de_market",
  status: "ONLINE",
  uptime: "99.7%",
  lastScanTimestamp: "2026-04-04T08:30:00Z",
  lastScanDuration: 23400,
  scansConductedToday: 6,
  scansScheduledToday: 8,
  totalListingsTracked: 342,
  totalPriceUpdates24h: 28,
  errorCount24h: 0,
  dataFreshness: "FRESH",
  nextScheduledScan: "2026-04-04T12:30:00Z",
  healthChecks: {
    "mobile.de": { status: "OK", latency: 340, lastCheck: "2026-04-04T08:28:00Z" },
    "AutoScout24": { status: "OK", latency: 520, lastCheck: "2026-04-04T06:00:00Z" },
    "elferspot": { status: "DEGRADED", latency: 2100, lastCheck: "2026-04-04T07:50:00Z" },
    "ClassicDriver": { status: "OK", latency: 410, lastCheck: "2026-04-04T07:00:00Z" },
  },
};

// ─── Tracked Models with Full Price Maps ───
export const trackedModels = [
  {
    id: "ferrari-488-gtb", make: "Ferrari", model: "488 GTB", yearRange: [2016, 2019], segment: "EXOTIC", tracking: true,
    pricing: { medianEur: 168000, meanEur: 172500, p25Eur: 155000, p75Eur: 185000, minEur: 139000, maxEur: 215000, sampleSize: 47, dataFreshnessHours: 2.3 },
    trend: { direction: "STABLE", change30dPct: -1.2, change90dPct: 2.8, change180dPct: 5.1, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 78, avgDaysOnMarket: 24, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 8, newListingsLast7d: 3 },
    specPremiums: {
      colors: { "Rosso Corsa": 1.05, "Grigio Silverstone": 1.02, "Bianco Avus": 1.03, "Nero": 0.97, "Blu Pozzi": 1.08 },
      options: { "Daytona Seats": { mod: 1.03, eur: 5000 }, "Carbon Fibre Package": { mod: 1.04, eur: 6500 }, "Full Dealer History": { mod: 1.08, eur: 13000 }, "Sub-15K km": { mod: 1.12, eur: 20000 } },
      avoid: ["aftermarket exhaust", "custom wraps", "salvage title"],
    },
    confidence: 0.91, recommendedMaxLandedCost: 135000, minimumMargin: 20000,
    dataSources: { "mobile.de": 31, "AutoScout24": 12, "ClassicDriver": 4 },
    lastUpdated: "2026-04-04T08:30:00Z",
  },
  {
    id: "porsche-911-gt3", make: "Porsche", model: "911 GT3 (992)", yearRange: [2021, 2023], segment: "SPORTS", tracking: true,
    pricing: { medianEur: 210000, meanEur: 215000, p25Eur: 195000, p75Eur: 232000, minEur: 178000, maxEur: 265000, sampleSize: 38, dataFreshnessHours: 3.1 },
    trend: { direction: "APPRECIATING", change30dPct: 2.1, change90dPct: 5.5, change180dPct: 8.3, seasonalFactor: "POSITIVE" },
    demand: { velocityScore: 92, avgDaysOnMarket: 12, inquiryRate: "EXTREME", priceResilience: "STRONG", salesLast30d: 14, newListingsLast7d: 5 },
    specPremiums: {
      colors: { "GT Silver": 1.02, "Shark Blue": 1.06, "Guards Red": 1.03, "Black": 0.98 },
      options: { "PCCB Ceramic Brakes": { mod: 1.05, eur: 10000 }, "Sport Chrono": { mod: 1.02, eur: 4000 }, "Bucket Seats": { mod: 1.04, eur: 8000 }, "Full PPF": { mod: 1.03, eur: 6000 } },
      avoid: ["lowered suspension", "aftermarket wheels", "track-damaged"],
    },
    confidence: 0.94, recommendedMaxLandedCost: 172000, minimumMargin: 25000,
    dataSources: { "mobile.de": 18, "AutoScout24": 9, "elferspot": 11 },
    lastUpdated: "2026-04-04T07:15:00Z",
  },
  {
    id: "amg-gt-r", make: "Mercedes-AMG", model: "GT R", yearRange: [2018, 2021], segment: "SPORTS", tracking: true,
    pricing: { medianEur: 105000, meanEur: 108000, p25Eur: 95000, p75Eur: 118000, minEur: 82000, maxEur: 135000, sampleSize: 29, dataFreshnessHours: 4.2 },
    trend: { direction: "STABLE", change30dPct: 0.5, change90dPct: -1.8, change180dPct: -3.2, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 62, avgDaysOnMarket: 32, inquiryRate: "MODERATE", priceResilience: "MODERATE", salesLast30d: 5, newListingsLast7d: 2 },
    specPremiums: {
      colors: { "AMG Green Hell Magno": 1.12, "Selenite Grey": 1.01, "Brilliant Blue": 1.04, "Black": 0.98 },
      options: { "AMG Aerodynamics Pack": { mod: 1.03, eur: 3000 }, "Carbon Pack": { mod: 1.05, eur: 5000 }, "Full Dealer History": { mod: 1.06, eur: 6000 } },
      avoid: ["modified exhaust", "remapped ECU"],
    },
    confidence: 0.85, recommendedMaxLandedCost: 82000, minimumMargin: 15000,
    dataSources: { "mobile.de": 20, "AutoScout24": 9 },
    lastUpdated: "2026-04-04T06:00:00Z",
  },
  {
    id: "huracan-sto", make: "Lamborghini", model: "Huracan STO", yearRange: [2021, 2023], segment: "EXOTIC", tracking: true,
    pricing: { medianEur: 365000, meanEur: 372000, p25Eur: 340000, p75Eur: 398000, minEur: 310000, maxEur: 425000, sampleSize: 14, dataFreshnessHours: 5.8 },
    trend: { direction: "APPRECIATING", change30dPct: 3.5, change90dPct: 7.2, change180dPct: 12.1, seasonalFactor: "POSITIVE" },
    demand: { velocityScore: 85, avgDaysOnMarket: 18, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 3, newListingsLast7d: 1 },
    specPremiums: {
      colors: { "Arancio Borealis": 1.06, "Verde Mantis": 1.08, "Bianco Monocerus": 1.02, "Nero Noctis": 1.01 },
      options: { "Full Carbon Body": { mod: 1.05, eur: 18000 }, "Style Pack": { mod: 1.02, eur: 7000 } },
      avoid: ["track accident history", "aftermarket aero"],
    },
    confidence: 0.82, recommendedMaxLandedCost: 285000, minimumMargin: 40000,
    dataSources: { "mobile.de": 6, "ClassicDriver": 5, "AutoScout24": 3 },
    lastUpdated: "2026-04-04T05:00:00Z",
  },
  {
    id: "continental-gt", make: "Bentley", model: "Continental GT", yearRange: [2019, 2022], segment: "GRAND_TOURER", tracking: true,
    pricing: { medianEur: 155000, meanEur: 158000, p25Eur: 138000, p75Eur: 172000, minEur: 118000, maxEur: 198000, sampleSize: 33, dataFreshnessHours: 3.5 },
    trend: { direction: "DEPRECIATING", change30dPct: -2.1, change90dPct: -4.5, change180dPct: -7.8, seasonalFactor: "NEGATIVE" },
    demand: { velocityScore: 48, avgDaysOnMarket: 42, inquiryRate: "MODERATE", priceResilience: "WEAK", salesLast30d: 4, newListingsLast7d: 3 },
    specPremiums: {
      colors: { "Onyx Black": 1.01, "Glacier White": 1.02, "Verdant": 1.05, "Orange Flame": 1.08 },
      options: { "Mulliner Driving Spec": { mod: 1.06, eur: 9000 }, "Touring Spec": { mod: 1.03, eur: 4500 }, "Naim Audio": { mod: 1.02, eur: 3000 } },
      avoid: ["V8 (only track W12)", "high mileage >40K"],
    },
    confidence: 0.87, recommendedMaxLandedCost: 118000, minimumMargin: 20000,
    dataSources: { "mobile.de": 22, "AutoScout24": 8, "ClassicDriver": 3 },
    lastUpdated: "2026-04-04T07:00:00Z",
  },
  {
    id: "db11-v12", make: "Aston Martin", model: "DB11 V12", yearRange: [2017, 2020], segment: "GRAND_TOURER", tracking: true,
    pricing: { medianEur: 135000, meanEur: 138000, p25Eur: 120000, p75Eur: 152000, minEur: 105000, maxEur: 175000, sampleSize: 21, dataFreshnessHours: 6.1 },
    trend: { direction: "STABLE", change30dPct: 0.8, change90dPct: 1.5, change180dPct: -1.2, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 55, avgDaysOnMarket: 35, inquiryRate: "MODERATE", priceResilience: "MODERATE", salesLast30d: 3, newListingsLast7d: 1 },
    specPremiums: {
      colors: { "Magnetic Silver": 1.02, "Onyx Black": 1.00, "Lightning Silver": 1.03, "White Stone": 1.01 },
      options: { "Premium Audio": { mod: 1.02, eur: 2500 }, "Technology Pack": { mod: 1.03, eur: 3500 } },
      avoid: ["high mileage >50K", "non-dealer service history"],
    },
    confidence: 0.80, recommendedMaxLandedCost: 100000, minimumMargin: 20000,
    dataSources: { "mobile.de": 13, "ClassicDriver": 5, "AutoScout24": 3 },
    lastUpdated: "2026-04-04T04:30:00Z",
  },
  {
    id: "m4-competition", make: "BMW", model: "M4 Competition", yearRange: [2021, 2023], segment: "SPORTS", tracking: true,
    pricing: { medianEur: 85000, meanEur: 87000, p25Eur: 78000, p75Eur: 95000, minEur: 68000, maxEur: 108000, sampleSize: 52, dataFreshnessHours: 1.8 },
    trend: { direction: "DEPRECIATING", change30dPct: -1.8, change90dPct: -5.2, change180dPct: -8.5, seasonalFactor: "NEGATIVE" },
    demand: { velocityScore: 71, avgDaysOnMarket: 22, inquiryRate: "HIGH", priceResilience: "MODERATE", salesLast30d: 11, newListingsLast7d: 6 },
    specPremiums: {
      colors: { "Isle of Man Green": 1.06, "Toronto Red": 1.03, "Frozen variants": 1.08, "Black Sapphire": 0.98 },
      options: { "M Carbon Bucket Seats": { mod: 1.05, eur: 4000 }, "M Drive Professional": { mod: 1.02, eur: 1500 }, "Carbon Roof": { mod: 1.03, eur: 2500 } },
      avoid: ["base M4 (non-Competition)", "xDrive (less desirable for enthusiasts)"],
    },
    confidence: 0.93, recommendedMaxLandedCost: 62000, minimumMargin: 15000,
    dataSources: { "mobile.de": 38, "AutoScout24": 14 },
    lastUpdated: "2026-04-04T09:00:00Z",
  },
  {
    id: "cayenne-turbo-gt", make: "Porsche", model: "Cayenne Turbo GT", yearRange: [2022, 2024], segment: "SUV", tracking: true,
    pricing: { medianEur: 178000, meanEur: 182000, p25Eur: 165000, p75Eur: 198000, minEur: 148000, maxEur: 218000, sampleSize: 18, dataFreshnessHours: 4.0 },
    trend: { direction: "STABLE", change30dPct: -0.5, change90dPct: 1.2, change180dPct: 3.5, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 68, avgDaysOnMarket: 28, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 4, newListingsLast7d: 2 },
    specPremiums: {
      colors: { "Arctic Grey": 1.03, "Carmine Red": 1.05, "White": 1.00, "Black": 0.99 },
      options: { "Lightweight Sport Pack": { mod: 1.04, eur: 7000 }, "Carbon Interior": { mod: 1.03, eur: 5000 } },
      avoid: ["non-GT Turbo (different vehicle)", "heavy stone chips"],
    },
    confidence: 0.86, recommendedMaxLandedCost: 142000, minimumMargin: 22000,
    dataSources: { "mobile.de": 11, "AutoScout24": 5, "elferspot": 2 },
    lastUpdated: "2026-04-04T06:30:00Z",
  },
  {
    id: "ferrari-roma", make: "Ferrari", model: "Roma", yearRange: [2020, 2023], segment: "GRAND_TOURER", tracking: true,
    pricing: { medianEur: 235000, meanEur: 240000, p25Eur: 218000, p75Eur: 255000, minEur: 198000, maxEur: 285000, sampleSize: 22, dataFreshnessHours: 3.8 },
    trend: { direction: "STABLE", change30dPct: 0.3, change90dPct: -0.8, change180dPct: 2.1, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 74, avgDaysOnMarket: 26, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 5, newListingsLast7d: 2 },
    specPremiums: {
      colors: { "Blu Pozzi": 1.08, "Rosso Portofino": 1.04, "Grigio Titanio": 1.01, "Nero": 0.98 },
      options: { "Carbon Driving Zone": { mod: 1.03, eur: 6000 }, "Daytona Seats": { mod: 1.04, eur: 8000 }, "Full Leather": { mod: 1.02, eur: 4000 } },
      avoid: ["base interior spec", "aftermarket modifications"],
    },
    confidence: 0.88, recommendedMaxLandedCost: 185000, minimumMargin: 30000,
    dataSources: { "mobile.de": 12, "AutoScout24": 6, "ClassicDriver": 4 },
    lastUpdated: "2026-04-04T07:00:00Z",
  },
  {
    id: "maserati-mc20", make: "Maserati", model: "MC20", yearRange: [2021, 2023], segment: "EXOTIC", tracking: true,
    pricing: { medianEur: 198000, meanEur: 202000, p25Eur: 182000, p75Eur: 218000, minEur: 165000, maxEur: 245000, sampleSize: 11, dataFreshnessHours: 7.2 },
    trend: { direction: "DEPRECIATING", change30dPct: -3.2, change90dPct: -8.5, change180dPct: -15.2, seasonalFactor: "NEGATIVE" },
    demand: { velocityScore: 42, avgDaysOnMarket: 45, inquiryRate: "MODERATE", priceResilience: "WEAK", salesLast30d: 2, newListingsLast7d: 1 },
    specPremiums: {
      colors: { "Bianco Audace": 1.03, "Blu Infinito": 1.05, "Grigio Mistero": 1.01, "Nero Enigma": 0.99 },
      options: { "Carbon Fibre Pack": { mod: 1.04, eur: 7000 }, "Sport Exhaust": { mod: 1.02, eur: 3000 } },
      avoid: ["early build quality issues", "no warranty remaining"],
    },
    confidence: 0.76, recommendedMaxLandedCost: 148000, minimumMargin: 25000,
    dataSources: { "mobile.de": 7, "AutoScout24": 3, "ClassicDriver": 1 },
    lastUpdated: "2026-04-04T03:30:00Z",
  },
  {
    id: "amg-g63", make: "Mercedes-AMG", model: "G63", yearRange: [2020, 2023], segment: "SUV", tracking: true,
    pricing: { medianEur: 165000, meanEur: 170000, p25Eur: 148000, p75Eur: 188000, minEur: 128000, maxEur: 225000, sampleSize: 41, dataFreshnessHours: 2.5 },
    trend: { direction: "STABLE", change30dPct: -0.8, change90dPct: 0.5, change180dPct: -2.1, seasonalFactor: "NEUTRAL" },
    demand: { velocityScore: 82, avgDaysOnMarket: 18, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 9, newListingsLast7d: 4 },
    specPremiums: {
      colors: { "Obsidian Black": 1.01, "Polar White": 1.02, "Matte variants": 1.10, "Manufaktur colors": 1.15 },
      options: { "AMG Night Package": { mod: 1.03, eur: 4500 }, "Exclusive Interior Plus": { mod: 1.04, eur: 6000 }, "Rear Entertainment": { mod: 1.02, eur: 3000 } },
      avoid: ["Professional series (different market)", "heavily modified (Brabus etc)"],
    },
    confidence: 0.90, recommendedMaxLandedCost: 128000, minimumMargin: 22000,
    dataSources: { "mobile.de": 28, "AutoScout24": 10, "ClassicDriver": 3 },
    lastUpdated: "2026-04-04T08:00:00Z",
  },
  {
    id: "718-cayman-gt4", make: "Porsche", model: "718 Cayman GT4", yearRange: [2019, 2022], segment: "SPORTS", tracking: true,
    pricing: { medianEur: 98000, meanEur: 101000, p25Eur: 88000, p75Eur: 112000, minEur: 78000, maxEur: 128000, sampleSize: 26, dataFreshnessHours: 3.0 },
    trend: { direction: "APPRECIATING", change30dPct: 1.5, change90dPct: 4.2, change180dPct: 6.8, seasonalFactor: "POSITIVE" },
    demand: { velocityScore: 88, avgDaysOnMarket: 14, inquiryRate: "HIGH", priceResilience: "STRONG", salesLast30d: 7, newListingsLast7d: 3 },
    specPremiums: {
      colors: { "Racing Yellow": 1.05, "Miami Blue": 1.08, "Guards Red": 1.03, "GT Silver": 1.02, "Black": 0.97 },
      options: { "PCCB Ceramic Brakes": { mod: 1.06, eur: 5500 }, "Sport Chrono": { mod: 1.02, eur: 2000 }, "Clubsport Pack": { mod: 1.04, eur: 3500 }, "PDK": { mod: 0.95, eur: -5000 } },
      avoid: ["PDK (manual commands premium)", "track-heavy use", "aftermarket rollbar"],
    },
    confidence: 0.91, recommendedMaxLandedCost: 72000, minimumMargin: 15000,
    dataSources: { "mobile.de": 14, "elferspot": 8, "AutoScout24": 4 },
    lastUpdated: "2026-04-04T07:30:00Z",
  },
];

// ─── Competitor Intelligence ───
export const competitors = [
  { id: "hollmann", name: "Hollmann International", location: "Stuhr", inventory: 23, avgPrice: 195000, avgDaysOnMarket: 31, strategy: "PREMIUM", threatLevel: "MEDIUM", focus: "Exotics & Supercars" },
  { id: "luft-auto", name: "Luft Auto", location: "Munich", inventory: 15, avgPrice: 145000, avgDaysOnMarket: 28, strategy: "MID_RANGE", threatLevel: "LOW", focus: "Porsche & AMG" },
  { id: "saker", name: "Saker Sportscars", location: "Cologne", inventory: 8, avgPrice: 280000, avgDaysOnMarket: 45, strategy: "ULTRA_PREMIUM", threatLevel: "LOW", focus: "Rare Exotics" },
  { id: "munich-auto", name: "Munich Auto Gallery", location: "Munich", inventory: 31, avgPrice: 120000, avgDaysOnMarket: 22, strategy: "VOLUME", threatLevel: "HIGH", focus: "All Luxury" },
  { id: "stuttgart-elite", name: "Stuttgart Elite Cars", location: "Stuttgart", inventory: 18, avgPrice: 165000, avgDaysOnMarket: 19, strategy: "SPECIALIST", threatLevel: "MEDIUM", focus: "Porsche Only" },
  { id: "berlin-premium", name: "Berlin Premium Motors", location: "Berlin", inventory: 12, avgPrice: 155000, avgDaysOnMarket: 35, strategy: "MID_RANGE", threatLevel: "LOW", focus: "Mixed Luxury" },
];

// ─── Scan Log ───
export const scanLog = [
  { id: 1, timestamp: "2026-04-04T08:30:00Z", source: "mobile.de", listingsScanned: 142, newFound: 3, priceChanges: 12, duration: 23400, status: "SUCCESS" },
  { id: 2, timestamp: "2026-04-04T07:00:00Z", source: "ClassicDriver", listingsScanned: 38, newFound: 1, priceChanges: 2, duration: 8200, status: "SUCCESS" },
  { id: 3, timestamp: "2026-04-04T06:00:00Z", source: "AutoScout24", listingsScanned: 98, newFound: 4, priceChanges: 8, duration: 18600, status: "SUCCESS" },
  { id: 4, timestamp: "2026-04-04T05:00:00Z", source: "elferspot", listingsScanned: 45, newFound: 0, priceChanges: 3, duration: 42000, status: "PARTIAL" },
  { id: 5, timestamp: "2026-04-03T20:00:00Z", source: "mobile.de", listingsScanned: 139, newFound: 5, priceChanges: 15, duration: 21800, status: "SUCCESS" },
  { id: 6, timestamp: "2026-04-03T18:00:00Z", source: "AutoScout24", listingsScanned: 95, newFound: 2, priceChanges: 6, duration: 17200, status: "SUCCESS" },
  { id: 7, timestamp: "2026-04-03T14:00:00Z", source: "mobile.de", listingsScanned: 138, newFound: 4, priceChanges: 9, duration: 22100, status: "SUCCESS" },
  { id: 8, timestamp: "2026-04-03T12:00:00Z", source: "ClassicDriver", listingsScanned: 36, newFound: 0, priceChanges: 1, duration: 7800, status: "SUCCESS" },
];

// ─── Generate Price Histories ───
export const priceHistories = {};
trackedModels.forEach((m) => {
  priceHistories[m.id] = generatePriceHistory(m.pricing.medianEur, 3, 90);
});
