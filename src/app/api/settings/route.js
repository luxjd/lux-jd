import { db } from "@/lib/db-storage";
import { invalidateSettingsCache } from "@/lib/settings";

/**
 * App settings keys and their defaults.
 * These are the single source of truth for what settings exist.
 */
const SETTING_KEYS = {
  "profile.displayName": "Admin",
  "profile.email": "admin@luxjd.com",
  "thresholds.minMarginPct": 20,
  "thresholds.minMarginEur": 15000,
  "thresholds.maxPurchaseEur": 250000,
  "thresholds.fxBufferPct": 3,
  "agents.de-market": true,
  "agents.jp-sourcing": true,
  "agents.orchestrator": true,
  "agents.logistics": true,
  "agents.listing": true,
  "agents.finance": true,
  "agents.concierge": true,
};

/** GET /api/settings — load all settings */
export async function GET() {
  try {
    const keys = Object.keys(SETTING_KEYS);
    const stored = await db.kv.getMany(keys);

    // Merge stored values with defaults
    const settings = {};
    for (const [key, defaultVal] of Object.entries(SETTING_KEYS)) {
      settings[key] = stored[key] !== undefined ? stored[key] : defaultVal;
    }

    return Response.json({ settings });
  } catch {
    // DB not available — return defaults
    return Response.json({ settings: { ...SETTING_KEYS } });
  }
}

/** PUT /api/settings — save settings */
export async function PUT(request) {
  try {
    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return Response.json({ error: "Invalid settings" }, { status: 400 });
    }

    // Only save known keys
    const saved = {};
    for (const [key, value] of Object.entries(settings)) {
      if (SETTING_KEYS[key] !== undefined) {
        await db.kv.set(key, value);
        saved[key] = value;
      }
    }

    // Invalidate server-side settings cache so next valuation uses new values
    invalidateSettingsCache();

    return Response.json({ saved, count: Object.keys(saved).length });
  } catch (err) {
    console.error("Settings save error:", err.message);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
