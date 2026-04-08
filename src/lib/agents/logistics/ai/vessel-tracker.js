/**
 * Vessel Tracker — real-time vessel position tracking via AIS data.
 *
 * Uses MarineTraffic API for live vessel positions.
 * Free tier: 100 requests/day — sufficient for hourly checks on active shipments.
 *
 * Fallback: route-based estimation if API unavailable.
 */

const MARINETRAFFIC_API = "https://services.marinetraffic.com/api/exportvessel/v:8";

/**
 * Get live vessel position from MarineTraffic AIS data.
 * @param {string} vesselName — e.g. "HARMONY LEADER"
 * @returns {object|null} Vessel position data
 */
export async function getVesselPosition(vesselName) {
  const apiKey = process.env.MARINETRAFFIC_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch(
        `${MARINETRAFFIC_API}/${apiKey}/shipname:${encodeURIComponent(vesselName)}/protocol:jsono`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.length > 0) {
          const v = data[0];
          return {
            source: "MARINETRAFFIC_AIS",
            live: true,
            lat: parseFloat(v.LAT),
            lon: parseFloat(v.LON),
            speed: parseFloat(v.SPEED) / 10, // Speed in knots (API returns x10)
            course: parseFloat(v.COURSE),
            status: v.STATUS,
            destination: v.DESTINATION,
            eta: v.ETA,
            lastUpdate: v.TIMESTAMP,
            mmsi: v.MMSI,
            imo: v.IMO,
            flag: v.FLAG,
          };
        }
      }
    } catch (err) {
      console.warn("MarineTraffic API failed:", err.message);
    }
  }

  // Fallback: no live tracking available
  return null;
}

/**
 * Track a shipment — combines live AIS data with route-based estimation.
 * @param {object} shipment — shipment record from storage
 * @returns {object} Full tracking data with position, progress, and ETA
 */
export function trackShipment(shipment) {
  const departure = new Date(shipment.dates.departureDate);
  const estimatedArrival = new Date(shipment.dates.estimatedArrival);
  const now = new Date();

  const totalMs = estimatedArrival - departure;
  const elapsedMs = now - departure;
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const daysElapsed = Math.round(elapsedMs / (1000 * 60 * 60 * 24));
  const daysTotal = Math.round(totalMs / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  // Route waypoints for position estimation
  const waypoints = [
    { pct: 0, lat: 35.45, lon: 139.65, label: "Yokohama, Japan" },
    { pct: 8, lat: 33.0, lon: 135.0, label: "Pacific Ocean (off Shikoku)" },
    { pct: 18, lat: 25.0, lon: 125.0, label: "East China Sea" },
    { pct: 28, lat: 15.0, lon: 110.0, label: "South China Sea" },
    { pct: 38, lat: 5.0, lon: 103.0, label: "Singapore Strait" },
    { pct: 48, lat: 5.0, lon: 80.0, label: "Indian Ocean (Sri Lanka)" },
    { pct: 58, lat: 12.5, lon: 45.0, label: "Gulf of Aden" },
    { pct: 65, lat: 30.0, lon: 32.5, label: "Suez Canal" },
    { pct: 72, lat: 35.0, lon: 18.0, label: "Mediterranean Sea" },
    { pct: 82, lat: 37.0, lon: -5.0, label: "Strait of Gibraltar" },
    { pct: 88, lat: 45.0, lon: -5.0, label: "Bay of Biscay" },
    { pct: 94, lat: 51.0, lon: 3.0, label: "English Channel / North Sea" },
    { pct: 100, lat: 53.54, lon: 8.58, label: "Bremerhaven, Germany" },
  ];

  // Interpolate position from waypoints
  let estimatedLat = waypoints[0].lat;
  let estimatedLon = waypoints[0].lon;
  let estimatedLabel = waypoints[0].label;

  for (let i = 1; i < waypoints.length; i++) {
    if (progressPct <= waypoints[i].pct) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const segmentProgress = (progressPct - prev.pct) / (curr.pct - prev.pct);
      estimatedLat = prev.lat + (curr.lat - prev.lat) * segmentProgress;
      estimatedLon = prev.lon + (curr.lon - prev.lon) * segmentProgress;
      estimatedLabel = curr.label;
      break;
    }
    if (i === waypoints.length - 1) {
      estimatedLat = waypoints[i].lat;
      estimatedLon = waypoints[i].lon;
      estimatedLabel = waypoints[i].label;
    }
  }

  const isArrived = now >= estimatedArrival || shipment.dates.actualArrival;
  const isDelayed = daysRemaining < 0 && !isArrived;

  return {
    shipmentId: shipment.shipmentId,
    vesselName: shipment.vesselName,
    containerId: shipment.containerId,
    route: shipment.route,

    progress: {
      percentage: Number(progressPct.toFixed(1)),
      daysElapsed,
      daysTotal,
      daysRemaining,
      isArrived,
      isDelayed,
    },

    position: {
      source: "ROUTE_ESTIMATION",
      live: false,
      lat: Number(estimatedLat.toFixed(4)),
      lon: Number(estimatedLon.toFixed(4)),
      label: estimatedLabel,
    },

    dates: {
      departed: shipment.dates.departureDate,
      estimatedArrival: shipment.dates.estimatedArrival,
      actualArrival: shipment.dates.actualArrival || null,
    },

    insurance: shipment.insurance,
    inspections: {
      preShip: shipment.preShipInspection,
      postArrival: shipment.postArrivalInspection,
    },
  };
}

/**
 * Enrich tracking with live AIS data if available.
 */
export async function trackShipmentLive(shipment) {
  const tracking = trackShipment(shipment);

  // Try live AIS data
  const livePosition = await getVesselPosition(shipment.vesselName);
  if (livePosition) {
    tracking.position = livePosition;
  }

  return tracking;
}
