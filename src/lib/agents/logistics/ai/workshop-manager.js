/**
 * Workshop Manager — specialist workshop database + modification coordination.
 *
 * Spec §6.5.2.3 (TÜV Process Management):
 *   "Schedule appointments in advance and coordinate with specialist workshops
 *    if modifications are needed."
 *
 * Flow (typical luxury-import case where TÜV pre-assessment returns a list of
 * `modifications_required`):
 *
 *   1. TÜV pre-assessment runs (see tuv-manager.js generateTuvAssessment).
 *   2. If `modifications_required` is non-empty, the Orchestrator/UI calls
 *      `coordinateWorkshopBookings(vehicle, tuvAssessment, tuvAppointment)`.
 *   3. This module:
 *        - Classifies each modification into a capability (headlight conversion,
 *          speedometer swap, emissions retrofit, exhaust cert, TPMS retrofit,
 *          underbody protection, custom fab).
 *        - Scores workshops by brand specialty + capability coverage + rating
 *          − wait time.
 *        - Builds a schedule that completes the mods BEFORE the TÜV appointment
 *          (with a 2-day buffer).
 *   4. The booking is returned to the caller for persistence and operator
 *      confirmation. Real carrier dispatch is out of scope here — the booking
 *      record is the hand-off artifact.
 */

// Curated specialist workshops for TÜV modification work in Germany.
// All real organization types (brand dealer services, specialist import shops)
// — the names/contacts are directional and should be reconciled against real
// operator agreements before production use.
export const MODIFICATION_WORKSHOPS = [
  {
    id: "porsche-classic-stuttgart",
    name: "Porsche Classic Stuttgart",
    city: "Stuttgart",
    rating: 4.9,
    specialties: ["Porsche"],
    capabilities: ["headlight_conversion", "emissions_retrofit", "tpms_retrofit", "exhaust_certification", "speedometer_swap"],
    avgWaitDays: 10,
    eurPerHour: 220,
    contact: "classic@porsche-stuttgart.de",
  },
  {
    id: "amg-performance-affalterbach",
    name: "AMG Performance Center Affalterbach",
    city: "Affalterbach",
    rating: 4.9,
    specialties: ["Mercedes-AMG", "Mercedes-Benz"],
    capabilities: ["headlight_conversion", "emissions_retrofit", "tpms_retrofit", "speedometer_swap", "underbody_protection"],
    avgWaitDays: 12,
    eurPerHour: 200,
    contact: "service@amg-affalterbach.de",
  },
  {
    id: "ferrari-roma-official-service",
    name: "Ferrari Official Service",
    city: "Rome",
    rating: 4.9,
    specialties: ["Ferrari"],
    capabilities: ["headlight_conversion", "emissions_retrofit", "exhaust_certification", "custom_fabrication"],
    avgWaitDays: 14,
    eurPerHour: 240,
    contact: "service@ferrari-official.de",
  },
  {
    id: "bmw-m-gmbh-munich",
    name: "BMW M GmbH Service",
    city: "Munich",
    rating: 4.8,
    specialties: ["BMW M", "BMW"],
    capabilities: ["headlight_conversion", "emissions_retrofit", "tpms_retrofit", "speedometer_swap"],
    avgWaitDays: 9,
    eurPerHour: 195,
    contact: "service@bmw-m.de",
  },
  {
    id: "exotic-garage-munich",
    name: "Exotic Garage Munich",
    city: "Munich",
    rating: 4.7,
    specialties: ["Ferrari", "Lamborghini", "Aston Martin", "McLaren", "Bentley"],
    capabilities: ["headlight_conversion", "exhaust_certification", "speedometer_swap", "custom_fabrication", "underbody_protection"],
    avgWaitDays: 8,
    eurPerHour: 190,
    contact: "info@exotic-garage-munich.de",
  },
  {
    id: "luxury-motors-bremen",
    name: "Luxury Motors Bremen",
    city: "Bremen",
    rating: 4.6,
    specialties: ["Ferrari", "Lamborghini", "Porsche", "Bentley"],
    capabilities: ["headlight_conversion", "speedometer_swap", "exhaust_certification", "underbody_protection"],
    avgWaitDays: 7,
    eurPerHour: 180,
    contact: "shop@luxurymotors-bremen.de",
  },
  {
    id: "import-specialists-hamburg",
    name: "Import Specialists Hamburg",
    city: "Hamburg",
    rating: 4.5,
    specialties: ["All luxury imports", "Japanese imports"],
    capabilities: ["headlight_conversion", "emissions_retrofit", "tpms_retrofit", "speedometer_swap", "exhaust_certification", "underbody_protection", "custom_fabrication"],
    avgWaitDays: 5,
    eurPerHour: 160,
    contact: "service@import-specialists-hamburg.de",
  },
];

// Keyword patterns used to classify free-text modification items (as emitted
// by the TÜV pre-assessment LLM) into structured capabilities.
const MOD_KEYWORDS = {
  headlight_conversion: /headlight|head.?lamp|scheinwerfer|xenon|LED.*conv|beam.*pattern/i,
  speedometer_swap: /speedometer|tachometer|km.?h|mph|dash.*speed/i,
  emissions_retrofit: /emission|particulate|catalyst|euro.*[456]|DPF|exhaust.*emission/i,
  exhaust_certification: /exhaust|muffler|auspuff|resonator|db.*limit/i,
  tpms_retrofit: /TPMS|tire pressure|reifendruck/i,
  underbody_protection: /underbody|underfloor|unterboden|skid.*plate/i,
  custom_fabrication: /custom|fabricat|bracket|mount|weld/i,
};

function classifyModification(item) {
  const text = String(item || "").toLowerCase();
  for (const [cap, re] of Object.entries(MOD_KEYWORDS)) {
    if (re.test(text)) return cap;
  }
  return "custom_fabrication";
}

/**
 * Recommend the best-fit workshop for a vehicle's modification list.
 * Scoring: brand specialty (up to +40) + capability coverage (up to +40) +
 * rating (×4) − wait time (×1.5).
 */
export function recommendWorkshop(vehicle, modifications, preferredCity = null) {
  const mods = Array.isArray(modifications) ? modifications : [];
  const requiredCaps = [...new Set(mods.map((m) => classifyModification(m?.item || m)))];
  const make = String(vehicle?.make || "");

  let candidates = [...MODIFICATION_WORKSHOPS];
  if (preferredCity) {
    const local = candidates.filter((w) => w.city.toLowerCase() === preferredCity.toLowerCase());
    if (local.length > 0) candidates = local;
  }

  const scored = candidates.map((w) => {
    let score = 0;
    if (w.specialties.some((s) => make.includes(s))) score += 40;
    else if (w.specialties.some((s) => /all.*imports|japanese/i.test(s))) score += 15;
    const covered = requiredCaps.filter((c) => w.capabilities.includes(c)).length;
    const coverage = requiredCaps.length > 0 ? covered / requiredCaps.length : 1;
    score += coverage * 40;
    score += w.rating * 4;
    score -= w.avgWaitDays * 1.5;
    return { ...w, score: Number(score.toFixed(1)), capabilityCoverage: coverage };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Coordinate modification workshop bookings ahead of the TÜV appointment.
 *
 * @param {object} vehicle
 * @param {object} tuvAssessment — output of tuv-manager.generateTuvAssessment()
 * @param {object} [tuvAppointment] — output of tuv-manager.scheduleTuvAppointment()
 * @param {object} [options]
 * @param {object} [options.workshop] — override workshop choice
 * @param {string} [options.preferredCity]
 * @param {number} [options.bufferDaysBeforeTuv=2] — completion-to-TÜV buffer
 * @returns {object} Workshop booking record (or `{required: false}` if no mods)
 */
export function coordinateWorkshopBookings(vehicle, tuvAssessment, tuvAppointment = null, options = {}) {
  const mods = Array.isArray(tuvAssessment?.modifications_required)
    ? tuvAssessment.modifications_required
    : [];

  if (mods.length === 0) {
    return {
      required: false,
      reason: "No modifications required per TÜV pre-assessment",
      bookings: [],
    };
  }

  const workshop = options.workshop || recommendWorkshop(vehicle, mods, options.preferredCity);
  const bufferDays = Number.isFinite(options.bufferDaysBeforeTuv) ? options.bufferDaysBeforeTuv : 2;

  // Total labour-time estimate: sum of explicit `estimated_hours` or 4h each.
  const estimatedHours = mods.reduce((sum, m) => sum + (Number(m?.estimated_hours) || 4), 0);
  // Work days assume 6 productive labour hours/day.
  const estimatedWorkDays = Math.max(2, Math.ceil(estimatedHours / 6));
  const totalCostEur = mods.reduce((sum, m) => sum + (Number(m?.estimated_cost_eur) || 0), 0);

  // Work backwards from the TÜV appointment so the vehicle finishes in time.
  const tuvDate = tuvAppointment?.appointmentDate ? new Date(tuvAppointment.appointmentDate) : null;
  let scheduledStart;
  let scheduledComplete;
  if (tuvDate && !isNaN(tuvDate.getTime())) {
    const completeBy = new Date(tuvDate.getTime() - bufferDays * 24 * 60 * 60 * 1000);
    const start = new Date(completeBy.getTime() - estimatedWorkDays * 24 * 60 * 60 * 1000);
    scheduledStart = start.toISOString();
    scheduledComplete = completeBy.toISOString();
  } else {
    // No TÜV date yet — schedule from today + workshop lead time.
    const start = new Date(Date.now() + workshop.avgWaitDays * 24 * 60 * 60 * 1000);
    scheduledStart = start.toISOString();
    scheduledComplete = new Date(start.getTime() + estimatedWorkDays * 24 * 60 * 60 * 1000).toISOString();
  }

  return {
    required: true,
    bookingId: `WS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    vehicleId: vehicle?.id,
    workshop: {
      id: workshop.id,
      name: workshop.name,
      city: workshop.city,
      contact: workshop.contact,
      specialty: workshop.specialties.join(", "),
      rating: workshop.rating,
      capabilityCoverage: Number((workshop.capabilityCoverage || 0).toFixed(2)),
    },
    modifications: mods.map((m) => ({
      item: m?.item || String(m),
      capability: classifyModification(m?.item || m),
      estimatedCostEur: Number(m?.estimated_cost_eur) || null,
      estimatedHours: Number(m?.estimated_hours) || 4,
      reason: m?.reason || null,
    })),
    schedule: {
      scheduledStart,
      scheduledComplete,
      tuvAppointmentDate: tuvDate ? tuvDate.toISOString() : null,
      workshopLeadTimeDays: workshop.avgWaitDays,
      estimatedWorkDays,
      bufferDaysBeforeTuv: bufferDays,
    },
    estimate: {
      totalCostEur,
      estimatedHours,
      hourlyRateEur: workshop.eurPerHour,
    },
    // If start-date is in the past, the TÜV appointment is too close and must
    // be re-scheduled to allow enough time for the modifications.
    feasible: new Date(scheduledStart).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
    infeasibleReason: new Date(scheduledStart).getTime() < Date.now() - 24 * 60 * 60 * 1000
      ? "TÜV appointment is too soon — reschedule to allow modification work"
      : null,
    status: "BOOKED",
    bookedAt: new Date().toISOString(),
  };
}

export { classifyModification };
