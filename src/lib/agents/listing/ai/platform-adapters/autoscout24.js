/**
 * AutoScout24 Classified Manager API adapter.
 *
 * Spec §6.3.2 step 5: "autoscout24.de — Secondary marketplace for cross-border
 * listings." AS24's dealer API uses OAuth2 client-credentials flow for a bearer
 * token, then REST/JSON endpoints scoped to a dealer ID.
 *
 * Same three-mode pattern as mobile-de.js: `simulation` (default, no network),
 * `dry_run` (build payload + log), `live` (real API call). Toggle with
 * LISTING_PUBLISH_MODE env var.
 */

const AS24_TOKEN_URL = "https://auth.autoscout24.com/auth/realms/as24-clm/protocol/openid-connect/token";
const AS24_API_BASE = "https://api.autoscout24.com/classifieds/v1";

function getMode() {
  const mode = (process.env.LISTING_PUBLISH_MODE || "simulation").toLowerCase();
  return ["simulation", "dry_run", "live"].includes(mode) ? mode : "simulation";
}

function getCredentials() {
  return {
    clientId: process.env.AUTOSCOUT24_CLIENT_ID || "",
    clientSecret: process.env.AUTOSCOUT24_CLIENT_SECRET || "",
    dealerId: process.env.AUTOSCOUT24_DEALER_ID || "",
  };
}

export function isConfigured() {
  const { clientId, clientSecret, dealerId } = getCredentials();
  return Boolean(clientId && clientSecret && dealerId);
}

let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(AS24_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AutoScout24 token endpoint returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const expiresAt = Date.now() + ((data.expires_in || 300) * 1000);
  cachedToken = { token: data.access_token, expiresAt };
  return data.access_token;
}

function buildPayload(vehicle, content, pricing) {
  return {
    dealerReference: `luxjd-${vehicle.id || Date.now()}`,
    vehicleType: "Car",
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    firstRegistrationDate: `${vehicle.year}-01-01`,
    mileage: vehicle.mileageKm,
    bodyColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    steeringWheelSide: (vehicle.driveSide || "LHD") === "RHD" ? "RIGHT" : "LEFT",
    fuel: vehicle.fuel || "GASOLINE",
    transmission: vehicle.transmission || "AUTOMATIC",
    powerKw: vehicle.powerKw,
    displacement: vehicle.engineCapacityCc,
    condition: "USED",
    accidentFree: !vehicle.accidentHistory,
    price: {
      amount: pricing?.initial_price_eur || pricing?.currentPrice || 0,
      currency: "EUR",
      vatDeductible: false,
    },
    description: {
      de: content?.autoscout24?.description_de || "",
      en: content?.autoscout24?.description_en || "",
    },
    title: {
      de: content?.autoscout24?.title_de || `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
      en: content?.autoscout24?.title_en || `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
    },
    highlights: content?.autoscout24?.highlights || [],
    images: (vehicle.photoUrls || []).slice(0, 40).map((url) => ({ url })),
  };
}

function simulationResult(vehicle, pricing, reason) {
  const listingId = `AS24-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `${vehicle.make}-${vehicle.model}-${vehicle.year}`
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "");
  return {
    status: "PUBLISHED",
    mode: "simulation",
    simulationReason: reason || "simulation mode active",
    listingId,
    listingUrl: `https://www.autoscout24.de/angebote/${slug}-${listingId}`,
    platform: "AutoScout24",
    price: pricing?.initial_price_eur || 0,
    currency: "EUR",
  };
}

export async function publish(vehicle, content, pricing) {
  const mode = getMode();
  const configured = isConfigured();

  if (mode === "simulation" || !configured) {
    return simulationResult(vehicle, pricing, !configured ? "credentials not configured" : "LISTING_PUBLISH_MODE=simulation");
  }

  const { dealerId } = getCredentials();
  const payload = buildPayload(vehicle, content, pricing);
  const url = `${AS24_API_BASE}/dealers/${encodeURIComponent(dealerId)}/listings`;

  if (mode === "dry_run") {
    console.log(`[autoscout24:dry_run] POST ${url}`, JSON.stringify(payload).slice(0, 400));
    return {
      status: "DRY_RUN",
      mode: "dry_run",
      listingId: payload.dealerReference,
      listingUrl: `${url}/${payload.dealerReference}`,
      platform: "AutoScout24",
      price: payload.price.amount,
      currency: "EUR",
      payloadBytes: JSON.stringify(payload).length,
    };
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        status: "FAILED",
        mode: "live",
        error: `AutoScout24 returned ${res.status}`,
        details: body.slice(0, 500),
        platform: "AutoScout24",
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      status: "PUBLISHED",
      mode: "live",
      listingId: data.listingId || data.id || payload.dealerReference,
      listingUrl: data.publicUrl || `https://www.autoscout24.de/angebote/${data.listingId || payload.dealerReference}`,
      platform: "AutoScout24",
      price: payload.price.amount,
      currency: "EUR",
      dealerReference: payload.dealerReference,
      apiResponse: { id: data.id, status: data.status },
    };
  } catch (err) {
    return {
      status: "FAILED",
      mode: "live",
      error: `AutoScout24 call threw: ${err.message}`,
      platform: "AutoScout24",
    };
  }
}

export async function updatePrice(listingId, newPriceEur) {
  const mode = getMode();
  if (mode === "simulation" || !isConfigured()) {
    return { ok: true, mode: "simulation", listingId, newPrice: newPriceEur };
  }
  const { dealerId } = getCredentials();
  const url = `${AS24_API_BASE}/dealers/${encodeURIComponent(dealerId)}/listings/${encodeURIComponent(listingId)}`;

  if (mode === "dry_run") {
    console.log(`[autoscout24:dry_run] PATCH price ${newPriceEur} → ${url}`);
    return { ok: true, mode: "dry_run", listingId, newPrice: newPriceEur };
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ price: { amount: newPriceEur, currency: "EUR" } }),
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, mode: "live", listingId, newPrice: newPriceEur, status: res.status };
  } catch (err) {
    return { ok: false, mode: "live", error: err.message, listingId };
  }
}
