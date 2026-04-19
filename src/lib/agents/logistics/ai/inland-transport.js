/**
 * Inland Transport — enclosed vehicle movement within Germany.
 *
 * Spec §6.5.2: "Arrange enclosed vehicle transport for all movements within
 * Germany (port to workshop, workshop to storage, storage to buyer). Never
 * expose a €100,000+ vehicle to open transport or weather risk."
 *
 * Scope: two legs inside the Logistics agent's lifecycle — port→workshop on
 * CUSTOMS → WORKSHOP, and workshop→storage on TUV → READY_FOR_SALE. The
 * storage→buyer leg is handed off to the Listing agent after sale.
 */

// German carriers that specialise in enclosed luxury/exotic transport.
const GERMAN_ENCLOSED_CARRIERS = [
  { id: "schmidt-enclosed", name: "Schmidt Autotransport GmbH", specialty: "Enclosed luxury", coverage: "Germany-wide", avgEurPerKm: 1.80, contact: "dispatch@schmidt-autotransport.de" },
  { id: "bluewater-exotic", name: "Bluewater Exotic Logistics", specialty: "Exotic/supercar", coverage: "Hamburg–Bremen–Munich–Stuttgart", avgEurPerKm: 2.10, contact: "ops@bluewater-exotic.de" },
  { id: "paul-enclosed", name: "Paul Fahrzeuglogistik", specialty: "Porsche/Mercedes dealer network", coverage: "Stuttgart–Munich–Frankfurt", avgEurPerKm: 1.90, contact: "transport@paul-fahrzeug.de" },
  { id: "gtue-enclosed", name: "GTÜ Enclosed Transport", specialty: "Northern Germany enclosed", coverage: "Bremerhaven–Hamburg–Berlin", avgEurPerKm: 1.70, contact: "enclosed@gtue-transport.de" },
];

// Rough kilometre estimates between common luxury-import locations.
// Only needs to be directionally right — real bookings would use the carrier's quote.
const DISTANCE_KM = {
  "Bremerhaven|Bremen": 65, "Bremerhaven|Hamburg": 130, "Bremerhaven|Munich": 785,
  "Bremerhaven|Stuttgart": 645, "Bremerhaven|Frankfurt": 460, "Bremerhaven|Cologne": 400,
  "Hamburg|Bremen": 125, "Hamburg|Munich": 775, "Hamburg|Stuttgart": 670,
  "Hamburg|Frankfurt": 490, "Hamburg|Cologne": 430,
  "Bremen|Munich": 765, "Bremen|Stuttgart": 625, "Bremen|Frankfurt": 440,
  "Munich|Stuttgart": 230, "Munich|Frankfurt": 390, "Munich|Cologne": 570,
  "Stuttgart|Frankfurt": 205, "Stuttgart|Cologne": 370,
};

function estimateDistanceKm(from, to) {
  if (!from || !to) return 500;
  const a = `${from}|${to}`;
  const b = `${to}|${from}`;
  return DISTANCE_KM[a] || DISTANCE_KM[b] || 500;
}

function selectCarrier(fromLocation, toLocation, vehicle) {
  const make = (vehicle?.make || "").toLowerCase();
  // Prefer a specialist that matches the brand when available.
  const preferred = GERMAN_ENCLOSED_CARRIERS.find((c) =>
    c.specialty.toLowerCase().includes(make.split(/[-\s]/)[0])
  );
  return preferred || GERMAN_ENCLOSED_CARRIERS[0];
}

/**
 * Build an inland-transport booking for a leg of the German journey.
 * Enclosed transport is non-negotiable per spec §6.5.2.
 */
export function bookInlandTransport(vehicle, legType, fromLocation, toLocation, options = {}) {
  const carrier = options.carrier || selectCarrier(fromLocation, toLocation, vehicle);
  const distanceKm = options.distanceKm || estimateDistanceKm(fromLocation, toLocation);
  const estimatedCostEur = Math.round(distanceKm * carrier.avgEurPerKm);
  const estimatedDurationHours = Math.max(2, Math.round(distanceKm / 80));

  const scheduledDeparture = options.scheduledDeparture || new Date().toISOString();
  const scheduledArrival = new Date(
    new Date(scheduledDeparture).getTime() + estimatedDurationHours * 60 * 60 * 1000
  ).toISOString();

  return {
    transportId: `INT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    vehicleId: vehicle.id,
    legType, // PORT_TO_WORKSHOP | WORKSHOP_TO_STORAGE
    fromLocation,
    toLocation,
    enclosed: true, // Spec §6.5.2 — never open transport for luxury
    carrier: {
      id: carrier.id,
      name: carrier.name,
      contact: carrier.contact,
      specialty: carrier.specialty,
    },
    estimate: {
      distanceKm,
      costEur: estimatedCostEur,
      durationHours: estimatedDurationHours,
    },
    schedule: {
      scheduledDeparture,
      scheduledArrival,
      actualDeparture: null,
      actualArrival: null,
    },
    status: "BOOKED",
    bookedAt: new Date().toISOString(),
  };
}

/** Default origin city for the port-to-workshop leg, based on the arrival port. */
export function defaultWorkshopOrigin(destinationPort) {
  if (!destinationPort) return "Bremerhaven";
  if (/bremerhaven/i.test(destinationPort)) return "Bremerhaven";
  if (/hamburg/i.test(destinationPort)) return "Hamburg";
  return destinationPort;
}
