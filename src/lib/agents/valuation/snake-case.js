// Spec §3 uses snake_case throughout (gross_margin_eur, price_statistics, etc.).
// The rest of this codebase uses camelCase. At the /api/v1 boundary we convert
// so the spec-compliant endpoint matches the document verbatim while internal
// code and the existing /api/agents/valuation/valuate UI route stay camelCase.

function toSnake(key) {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function deepSnakeCase(value) {
  if (Array.isArray(value)) return value.map(deepSnakeCase);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Preserve keys that already start with underscore (internal estimation
      // labels like `_estimation_labels`) — they're deliberately namespaced.
      const newKey = k.startsWith("_") ? k : toSnake(k);
      out[newKey] = deepSnakeCase(v);
    }
    return out;
  }
  return value;
}
