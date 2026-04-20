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
  const { makeSlug, modelSlug } = normalizeAutoScout24(make, model);

  // Required canonical parameters AutoScout24 expects on listing URLs.
  // Missing any of `atype`/`cy`/`ustate` combined with a freetext `search=`
  // param triggers the "Die gesuchte Seite existiert leider nicht mehr" 404.
  const params = new URLSearchParams({
    atype: "C",          // article type: Car
    cy: "D",             // country: Germany
    sort: "standard",
    desc: "0",
    ustate: "N,U",       // N=new + U=used (AS24 serialises as N%2CU)
  });
  if (yearFrom) params.set("fregfrom", String(yearFrom));
  if (yearTo) params.set("fregto", String(yearTo));
  if (maxMileage) params.set("kmto", String(maxMileage));

  // Prefer the model-specific path (/lst/mercedes-benz/amg-gt) when we have
  // a slug mapping — it's the canonical "listing by make + model" URL. Fall
  // back to make-only path when no slug is known. The old `search=` freetext
  // param against a bare make path has been deprecated and now 404s.
  const path = modelSlug ? `${makeSlug}/${modelSlug}` : makeSlug;
  return `https://www.autoscout24.de/lst/${path}?${params}`;
}
