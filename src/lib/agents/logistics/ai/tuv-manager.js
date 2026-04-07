/**
 * TUV Manager — manages TUV Einzelabnahme process for imported vehicles.
 *
 * Maintains a database of TUV stations with exotic vehicle experience,
 * pre-assesses requirements, and generates inspection checklists.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

// TUV stations with luxury import experience
export const TUV_STATIONS = [
  { id: "tuv-rheinland-bremen", name: "TUV Rheinland Bremen", city: "Bremen", rating: 4.8, specialties: ["Ferrari", "Lamborghini", "Porsche"], avgWaitDays: 5, passRate: 94, contact: "bremen@tuv.com" },
  { id: "tuv-nord-hamburg", name: "TUV NORD Hamburg", city: "Hamburg", rating: 4.6, specialties: ["Mercedes-AMG", "BMW M", "Porsche"], avgWaitDays: 7, passRate: 91, contact: "hamburg@tuv-nord.de" },
  { id: "tuv-sued-munich", name: "TUV SUD Munich", city: "Munich", rating: 4.7, specialties: ["Ferrari", "Aston Martin", "Bentley"], avgWaitDays: 8, passRate: 92, contact: "muenchen@tuvsud.com" },
  { id: "tuv-rheinland-cologne", name: "TUV Rheinland Cologne", city: "Cologne", rating: 4.5, specialties: ["Porsche", "Mercedes-AMG", "Range Rover"], avgWaitDays: 6, passRate: 90, contact: "koeln@tuv.com" },
  { id: "dekra-stuttgart", name: "DEKRA Stuttgart", city: "Stuttgart", rating: 4.9, specialties: ["Porsche", "Mercedes-AMG"], avgWaitDays: 4, passRate: 96, contact: "stuttgart@dekra.com" },
  { id: "tuv-hessen-frankfurt", name: "TUV Hessen Frankfurt", city: "Frankfurt", rating: 4.4, specialties: ["BMW M", "Maserati", "Jaguar"], avgWaitDays: 6, passRate: 89, contact: "frankfurt@tuev-hessen.de" },
  { id: "gtue-bremerhaven", name: "GTU Bremerhaven", city: "Bremerhaven", rating: 4.3, specialties: ["All imports", "Japanese specialists"], avgWaitDays: 3, passRate: 88, contact: "bremerhaven@gtue.de" },
];

/**
 * Find the best TUV station for a specific vehicle.
 */
export function recommendStation(vehicle, preferredCity = null) {
  let candidates = [...TUV_STATIONS];

  // Filter by city if preferred
  if (preferredCity) {
    const cityMatches = candidates.filter((s) => s.city.toLowerCase() === preferredCity.toLowerCase());
    if (cityMatches.length > 0) candidates = cityMatches;
  }

  // Score by brand specialty match + pass rate + wait time
  const scored = candidates.map((station) => {
    let score = 0;
    if (station.specialties.some((s) => vehicle.make?.includes(s))) score += 30;
    score += station.passRate * 0.3;
    score -= station.avgWaitDays * 2;
    score += station.rating * 5;
    return { ...station, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Generate TUV pre-assessment and checklist for a vehicle.
 */
export async function generateTuvAssessment(vehicle) {
  if (!isAIAvailable()) {
    throw new Error("AI is required for TUV assessment. Configure OPENROUTER_API_KEY.");
  }

  const station = recommendStation(vehicle);

  const result = await callClaude({
    prompt: `Generate a TUV Einzelabnahme pre-assessment for this imported vehicle:

Vehicle: ${vehicle.make} ${vehicle.model} ${vehicle.year}
Engine: ${vehicle.engineSpec || "Standard"}
Drive Side: ${vehicle.driveSide}
Origin: Japan
EU Type Approval: ${isEuSpec(vehicle.make) ? "YES — EU WVTA likely available" : "May need individual approval"}
Mileage: ${vehicle.mileageKm?.toLocaleString()} km
Modifications: ${vehicle.modifications || "None known"}
CoC available: ${isEuSpec(vehicle.make) ? "Likely — contact manufacturer" : "Unlikely"}

Recommended station: ${station.name}, ${station.city}

Return ONLY valid JSON:
{
  "complexity": "LOW" or "MEDIUM" or "HIGH",
  "estimated_cost_eur": <integer>,
  "estimated_duration_hours": <integer>,
  "eu_type_approval": <boolean>,
  "coc_required": <boolean>,
  "coc_available": <boolean>,
  "modifications_required": [
    {"item": "<what needs changing>", "estimated_cost_eur": <integer>, "reason": "<why>"}
  ] or [],
  "checklist": [
    {"item": "<check item>", "category": "DOCUMENTS" or "TECHNICAL" or "SAFETY" or "EMISSIONS", "critical": <boolean>}
  ],
  "potential_issues": ["issue 1"] or [],
  "pass_probability_pct": <integer 0-100>,
  "recommended_station": "${station.name}",
  "recommended_station_city": "${station.city}",
  "appointment_lead_time_days": ${station.avgWaitDays},
  "notes": "1-2 sentence assessment"
}`,
    system: "You are a German vehicle technical inspection (TUV) specialist with expertise in importing European luxury vehicles from Japan back into Germany. You know EU type approval regulations, §21 StVZO requirements, and the Einzelabnahme process.",
    jsonMode: true,
  });

  if (!result) throw new Error("TUV assessment failed — no response from AI.");

  return {
    ...result,
    vehicleId: vehicle.id,
    stationDetails: station,
    assessedAt: new Date().toISOString(),
    aiPowered: true,
  };
}

function isEuSpec(make) {
  return ["Ferrari", "Mercedes-AMG", "Porsche", "Lamborghini", "Bentley", "Aston Martin", "BMW M", "BMW", "Maserati", "Jaguar", "Range Rover"].some((b) => make?.includes(b));
}

/**
 * Schedule a TUV appointment (simulated).
 */
export function scheduleTuvAppointment(vehicle, station, preferredDate = null) {
  const appointmentDate = preferredDate
    ? new Date(preferredDate)
    : new Date(Date.now() + station.avgWaitDays * 24 * 60 * 60 * 1000);

  return {
    appointmentId: `TUV-${Date.now()}`,
    vehicleId: vehicle.id,
    station: { id: station.id, name: station.name, city: station.city, contact: station.contact },
    appointmentDate: appointmentDate.toISOString(),
    estimatedDuration: "2-3 hours",
    status: "SCHEDULED",
    scheduledAt: new Date().toISOString(),
  };
}
