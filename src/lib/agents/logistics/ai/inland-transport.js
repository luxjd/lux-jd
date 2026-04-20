/**
 * Inland Transport — enclosed vehicle movement within Germany.
 *
 * Spec §6.5.2: "Arrange enclosed vehicle transport for all movements within
 * Germany (port to workshop, workshop to storage, storage to buyer). Never
 * expose a €100,000+ vehicle to open transport or weather risk."
 *
 * All three docx-mandated legs are supported:
 *   - PORT_TO_WORKSHOP      — fired on CUSTOMS → WORKSHOP
 *   - WORKSHOP_TO_STORAGE   — fired on TUV → READY_FOR_SALE
 *   - STORAGE_TO_BUYER      — fired by Listing/Sale flow after a sale closes
 *
 * The carrier database + distance table cover major German cities; unknown
 * destinations fall back to a 500 km default so the booking is always
 * quotable (real fulfillment would reconcile against the carrier's live quote).
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

const VALID_LEG_TYPES = ["PORT_TO_WORKSHOP", "WORKSHOP_TO_STORAGE", "STORAGE_TO_BUYER"];

/**
 * Build an inland-transport booking for a leg of the German journey.
 * Enclosed transport is non-negotiable per spec §6.5.2.
 *
 * @param {object} vehicle
 * @param {"PORT_TO_WORKSHOP"|"WORKSHOP_TO_STORAGE"|"STORAGE_TO_BUYER"} legType
 * @param {string} fromLocation — city name (must exist in DISTANCE_KM or options.distanceKm supplied)
 * @param {string} toLocation   — city name (or arbitrary buyer address city for STORAGE_TO_BUYER)
 * @param {object} [options]
 * @param {number} [options.distanceKm] — explicit km override when cities aren't in the table
 * @param {object} [options.carrier]
 * @param {string} [options.scheduledDeparture]
 * @param {string} [options.buyerReference] — sale/invoice id for STORAGE_TO_BUYER
 */
export function bookInlandTransport(vehicle, legType, fromLocation, toLocation, options = {}) {
  if (!VALID_LEG_TYPES.includes(legType)) {
    throw new Error(`Invalid legType: ${legType}. Must be one of: ${VALID_LEG_TYPES.join(", ")}`);
  }
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
    legType,
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
    buyerReference: legType === "STORAGE_TO_BUYER" ? (options.buyerReference || null) : null,
    status: "BOOKED",
    bookedAt: new Date().toISOString(),
  };
}

/**
 * Book the storage→buyer delivery leg. Fired by the Listing/Sale flow after
 * a sale closes. Docx §6.5.2 lists "storage to buyer" as the third mandatory
 * German-soil leg; it must also be enclosed (no weather / no open transport).
 *
 * @param {object} vehicle
 * @param {string} storageCity       — where the vehicle currently is (e.g. "Hamburg")
 * @param {string} buyerDeliveryCity — buyer's city (German or EU-wide)
 * @param {object} [options]
 * @param {string} [options.saleReference] — invoice / sale id
 * @param {string} [options.scheduledDeparture]
 * @param {number} [options.distanceKm] — explicit km when destination isn't in the table
 */
export function bookDeliveryToBuyer(vehicle, storageCity, buyerDeliveryCity, options = {}) {
  return bookInlandTransport(
    vehicle,
    "STORAGE_TO_BUYER",
    storageCity,
    buyerDeliveryCity,
    {
      ...options,
      buyerReference: options.saleReference || options.buyerReference || null,
    }
  );
}

/** Default origin city for the port-to-workshop leg, based on the arrival port. */
export function defaultWorkshopOrigin(destinationPort) {
  if (!destinationPort) return "Bremerhaven";
  if (/bremerhaven/i.test(destinationPort)) return "Bremerhaven";
  if (/hamburg/i.test(destinationPort)) return "Hamburg";
  return destinationPort;
}

export { VALID_LEG_TYPES };
