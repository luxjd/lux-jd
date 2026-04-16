export const DATA_SOURCES = [
  { id: "mobile_de", name: "mobile.de", type: "PRIMARY", icon: "storefront" },
  { id: "autoscout24", name: "AutoScout24", type: "PRIMARY", icon: "language" },
  { id: "elferspot", name: "elferspot", type: "SPECIALIST", icon: "directions_car" },
  { id: "classicdriver", name: "ClassicDriver", type: "SPECIALIST", icon: "diamond" },
];

export const TRACKED_MODELS = [
  // Ferrari
  { id: "ferrari-488-gtb", make: "Ferrari", model: "488 GTB", yearRange: [2016, 2019], segment: "EXOTIC" },
  { id: "ferrari-f12", make: "Ferrari", model: "F12 Berlinetta", yearRange: [2013, 2017], segment: "EXOTIC" },
  { id: "ferrari-roma", make: "Ferrari", model: "Roma", yearRange: [2020, 2023], segment: "GRAND_TOURER" },
  // Mercedes-AMG
  { id: "amg-gt-r", make: "Mercedes-AMG", model: "GT R", yearRange: [2018, 2021], segment: "SPORTS" },
  { id: "amg-g63", make: "Mercedes-AMG", model: "G63", yearRange: [2020, 2023], segment: "SUV" },
  { id: "amg-c63", make: "Mercedes-AMG", model: "C63", yearRange: [2019, 2023], segment: "SPORTS" },
  { id: "amg-e63", make: "Mercedes-AMG", model: "E63", yearRange: [2018, 2022], segment: "SPORTS" },
  // Porsche
  { id: "porsche-911-gt3", make: "Porsche", model: "911 GT3 (992)", yearRange: [2021, 2023], segment: "SPORTS" },
  { id: "718-cayman-gt4", make: "Porsche", model: "718 Cayman GT4", yearRange: [2019, 2022], segment: "SPORTS" },
  { id: "cayenne-turbo-gt", make: "Porsche", model: "Cayenne Turbo GT", yearRange: [2022, 2024], segment: "SUV" },
  // Jaguar
  { id: "jaguar-f-type", make: "Jaguar", model: "F-Type R", yearRange: [2018, 2023], segment: "SPORTS" },
  // Bentley
  { id: "continental-gt", make: "Bentley", model: "Continental GT", yearRange: [2019, 2022], segment: "GRAND_TOURER" },
  // Lamborghini
  { id: "huracan-sto", make: "Lamborghini", model: "Huracan STO", yearRange: [2021, 2023], segment: "EXOTIC" },
  // Aston Martin
  { id: "db11-v12", make: "Aston Martin", model: "DB11 V12", yearRange: [2017, 2020], segment: "GRAND_TOURER" },
  { id: "aston-vantage", make: "Aston Martin", model: "Vantage", yearRange: [2019, 2023], segment: "SPORTS" },
  // BMW M
  { id: "m3-competition", make: "BMW", model: "M3 Competition", yearRange: [2021, 2023], segment: "SPORTS" },
  { id: "m4-competition", make: "BMW", model: "M4 Competition", yearRange: [2021, 2023], segment: "SPORTS" },
  // Range Rover
  { id: "rr-sport-svr", make: "Land Rover", model: "Range Rover Sport SVR", yearRange: [2018, 2022], segment: "SUV" },
  // Maserati
  { id: "maserati-mc20", make: "Maserati", model: "MC20", yearRange: [2021, 2023], segment: "EXOTIC" },
];

export const VELOCITY_LABELS = {
  90: { label: "Extreme", color: "text-emerald-300", bg: "bg-emerald-400/20" },
  70: { label: "High", color: "text-emerald-400", bg: "bg-emerald-400/15" },
  50: { label: "Moderate", color: "text-primary", bg: "bg-primary/15" },
  30: { label: "Low", color: "text-amber-400", bg: "bg-amber-400/15" },
  0:  { label: "Very Low", color: "text-red-400", bg: "bg-red-400/15" },
};

export function getVelocityStyle(score) {
  if (score >= 90) return VELOCITY_LABELS[90];
  if (score >= 70) return VELOCITY_LABELS[70];
  if (score >= 50) return VELOCITY_LABELS[50];
  if (score >= 30) return VELOCITY_LABELS[30];
  return VELOCITY_LABELS[0];
}

export function getFreshnessStatus(hoursAge) {
  if (hoursAge < 6) return { label: "Fresh", color: "text-emerald-400", dot: "bg-emerald-400" };
  if (hoursAge < 12) return { label: "Aging", color: "text-amber-400", dot: "bg-amber-400" };
  return { label: "Stale", color: "text-red-400", dot: "bg-red-400" };
}
