/**
 * Regulatory Monitor — tracks EU import regulations, customs duty rates,
 * emissions standards, and German vehicle trading requirements.
 *
 * Docx §6.4.2 Function 6: "Track changes to EU import regulations, customs
 * duty rates, emissions standards, and German vehicle trading requirements.
 * **Flag any changes that affect current pipeline or future strategy**."
 *
 * Two change-detection paths:
 *   1. Operator-reported — `reportRegulatoryChange()` records an observed
 *      change (e.g. after an ops person sees a new EUR-Lex regulation). The
 *      change is persisted and surfaced as an alert on every subsequent
 *      `runRegulatoryCheck` call with its pipeline-impact already computed
 *      via `simulateRegulatoryChange`.
 *   2. LLM periodic review — `reviewBaselineWithAI()` asks Claude to identify
 *      KNOWN regulatory changes against the stored baseline. Results flow
 *      into the same alerts path so the two sources merge cleanly.
 *
 * Static baseline remains authoritative until a change is explicitly recorded.
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { getDb } from "@/lib/db";

// Current regulatory baseline — these are the ACTUAL rates/rules as of 2026
const REGULATORY_BASELINE = {
  customsDutyRate: 10.0,         // EU customs duty on vehicles (HS 8703)
  importVatRate: 19.0,           // German VAT (Mehrwertsteuer)
  vatReclaimable: true,          // For registered businesses
  emissionsStandard: "Euro 6d",  // Current minimum for registration
  co2TaxApplicable: false,       // For used imports (only new registrations)
  radiationCertRequired: true,   // For Japan exports (since 2011)
  eucTypeApproval: true,         // EU-manufactured vehicles keep WVTA
  differenzbesteuerungAllowed: true, // §25a UStG margin scheme
  maxVehicleAge: null,           // No age limit for EU imports
  rightHandDriveAllowed: true,   // RHD legal in Germany (with headlight conversion)
  lastUpdated: "2026-04-01",
};

// Key regulatory sources to check
const REGULATORY_SOURCES = [
  {
    id: "eu_customs_tariff",
    name: "EU Combined Nomenclature — HS 8703 (Motor Vehicles)",
    url: "https://taxation-customs.ec.europa.eu/customs-4/calculation-customs-duties/customs-tariff_en",
    field: "customsDutyRate",
    currentValue: "10%",
    checkFrequency: "monthly",
  },
  {
    id: "de_vat_rate",
    name: "German VAT Rate (§12 UStG)",
    url: "https://www.gesetze-im-internet.de/ustg_1980/__12.html",
    field: "importVatRate",
    currentValue: "19%",
    checkFrequency: "quarterly",
  },
  {
    id: "euro_emissions",
    name: "EU Emissions Standards for Vehicle Registration",
    url: "https://www.kba.de/EN/Topics/VehicleTechnology/Emission/emission_node.html",
    field: "emissionsStandard",
    currentValue: "Euro 6d minimum",
    checkFrequency: "quarterly",
  },
  {
    id: "japan_export_regs",
    name: "Japan Vehicle Export Regulations (Radiation/EPC)",
    url: "https://www.customs.go.jp/english/",
    field: "radiationCertRequired",
    currentValue: "Required since 2011",
    checkFrequency: "quarterly",
  },
  {
    id: "de_dealer_license",
    name: "German Vehicle Dealer License (§38 GewO)",
    url: "https://www.gesetze-im-internet.de/gewo/__38.html",
    field: "dealerLicense",
    currentValue: "Required — Gewerbeerlaubnis",
    checkFrequency: "yearly",
  },
  {
    id: "differenzbesteuerung",
    name: "Margin Scheme Taxation (§25a UStG)",
    url: "https://www.gesetze-im-internet.de/ustg_1980/__25a.html",
    field: "differenzbesteuerungAllowed",
    currentValue: "Allowed for used vehicle dealers",
    checkFrequency: "yearly",
  },
  {
    id: "tuv_einzelabnahme",
    name: "TÜV Einzelabnahme Requirements (§21 StVZO)",
    url: "https://www.gesetze-im-internet.de/stvzo_2012/__21.html",
    field: "tuvRequirements",
    currentValue: "Required for imports without EU type approval",
    checkFrequency: "yearly",
  },
  {
    id: "widerrufsrecht",
    name: "Consumer Right of Withdrawal (Fernabsatzgesetz)",
    url: "https://www.gesetze-im-internet.de/bgb/__355.html",
    field: "widerrufsrecht",
    currentValue: "14-day return right for online sales",
    checkFrequency: "yearly",
  },
];

const CHANGES_KV_KEY = "regulatory.reported-changes";

/**
 * Record a regulatory change observed by the operator (or by an LLM review).
 *
 * Once recorded, every subsequent `runRegulatoryCheck` call will:
 *   - surface it as an alert
 *   - auto-compute pipeline impact via `simulateRegulatoryChange`
 *   - flip the agent status to ACTION_REQUIRED
 *
 * Idempotent by id — pass the same id to update an existing change.
 *
 * @param {{
 *   field: string,           // which baseline field changed
 *   oldValue: any,           // previous value (for audit)
 *   newValue: any,           // new value
 *   effectiveDate?: string,  // ISO date when the change takes effect
 *   source?: string,         // citation, e.g. "EUR-Lex 2025/xyz"
 *   sourceUrl?: string,
 *   notes?: string,
 *   reportedBy?: string,     // operator id or "ai_review"
 *   id?: string              // pass an existing id to update
 * }} change
 */
export async function reportRegulatoryChange(change) {
  if (!change?.field || change.newValue === undefined) {
    throw new Error("Regulatory change must include `field` and `newValue`");
  }
  const db = await getDb();
  if (!db) return null;

  const existing = await db.keyValueStore.findUnique({ where: { key: CHANGES_KV_KEY } });
  const changes = Array.isArray(existing?.value?.changes) ? [...existing.value.changes] : [];

  const id = change.id || `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const record = {
    id,
    field: change.field,
    oldValue: change.oldValue !== undefined ? change.oldValue : REGULATORY_BASELINE[change.field],
    newValue: change.newValue,
    effectiveDate: change.effectiveDate || now,
    source: change.source || "operator",
    sourceUrl: change.sourceUrl || null,
    notes: change.notes || null,
    reportedBy: change.reportedBy || "operator",
    reportedAt: now,
  };

  // Upsert by id
  const idx = changes.findIndex((c) => c.id === id);
  if (idx >= 0) changes[idx] = record;
  else changes.push(record);

  await db.keyValueStore.upsert({
    where: { key: CHANGES_KV_KEY },
    update: { value: { changes } },
    create: { key: CHANGES_KV_KEY, value: { changes } },
  });

  return record;
}

/**
 * Get all reported regulatory changes.
 * @param {{activeOnly?: boolean}} [opts] — if true, filter to changes whose
 *   effectiveDate is on or before today
 */
export async function getReportedChanges({ activeOnly = false } = {}) {
  const db = await getDb();
  if (!db) return [];
  const row = await db.keyValueStore.findUnique({ where: { key: CHANGES_KV_KEY } });
  const all = Array.isArray(row?.value?.changes) ? row.value.changes : [];
  if (!activeOnly) return all;
  const now = Date.now();
  return all.filter((c) => {
    if (!c.effectiveDate) return true;
    const ts = new Date(c.effectiveDate).getTime();
    return Number.isFinite(ts) && ts <= now;
  });
}

/**
 * Dismiss a reported change (e.g., it was a false alarm or is superseded).
 */
export async function dismissRegulatoryChange(id) {
  if (!id) return null;
  const db = await getDb();
  if (!db) return null;
  const row = await db.keyValueStore.findUnique({ where: { key: CHANGES_KV_KEY } });
  const changes = Array.isArray(row?.value?.changes) ? row.value.changes : [];
  const filtered = changes.filter((c) => c.id !== id);
  await db.keyValueStore.upsert({
    where: { key: CHANGES_KV_KEY },
    update: { value: { changes: filtered } },
    create: { key: CHANGES_KV_KEY, value: { changes: filtered } },
  });
  return { dismissed: changes.length - filtered.length };
}

/**
 * LLM periodic review — ask Claude to identify KNOWN regulatory changes
 * against the stored baseline. Returns a list of candidate changes (operator
 * still has to confirm via `reportRegulatoryChange` for them to become live
 * alerts).
 *
 * This is a scan, not an authoritative source. It supplements — not replaces
 * — the operator-reported channel.
 */
export async function reviewBaselineWithAI() {
  if (!isAIAvailable()) {
    return { reviewed: false, reason: "AI not available", candidates: [] };
  }

  const result = await callClaude({
    prompt: `You are a German customs and automotive regulatory expert. Review the following regulatory baseline and identify ONLY changes you are CONFIDENT have actually occurred based on public regulatory records. Do NOT fabricate changes.

Current baseline (last updated ${REGULATORY_BASELINE.lastUpdated}):
${JSON.stringify(REGULATORY_BASELINE, null, 2)}

Fields to watch for changes:
- customsDutyRate: EU customs duty on HS 8703 (motor vehicles >3000cc)
- importVatRate: German Mehrwertsteuer under §12 UStG
- emissionsStandard: EU emissions standard for passenger vehicle registration
- differenzbesteuerungAllowed: margin scheme availability under §25a UStG
- radiationCertRequired: Japan export regulation
- rightHandDriveAllowed: German RHD registration policy

If you have NO confident knowledge of any change, return an empty array — do not guess.

Return ONLY valid JSON:
{
  "changes_detected": <boolean>,
  "candidates": [
    {
      "field": "<baseline field name>",
      "oldValue": <current baseline value>,
      "newValue": <new value>,
      "effectiveDate": "YYYY-MM-DD",
      "source": "<citation, e.g. EUR-Lex 2025/xyz>",
      "confidence": <float 0-1>,
      "notes": "<1-sentence summary>"
    }
  ],
  "review_notes": "<1-2 sentence summary>"
}`,
    system: "You are a conservative regulatory compliance reviewer. You only flag changes you are CONFIDENT about from public sources. Silence is better than hallucination.",
    jsonMode: true,
  });

  return {
    reviewed: true,
    changes_detected: !!result?.changes_detected,
    candidates: Array.isArray(result?.candidates) ? result.candidates : [],
    review_notes: result?.review_notes || null,
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * Run a regulatory compliance check.
 * Returns current baseline, per-source status, and impact alerts for any
 * reported changes.
 *
 * @param {Array} [vehicles=[]] — active pipeline vehicles; when provided, each
 *   reported change is run through `simulateRegulatoryChange` so the alert
 *   shows its EUR impact on the current pipeline.
 */
export async function runRegulatoryCheck(vehicles = []) {
  const now = new Date();
  const checks = [];

  for (const source of REGULATORY_SOURCES) {
    const lastChecked = now.toISOString();

    const nextCheck = new Date(now);
    if (source.checkFrequency === "monthly") nextCheck.setMonth(nextCheck.getMonth() + 1);
    else if (source.checkFrequency === "quarterly") nextCheck.setMonth(nextCheck.getMonth() + 3);
    else nextCheck.setFullYear(nextCheck.getFullYear() + 1);

    checks.push({
      id: source.id,
      name: source.name,
      url: source.url,
      currentValue: source.currentValue,
      status: "CURRENT",
      lastChecked,
      nextCheckDue: nextCheck.toISOString().split("T")[0],
      field: source.field,
    });
  }

  // Operator-reported + AI-confirmed changes become live alerts.
  const activeChanges = await getReportedChanges({ activeOnly: true });
  const alerts = [];
  for (const change of activeChanges) {
    // Tag affected sources as CHANGED so the dashboard can flag them.
    const affectedCheck = checks.find((c) => c.field === change.field);
    if (affectedCheck) affectedCheck.status = "CHANGED";

    const impact = vehicles.length > 0 ? simulateRegulatoryChange(change, vehicles) : null;

    alerts.push({
      id: change.id,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      effectiveDate: change.effectiveDate,
      source: change.source,
      sourceUrl: change.sourceUrl,
      reportedBy: change.reportedBy,
      reportedAt: change.reportedAt,
      notes: change.notes,
      impact: impact ? {
        vehiclesAffected: impact.vehiclesAffected,
        totalImpactEur: impact.totalImpactEur,
        assessment: impact.assessment,
        perVehicle: impact.perVehicle,
      } : null,
      severity: impact?.assessment === "HIGH_IMPACT" ? "CRITICAL"
        : impact?.assessment === "MODERATE_IMPACT" ? "WARN"
        : "INFO",
    });
  }

  return {
    baseline: REGULATORY_BASELINE,
    checks,
    alerts,
    activeChanges,
    summary: {
      totalSources: REGULATORY_SOURCES.length,
      currentCount: checks.filter((c) => c.status === "CURRENT").length,
      changedCount: checks.filter((c) => c.status === "CHANGED").length,
      actionRequired: alerts.length,
    },
    status: alerts.length > 0 ? "ACTION_REQUIRED" : "COMPLIANT",
    checkedAt: now.toISOString(),
  };
}

/**
 * Get the current regulatory baseline.
 */
export function getRegulatoryBaseline() {
  return REGULATORY_BASELINE;
}

/**
 * Calculate the impact of a potential regulatory change on the portfolio.
 */
export function simulateRegulatoryChange(change, vehicles) {
  const results = [];

  for (const vehicle of vehicles) {
    const currentLanded = vehicle.landedCost?.totalLandedCostEur || 0;
    let impactEur = 0;
    let description = "";

    if (change.field === "customsDutyRate" && change.newValue !== undefined) {
      const oldDuty = (vehicle.landedCost?.cifValueEur || 0) * (REGULATORY_BASELINE.customsDutyRate / 100);
      const newDuty = (vehicle.landedCost?.cifValueEur || 0) * (change.newValue / 100);
      impactEur = newDuty - oldDuty;
      description = `Customs duty change ${REGULATORY_BASELINE.customsDutyRate}% → ${change.newValue}%`;
    }

    if (change.field === "importVatRate" && change.newValue !== undefined) {
      const cif = vehicle.landedCost?.cifValueEur || 0;
      const duty = vehicle.landedCost?.customsDutyEur || 0;
      const oldVat = (cif + duty) * (REGULATORY_BASELINE.importVatRate / 100);
      const newVat = (cif + duty) * (change.newValue / 100);
      impactEur = newVat - oldVat;
      description = `Import VAT change ${REGULATORY_BASELINE.importVatRate}% → ${change.newValue}%`;
      // VAT is reclaimable, so cash flow impact only
      description += " (reclaimable — cash flow impact only)";
    }

    results.push({
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      currentLandedCost: currentLanded,
      impactEur: Math.round(impactEur),
      description,
    });
  }

  const totalImpact = results.reduce((s, r) => s + r.impactEur, 0);

  return {
    change,
    vehiclesAffected: results.filter((r) => r.impactEur !== 0).length,
    totalImpactEur: totalImpact,
    perVehicle: results,
    assessment: totalImpact > 5000 ? "HIGH_IMPACT" : totalImpact > 1000 ? "MODERATE_IMPACT" : "LOW_IMPACT",
  };
}
