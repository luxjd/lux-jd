/**
 * Pipeline State Machine — strict 10-stage vehicle lifecycle.
 *
 * RULES (NON-NEGOTIABLE):
 * 1. Stages can only advance forward (no skipping, no reversal without override)
 * 2. Every transition is timestamped and logged
 * 3. Certain transitions require prerequisites (e.g., Finance must confirm costs before READY_FOR_SALE)
 * 4. Photo documentation required at specific stages
 */

export const STAGES = [
  "SOURCED", "PURCHASED", "JP_TRANSPORT", "AT_PORT_JP", "IN_TRANSIT",
  "AT_PORT_DE", "CUSTOMS", "WORKSHOP", "TUV", "READY_FOR_SALE",
];

// Valid forward transitions (current → allowed next stages)
const VALID_TRANSITIONS = {
  SOURCED: ["PURCHASED"],
  PURCHASED: ["JP_TRANSPORT"],
  JP_TRANSPORT: ["AT_PORT_JP"],
  AT_PORT_JP: ["IN_TRANSIT"],
  IN_TRANSIT: ["AT_PORT_DE"],
  AT_PORT_DE: ["CUSTOMS"],
  CUSTOMS: ["WORKSHOP"],
  WORKSHOP: ["TUV"],
  TUV: ["READY_FOR_SALE"],
  READY_FOR_SALE: [], // Terminal — Listing Agent takes over
};

// Stages that require photo documentation
const PHOTO_REQUIRED_STAGES = ["PURCHASED", "AT_PORT_JP", "AT_PORT_DE", "TUV", "READY_FOR_SALE"];

// Prerequisites for specific transitions
const TRANSITION_PREREQUISITES = {
  READY_FOR_SALE: {
    check: (vehicle) => {
      const issues = [];
      if (!vehicle.tuvPassed) issues.push("TUV inspection must be passed");
      if (!vehicle.costsComplete) issues.push("Finance Agent must confirm 100% cost tracking");
      return issues;
    },
  },
  CUSTOMS: {
    check: (vehicle) => {
      const issues = [];
      if (!vehicle.customsDocsReady) issues.push("Customs documentation must be prepared first");
      return issues;
    },
  },
};

// Average durations per stage (in days) for ETA calculation
export const STAGE_DURATIONS = {
  SOURCED: 2,        // bid → purchase confirmation
  PURCHASED: 3,      // payment → transport arrangement
  JP_TRANSPORT: 4,   // inland transport to port
  AT_PORT_JP: 5,     // waiting for vessel + loading
  IN_TRANSIT: 42,    // ocean transit (Yokohama→Bremerhaven average)
  AT_PORT_DE: 3,     // unloading + initial inspection
  CUSTOMS: 5,        // clearance process
  WORKSHOP: 7,       // detailing + photography
  TUV: 3,            // inspection + registration
  READY_FOR_SALE: 0, // terminal
};

// Shipping routes with average transit times
export const SHIPPING_ROUTES = {
  "Yokohama→Bremerhaven": { days: 42, carrier: "Ocean Network Express" },
  "Yokohama→Hamburg": { days: 45, carrier: "Hapag-Lloyd" },
  "Kobe→Bremerhaven": { days: 44, carrier: "Ocean Network Express" },
  "Kobe→Hamburg": { days: 48, carrier: "Evergreen" },
  "Nagoya→Bremerhaven": { days: 43, carrier: "MSC" },
  "Tokyo→Bremerhaven": { days: 41, carrier: "Maersk" },
};

/**
 * Validate a stage transition.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTransition(fromStage, toStage, vehicle = {}, override = false) {
  const errors = [];

  // Check stage exists
  if (!STAGES.includes(fromStage)) errors.push(`Invalid current stage: ${fromStage}`);
  if (!STAGES.includes(toStage)) errors.push(`Invalid target stage: ${toStage}`);
  if (errors.length > 0) return { valid: false, errors };

  // Check forward-only (no reversal without override)
  const fromIdx = STAGES.indexOf(fromStage);
  const toIdx = STAGES.indexOf(toStage);

  if (toIdx < fromIdx && !override) {
    errors.push(`Cannot reverse from ${fromStage} to ${toStage} without Orchestrator override`);
  }

  // Check valid transition
  if (toIdx > fromIdx && !VALID_TRANSITIONS[fromStage]?.includes(toStage)) {
    errors.push(`Cannot skip from ${fromStage} to ${toStage}. Next allowed: ${VALID_TRANSITIONS[fromStage]?.join(", ") || "none"}`);
  }

  // Check prerequisites
  const prereq = TRANSITION_PREREQUISITES[toStage];
  if (prereq) {
    const prereqErrors = prereq.check(vehicle);
    errors.push(...prereqErrors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if photo documentation is required at this stage.
 */
export function isPhotoRequired(stage) {
  return PHOTO_REQUIRED_STAGES.includes(stage);
}

/**
 * Calculate ETA for remaining stages from current position.
 * @returns {{ stage: string, estimatedDate: string, daysFromNow: number }[]}
 */
export function calculateETAs(currentStage, currentStageEnteredAt = new Date()) {
  const currentIdx = STAGES.indexOf(currentStage);
  if (currentIdx < 0) return [];

  const etas = [];
  let cumulativeDays = 0;
  const enteredAt = new Date(currentStageEnteredAt);

  for (let i = currentIdx; i < STAGES.length; i++) {
    const stage = STAGES[i];
    if (i > currentIdx) {
      cumulativeDays += STAGE_DURATIONS[STAGES[i - 1]] || 0;
    }

    const etaDate = new Date(enteredAt);
    etaDate.setDate(etaDate.getDate() + cumulativeDays);

    etas.push({
      stage,
      estimatedDate: etaDate.toISOString().split("T")[0],
      daysFromNow: Math.max(0, Math.round((etaDate - new Date()) / (1000 * 60 * 60 * 24))),
      isCurrent: i === currentIdx,
      isCompleted: false,
    });
  }

  return etas;
}

/**
 * Calculate total pipeline duration estimate (current stage → READY_FOR_SALE).
 */
export function estimateTotalDaysRemaining(currentStage) {
  const currentIdx = STAGES.indexOf(currentStage);
  if (currentIdx < 0) return 0;

  let total = 0;
  for (let i = currentIdx; i < STAGES.length - 1; i++) {
    total += STAGE_DURATIONS[STAGES[i]] || 0;
  }
  return total;
}
