/**
 * Model Lifecycle / Successor Detection (docx §6.1.3).
 *
 * Docx: "Identify emerging pricing trends — models starting to appreciate,
 * market shifts due to new model releases, and seasonal demand patterns."
 *
 * Curated calendar of successor launches for each entry in
 * `de-market/constants.js TRACKED_MODELS`. When a successor launched within
 * the last 12 months, the prior generation enters a "post-successor
 * depreciation window" where the trend regression alone doesn't explain the
 * accelerated softening.
 *
 * Phases:
 *   CURRENT          — still in production, no successor announced
 *   ANNOUNCED        — successor announced but not launched (<0 mo)
 *   TRANSITIONING    — successor launched within the last 12 months
 *   POST_SUCCESSOR   — successor launched 12-36 months ago
 *   LEGACY           — 36+ months post-successor; residual collector demand
 *
 * `expectedDepreciationBias` feeds into TVR so downstream decision agents
 * can weight the trend signal: a CURRENT model's -3% trend is different
 * from a TRANSITIONING model's -3% trend.
 */

const now = () => new Date();

function monthsBetween(a, b) {
  const diffMs = b.getTime() - a.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)); // mean month length
}

/**
 * Keyed by `TRACKED_MODELS.id`. Dates are approximate Germany-market availability.
 * Entries without `successor` mean the model is still flagship / no replacement known.
 */
const LIFECYCLE = {
  // ── Ferrari ──
  "ferrari-488-gtb": {
    successor: "Ferrari F8 Tributo",
    successorLaunchDate: "2019-03-01",
    notes: "F8 Tributo launched 2019; 488 GTB now in post-successor window + early collector interest.",
  },
  "ferrari-f12": {
    successor: "Ferrari 812 Superfast",
    successorLaunchDate: "2017-06-01",
    notes: "812 Superfast succeeded F12 in 2017; F12 transitioning to collector phase (esp. TDF).",
  },
  "ferrari-roma": {
    successor: null,
    successorLaunchDate: null,
    notes: "Roma still in current production.",
  },

  // ── Mercedes-AMG ──
  "amg-gt-r": {
    successor: "Mercedes-AMG GT (C192)",
    successorLaunchDate: "2023-10-01",
    notes: "C192 AMG GT launched late 2023; R190 GT R entered post-successor window in 2024.",
  },
  "amg-g63": {
    successor: null,
    successorLaunchDate: null,
    notes: "W463A G63 still current.",
  },
  "amg-c63": {
    successor: "Mercedes-AMG C63 S E Performance (W206)",
    successorLaunchDate: "2023-04-01",
    notes: "W206 C63 (4-cyl hybrid) launched 2023; W205 V8 C63 sees mixed market — V8 loyalists support residuals.",
  },
  "amg-e63": {
    successor: null,
    successorLaunchDate: null,
    notes: "W213 E63 still current; W214 expected 2026+.",
  },

  // ── Porsche ──
  "porsche-911-gt3": {
    successor: "Porsche 911 GT3 (992.2)",
    successorLaunchDate: "2024-09-01",
    notes: "992.2 GT3 revealed late 2024; 992.1 GT3 entered transition window.",
  },
  "718-cayman-gt4": {
    successor: "Porsche 718 Cayman GT4 RS",
    successorLaunchDate: "2022-02-01",
    notes: "GT4 RS launched 2022 as higher tier; base GT4 still produced but market attention split.",
  },
  "cayenne-turbo-gt": {
    successor: null,
    successorLaunchDate: null,
    notes: "Cayenne Turbo GT current flagship.",
  },

  // ── Jaguar ──
  "jaguar-f-type": {
    successor: "Jaguar EV successor (TBD)",
    successorLaunchDate: "2024-12-01",
    notes: "Jaguar discontinued F-Type production late 2024; no direct successor. Long-term collector potential.",
  },

  // ── Bentley ──
  "continental-gt": {
    successor: "Bentley Continental GT (4th gen, hybrid)",
    successorLaunchDate: "2024-06-01",
    notes: "4th gen Continental GT launched 2024 with hybrid powertrain; 3rd gen now post-successor.",
  },

  // ── Lamborghini ──
  "huracan-sto": {
    successor: "Lamborghini Temerario",
    successorLaunchDate: "2024-08-01",
    notes: "Temerario replaces Huracan family; STO likely to hold value as final V10 motorsport variant.",
  },

  // ── Aston Martin ──
  "db11-v12": {
    successor: "Aston Martin DB12",
    successorLaunchDate: "2023-05-01",
    notes: "DB12 launched 2023; DB11 V12 entered post-successor depreciation.",
  },
  "aston-vantage": {
    successor: "Aston Martin Vantage (2024 refresh)",
    successorLaunchDate: "2024-02-01",
    notes: "Significant 2024 Vantage refresh; pre-refresh cars in transition.",
  },

  // ── BMW M ──
  "m3-competition": {
    successor: null,
    successorLaunchDate: null,
    notes: "G80 M3 Competition current; mid-cycle LCI expected before generation change.",
  },
  "m4-competition": {
    successor: null,
    successorLaunchDate: null,
    notes: "G82 M4 Competition current.",
  },

  // ── Range Rover ──
  "rr-sport-svr": {
    successor: "Range Rover Sport SV",
    successorLaunchDate: "2024-03-01",
    notes: "Sport SV (L461) replaced SVR in 2024; SVR entered post-successor window.",
  },

  // ── Maserati ──
  "maserati-mc20": {
    successor: null,
    successorLaunchDate: null,
    notes: "MC20 current flagship.",
  },
};

/**
 * Classify the lifecycle phase of a tracked model.
 *
 * @param {string} modelId — one of `TRACKED_MODELS.id`
 * @returns {{
 *   phase: "CURRENT"|"ANNOUNCED"|"TRANSITIONING"|"POST_SUCCESSOR"|"LEGACY"|"UNKNOWN",
 *   successor: string|null,
 *   successorLaunchDate: string|null,
 *   monthsSinceSuccessor: number|null,
 *   expectedDepreciationBias: "NEUTRAL"|"NEGATIVE_MILD"|"NEGATIVE_STRONG"|"COLLECTOR_POTENTIAL",
 *   notes: string
 * }}
 */
export function detectLifecycleShift(modelId) {
  const entry = LIFECYCLE[modelId];

  if (!entry) {
    return {
      phase: "UNKNOWN",
      successor: null,
      successorLaunchDate: null,
      monthsSinceSuccessor: null,
      expectedDepreciationBias: "NEUTRAL",
      notes: "No curated lifecycle data for this model.",
    };
  }

  if (!entry.successor || !entry.successorLaunchDate) {
    return {
      phase: "CURRENT",
      successor: null,
      successorLaunchDate: null,
      monthsSinceSuccessor: null,
      expectedDepreciationBias: "NEUTRAL",
      notes: entry.notes,
    };
  }

  const launchDate = new Date(entry.successorLaunchDate);
  if (isNaN(launchDate.getTime())) {
    return {
      phase: "UNKNOWN",
      successor: entry.successor,
      successorLaunchDate: entry.successorLaunchDate,
      monthsSinceSuccessor: null,
      expectedDepreciationBias: "NEUTRAL",
      notes: `Invalid launch date in lifecycle data for ${modelId}.`,
    };
  }

  const monthsSince = monthsBetween(launchDate, now());

  let phase;
  let bias;
  if (monthsSince < 0) {
    phase = "ANNOUNCED";
    bias = "NEGATIVE_MILD";
  } else if (monthsSince <= 12) {
    phase = "TRANSITIONING";
    bias = "NEGATIVE_STRONG";
  } else if (monthsSince <= 36) {
    phase = "POST_SUCCESSOR";
    bias = "NEGATIVE_MILD";
  } else {
    phase = "LEGACY";
    bias = "COLLECTOR_POTENTIAL";
  }

  return {
    phase,
    successor: entry.successor,
    successorLaunchDate: entry.successorLaunchDate,
    monthsSinceSuccessor: monthsSince,
    expectedDepreciationBias: bias,
    notes: entry.notes,
  };
}

export { LIFECYCLE };
