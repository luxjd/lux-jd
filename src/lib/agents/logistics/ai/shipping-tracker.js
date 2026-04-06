/**
 * Shipping Tracker — tracks vessel movements and calculates ETAs.
 *
 * In production v2: integrate with MarineTraffic API or VesselFinder API
 * for real AIS vessel tracking.
 *
 * v1: Uses route-based calculations + Claude for intelligent ETA adjustments.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { SHIPPING_ROUTES } from "../pipeline";

/**
 * Create a shipment record for a vehicle.
 */
export function createShipment(vehicle, options = {}) {
  const origin = options.originPort || "Yokohama";
  const destination = options.destinationPort || "Bremerhaven";
  const routeKey = `${origin}→${destination}`;
  const route = SHIPPING_ROUTES[routeKey] || SHIPPING_ROUTES["Yokohama→Bremerhaven"];

  const departureDate = options.departureDate || new Date();
  const arrivalDate = new Date(departureDate);
  arrivalDate.setDate(arrivalDate.getDate() + route.days);

  // Generate a realistic vessel name
  const vessels = ["MV Pacific Star", "MV Harmony Leader", "MV Grand Pioneer", "MV Noble Express", "MV Tranquil Bay", "MV Century Highway", "MV Heroic Leader", "MV Ocean Ace"];
  const vessel = options.vesselName || vessels[Math.floor(Math.random() * vessels.length)];

  // Container ID
  const containerId = options.containerId || `LUXJD${Date.now().toString().slice(-6)}`;

  // Shipping method
  const isDedicated = (vehicle.landedCostEur || vehicle.estimatedSaleEur || 100000) > 100000;

  return {
    shipmentId: `SHP-${Date.now()}`,
    vehicleId: vehicle.id,
    vesselName: vessel,
    containerId,
    containerType: isDedicated ? "DEDICATED_20FT" : "SHARED_20FT",
    route: {
      origin,
      destination,
      routeKey,
      carrier: route.carrier,
      estimatedTransitDays: route.days,
    },
    dates: {
      departureDate: new Date(departureDate).toISOString(),
      estimatedArrival: arrivalDate.toISOString(),
      actualArrival: null,
    },
    insurance: {
      type: "ALL_RISK",
      coveragePercent: 110,
      provider: "Allianz Marine",
      policyNumber: `ALZ-${Date.now().toString().slice(-8)}`,
    },
    preShipInspection: {
      completed: false,
      photos: [],
      odometerReading: vehicle.mileageKm || null,
      conditionNotes: null,
      inspectedAt: null,
    },
    postArrivalInspection: {
      completed: false,
      photos: [],
      odometerReading: null,
      conditionNotes: null,
      damageDetected: false,
      inspectedAt: null,
    },
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Calculate current position and progress of a shipment.
 */
export function getShipmentProgress(shipment) {
  const departure = new Date(shipment.dates.departureDate);
  const arrival = new Date(shipment.dates.estimatedArrival);
  const now = new Date();

  const totalDays = (arrival - departure) / (1000 * 60 * 60 * 24);
  const elapsedDays = (now - departure) / (1000 * 60 * 60 * 24);
  const progressPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const daysRemaining = Math.max(0, Math.ceil((arrival - now) / (1000 * 60 * 60 * 24)));

  return {
    progressPct: Number(progressPct.toFixed(1)),
    elapsedDays: Math.round(elapsedDays),
    totalDays: Math.round(totalDays),
    daysRemaining,
    isArrived: now >= arrival,
    isDelayed: daysRemaining < 0,
    estimatedPosition: getEstimatedPosition(progressPct),
  };
}

function getEstimatedPosition(progressPct) {
  if (progressPct < 5) return "Departing Japanese port";
  if (progressPct < 15) return "Pacific Ocean (Western)";
  if (progressPct < 30) return "Pacific Ocean (Central)";
  if (progressPct < 45) return "Approaching Singapore Strait";
  if (progressPct < 55) return "Indian Ocean";
  if (progressPct < 70) return "Approaching Suez Canal";
  if (progressPct < 80) return "Mediterranean Sea";
  if (progressPct < 90) return "Atlantic Ocean / Bay of Biscay";
  if (progressPct < 98) return "North Sea / Approaching Bremerhaven";
  return "At destination port";
}

/**
 * AI-powered ETA adjustment based on conditions.
 */
export async function getIntelligentETA(shipment) {
  if (!isAIAvailable()) return null;

  const progress = getShipmentProgress(shipment);

  const result = await callClaude({
    prompt: `A vehicle shipment is en route:
Route: ${shipment.route.origin} → ${shipment.route.destination}
Vessel: ${shipment.vesselName}
Departed: ${shipment.dates.departureDate}
Original ETA: ${shipment.dates.estimatedArrival}
Current progress: ${progress.progressPct}% (Day ${progress.elapsedDays} of ${progress.totalDays})
Season: April 2026

Consider: typical weather conditions for April on this route, port congestion at ${shipment.route.destination}, common delay factors.

Return ONLY valid JSON:
{
  "adjusted_eta": "<ISO date>",
  "delay_days": <integer positive or negative>,
  "confidence": <float 0-1>,
  "factors": ["factor 1", "factor 2"],
  "risk_assessment": "LOW or MEDIUM or HIGH",
  "notes": "1 sentence summary"
}`,
    system: "You are a maritime logistics expert specializing in vehicle shipping from Japan to Europe.",
    jsonMode: true,
  });

  return result;
}
