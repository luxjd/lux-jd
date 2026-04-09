/**
 * App settings loader — reads from DB (KeyValueStore) with env/defaults fallback.
 *
 * Priority: DB setting > environment variable > hardcoded default
 *
 * Usage:
 *   import { getSettings } from "@/lib/settings";
 *   const s = await getSettings();
 *   s.minMarginEur  // 15000
 *   s.fxBufferPct   // 3
 */

import { db } from "@/lib/db-storage";

// Cache settings for 60 seconds to avoid hitting DB on every request
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

const DEFAULTS = {
  "profile.displayName": "Admin",
  "profile.email": "admin@luxjd.com",
  "thresholds.minMarginPct": parseInt(process.env.MIN_MARGIN_PCT || "20"),
  "thresholds.minMarginEur": parseInt(process.env.MIN_MARGIN_EUR || "15000"),
  "thresholds.maxPurchaseEur": 250000,
  "thresholds.fxBufferPct": parseFloat(process.env.FX_BUFFER_PCT || "3"),
  "agents.de-market": true,
  "agents.jp-sourcing": true,
  "agents.orchestrator": true,
  "agents.logistics": true,
  "agents.listing": true,
  "agents.finance": true,
  "agents.concierge": true,
};

/**
 * Load all settings from DB with fallback to env/defaults.
 * Results are cached for 60 seconds.
 */
export async function getSettings() {
  if (cache && Date.now() - cacheTime < CACHE_TTL) return cache;

  let stored = {};
  try {
    stored = await db.kv.getMany(Object.keys(DEFAULTS));
  } catch { /* DB not available */ }

  const merged = {};
  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    merged[key] = stored[key] !== undefined ? stored[key] : defaultVal;
  }

  // Flatten to convenient field names
  const settings = {
    displayName: merged["profile.displayName"],
    email: merged["profile.email"],
    minMarginPct: Number(merged["thresholds.minMarginPct"]),
    minMarginEur: Number(merged["thresholds.minMarginEur"]),
    maxPurchaseEur: Number(merged["thresholds.maxPurchaseEur"]),
    fxBufferPct: Number(merged["thresholds.fxBufferPct"]),
    agents: {
      "de-market": merged["agents.de-market"],
      "jp-sourcing": merged["agents.jp-sourcing"],
      "orchestrator": merged["agents.orchestrator"],
      "logistics": merged["agents.logistics"],
      "listing": merged["agents.listing"],
      "finance": merged["agents.finance"],
      "concierge": merged["agents.concierge"],
    },
  };

  cache = settings;
  cacheTime = Date.now();
  return settings;
}

/** Invalidate the settings cache (call after saving) */
export function invalidateSettingsCache() {
  cache = null;
  cacheTime = 0;
}

/**
 * Check if a specific agent is enabled.
 * Returns false if explicitly disabled in settings, true otherwise (default = enabled).
 */
export async function isAgentEnabled(agentId) {
  const s = await getSettings();
  return s.agents[agentId] !== false;
}

/**
 * Guard for agent API routes. Returns a 503 Response if the agent is disabled.
 * Usage: const blocked = await agentGuard("de-market"); if (blocked) return blocked;
 */
export async function agentGuard(agentId) {
  const enabled = await isAgentEnabled(agentId);
  if (!enabled) {
    return Response.json(
      { error: `${agentId} agent is currently disabled. Enable it in Settings.`, disabled: true },
      { status: 503 }
    );
  }
  return null;
}
