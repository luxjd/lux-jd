import { normalizeMobileDe, normalizeAutoScout24 } from "./model-normalizer";

export function buildMobileDeSearchUrl({ make, model, yearFrom, yearTo, maxMileage }) {
  const { searchModel, makeId, modelId } = normalizeMobileDe(make, model);
  const params = new URLSearchParams({
    dam: "false",
    isSearchRequest: "true",
    s: "Car",
    vc: "Car",
    fr: `${yearFrom}:${yearTo}`,
  });
  if (maxMileage) params.set("ml", `:${maxMileage}`);

  if (modelId && makeId) {
    params.set("makeModelVariant1.makeId", makeId);
    params.set("makeModelVariant1.modelId", modelId);
  } else if (makeId) {
    params.set("makeModelVariant1.makeId", makeId);
    params.set("makeModelVariant1.modelDescription", searchModel);
  } else {
    params.set("makeModelVariant1.modelDescription", `${make} ${searchModel}`);
  }
  return `https://suchen.mobile.de/fahrzeuge/search.html?${params}`;
}

export function buildAutoScout24SearchUrl({ make, model, yearFrom, yearTo, maxMileage }) {
  const { makeSlug } = normalizeAutoScout24(make, model);
  const params = new URLSearchParams({
    fregfrom: String(yearFrom),
    fregto: String(yearTo),
    sort: "standard",
    desc: "0",
    cy: "D",
  });
  if (maxMileage) params.set("kmto", String(maxMileage));
  // Use make + free-text search: the model-slug path (/lst/make/model) breaks whenever
  // AutoScout24 rotates slugs. The make-only path with ?search= always resolves.
  params.set("search", model);
  return `https://www.autoscout24.de/lst/${makeSlug}?${params}`;
}
