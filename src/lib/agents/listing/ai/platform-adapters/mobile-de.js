/**
 * mobile.de Seller API adapter.
 *
 * Spec §6.3.2 step 5: "mobile.de (dealer account) — Dealer account enables API
 * integration for automated listing management."
 *
 * API shape used here is the mobile.de Seller API (services.mobile.de/seller-api)
 * with HTTP Basic auth against the dealer's API credentials:
 *   - PUT  /ads/mine/{customerNumber}/ads/{customerAdReference} — create/update
 *   - GET  /ads/mine/{customerNumber}/ads/{customerAdReference} — fetch
 *   - PUT  /ads/mine/{customerNumber}/ads/{customerAdReference} with updated
 *          price node — price change
 *   - DELETE /ads/mine/{customerNumber}/ads/{customerAdReference} — unlist
 *
 * Three operating modes, selected via LISTING_PUBLISH_MODE env:
 *   simulation (default) — generate a realistic-looking fake listing; never touches the network
 *   dry_run              — build the real payload, log it, but don't send
 *   live                 — actually POST to mobile.de
 *
 * Default is `simulation` so merely having credentials in .env doesn't
 * accidentally post real ads on first run.
 */

const MOBILE_DE_BASE = "https://services.mobile.de/seller-api";

function getMode() {
  const mode = (process.env.LISTING_PUBLISH_MODE || "simulation").toLowerCase();
  return ["simulation", "dry_run", "live"].includes(mode) ? mode : "simulation";
}

function getCredentials() {
  return {
    username: process.env.MOBILE_DE_USERNAME || "",
    password: process.env.MOBILE_DE_PASSWORD || "",
    customerNumber: process.env.MOBILE_DE_CUSTOMER_NUMBER || "",
  };
}

export function isConfigured() {
  const { username, password, customerNumber } = getCredentials();
  return Boolean(username && password && customerNumber);
}

function basicAuthHeader(username, password) {
  return "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

function customerAdReference(vehicle) {
  return `luxjd-${vehicle.id || Date.now()}`;
}

/**
 * Build the mobile.de ad payload (JSON; they accept both XML and JSON via
 * content negotiation, but JSON is simpler to construct defensively).
 */
function buildPayload(vehicle, content, pricing) {
  return {
    customerAdReference: customerAdReference(vehicle),
    vehicle: {
      class: "Car",
      make: vehicle.make,
      model: vehicle.model,
      modelDescription: content?.mobile_de?.title_de || `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
      firstRegistration: `${vehicle.year}-01`,
      mileage: vehicle.mileageKm,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      damageUnrepaired: false,
      condition: "USED",
      driveType: (vehicle.driveSide || "LHD") === "RHD" ? "RIGHT" : "LEFT",
      fuel: vehicle.fuel || "PETROL",
      transmission: vehicle.transmission || "AUTOMATIC_GEAR",
      power: vehicle.powerKw || undefined,
      cubicCapacity: vehicle.engineCapacityCc || undefined,
    },
    price: {
      amount: pricing?.initial_price_eur || pricing?.currentPrice || 0,
      currency: "EUR",
      vatRate: "VAT_NOT_DEDUCTIBLE",
      type: "CONSUMER_PRICE_GROSS",
    },
    description: content?.mobile_de?.description_de || "",
    features: (content?.mobile_de?.highlights_de || []).slice(0, 50),
    seoKeywords: content?.mobile_de?.seo_keywords_de || [],
    images: (vehicle.photoUrls || []).slice(0, 40).map((url) => ({ url })),
  };
}

function simulationResult(vehicle, pricing, reason) {
  const listingId = `MDE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `${vehicle.make}-${vehicle.model}-${vehicle.year}`
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "");
  return {
    status: "PUBLISHED",
    mode: "simulation",
    simulationReason: reason || "simulation mode active",
    listingId,
    listingUrl: `https://suchen.mobile.de/fahrzeuge/details/${listingId}/${slug}`,
    platform: "mobile.de",
    price: pricing?.initial_price_eur || 0,
    currency: "EUR",
  };
}

export async function publish(vehicle, content, pricing) {
  const mode = getMode();
  const configured = isConfigured();

  // Simulation paths: no network.
  if (mode === "simulation" || !configured) {
    return simulationResult(vehicle, pricing, !configured ? "credentials not configured" : "LISTING_PUBLISH_MODE=simulation");
  }

  const { username, password, customerNumber } = getCredentials();
  const ref = customerAdReference(vehicle);
  const url = `${MOBILE_DE_BASE}/ads/mine/${encodeURIComponent(customerNumber)}/ads/${encodeURIComponent(ref)}`;
  const payload = buildPayload(vehicle, content, pricing);

  if (mode === "dry_run") {
    console.log(`[mobile.de:dry_run] PUT ${url}`, JSON.stringify(payload).slice(0, 400));
    return {
      status: "DRY_RUN",
      mode: "dry_run",
      listingId: ref,
      listingUrl: `${MOBILE_DE_BASE}/ads/mine/${customerNumber}/ads/${ref}`,
      platform: "mobile.de",
      price: payload.price.amount,
      currency: "EUR",
      payloadBytes: JSON.stringify(payload).length,
    };
  }

  // mode === "live"
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": basicAuthHeader(username, password),
        "Content-Type": "application/vnd.de.mobile.api+json;version=1.0.0",
        "Accept": "application/vnd.de.mobile.api+json;version=1.0.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        status: "FAILED",
        mode: "live",
        error: `mobile.de returned ${res.status}`,
        details: body.slice(0, 500),
        platform: "mobile.de",
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      status: "PUBLISHED",
      mode: "live",
      listingId: data.adKey || ref,
      listingUrl: data.detailPageUrl || `https://suchen.mobile.de/fahrzeuge/details/${data.adKey || ref}`,
      platform: "mobile.de",
      price: payload.price.amount,
      currency: "EUR",
      customerAdReference: ref,
      apiResponse: { adKey: data.adKey, state: data.state },
    };
  } catch (err) {
    return {
      status: "FAILED",
      mode: "live",
      error: `mobile.de call threw: ${err.message}`,
      platform: "mobile.de",
    };
  }
}

export async function updatePrice(listingRefOrId, newPriceEur) {
  const mode = getMode();
  if (mode === "simulation" || !isConfigured()) {
    return { ok: true, mode: "simulation", listingId: listingRefOrId, newPrice: newPriceEur };
  }
  const { username, password, customerNumber } = getCredentials();
  const url = `${MOBILE_DE_BASE}/ads/mine/${encodeURIComponent(customerNumber)}/ads/${encodeURIComponent(listingRefOrId)}`;

  if (mode === "dry_run") {
    console.log(`[mobile.de:dry_run] PUT price ${newPriceEur} → ${url}`);
    return { ok: true, mode: "dry_run", listingId: listingRefOrId, newPrice: newPriceEur };
  }

  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": basicAuthHeader(username, password),
        "Content-Type": "application/vnd.de.mobile.api+json;version=1.0.0",
      },
      body: JSON.stringify({ price: { amount: newPriceEur, currency: "EUR" } }),
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, mode: "live", listingId: listingRefOrId, newPrice: newPriceEur, status: res.status };
  } catch (err) {
    return { ok: false, mode: "live", error: err.message, listingId: listingRefOrId };
  }
}
