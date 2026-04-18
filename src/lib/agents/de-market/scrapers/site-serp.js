import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

const SITES = [
  { domain: "hollmann-international.com", saleType: "retail", platform: "Hollmann International", country: "DE", language: "de" },
  { domain: "luft-automobil.de", saleType: "retail", platform: "Luft Auto", country: "DE", language: "de" },
  { domain: "saker.de", saleType: "retail", platform: "Saker", country: "DE", language: "de" },
  { domain: "exclusivecars.de", saleType: "retail", platform: "Exclusive Cars", country: "DE", language: "de" },
  { domain: "rmsothebys.com", saleType: "auction", platform: "RM Sotheby's", country: "INTL", language: "en" },
  { domain: "bonhams.com", saleType: "auction", platform: "Bonhams", country: "INTL", language: "en" },
  { domain: "artcurial.com", saleType: "auction", platform: "Artcurial", country: "FR", language: "fr" },
  { domain: "collectingcars.com", saleType: "specialist", platform: "Collecting Cars", country: "UK", language: "en" },
  { domain: "bfrm.io", saleType: "specialist", platform: "BFRM", country: "INTL", language: "en", brandsOnly: ["Ferrari"] },
];

function extractPrice(text) {
  const patterns = [
    /€\s?([\d.,]+)/,
    /EUR\s?([\d.,]+)/,
    /£\s?([\d.,]+)/,
    /\$\s?([\d.,]+)/,
    /([\d]{2,3}\.\d{3}(?:,\d{2})?)\s?€/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].replace(/\./g, "").replace(/,/g, ".");
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= 20000 && n <= 5000000) {
        if (text.includes("$")) return Math.round(n * 0.92);
        if (text.includes("£")) return Math.round(n * 1.17);
        return Math.round(n);
      }
    }
  }
  return 0;
}

function extractMileage(text) {
  const kmMatch = text.match(/([\d.]{1,7})\s*(?:km|miles|mi)\b/i);
  if (!kmMatch) return 0;
  let n = parseInt(kmMatch[1].replace(/\./g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (/\b(miles|mi)\b/i.test(kmMatch[0])) n = Math.round(n * 1.609);
  if (n > 999999) return 0;
  return n;
}

function extractYear(text) {
  const m = text.match(/\b(19[89]\d|20[0-2]\d)\b/);
  return m ? parseInt(m[1]) : 0;
}

async function scrapeSite(site, make, model, yearFrom, yearTo) {
  if (site.brandsOnly && !site.brandsOnly.some((b) => b.toLowerCase() === make.toLowerCase())) return [];

  const query = `site:${site.domain} "${make}" "${model}" ${yearFrom}..${yearTo}`;
  try {
    const items = await runActorAndGetItems("apify~google-search-scraper", {
      queries: query,
      maxPagesPerQuery: 1,
      resultsPerPage: 20,
      languageCode: site.language || "en",
      countryCode: "de",
    });

    const results = items?.[0]?.organicResults || items.flatMap((i) => i.organicResults || [i]);
    const listings = [];
    for (const r of results) {
      const url = r.url || r.link || "";
      if (!url.includes(site.domain)) continue;
      const text = `${r.title || ""} ${r.description || r.snippet || ""}`;
      const price = extractPrice(text);
      if (!price) continue;
      listings.push({
        title: (r.title || "").substring(0, 140),
        price,
        mileage: extractMileage(text),
        year: extractYear(text),
        dealer: site.platform,
        platform: site.domain,
        saleType: site.saleType,
        url,
      });
    }
    return listings;
  } catch (err) {
    console.log(`site-serp[${site.domain}] failed: ${err.message}`);
    return [];
  }
}

export async function scrapeAllSites({ make, model, yearFrom, yearTo, include = ["retail", "auction", "specialist"] }) {
  if (!process.env.APIFY_API_KEY) return { listings: [], bySaleType: {} };

  const selected = SITES.filter((s) => include.includes(s.saleType));
  const results = await Promise.allSettled(
    selected.map((s) => scrapeSite(s, make, model, yearFrom, yearTo))
  );

  const listings = [];
  const bySaleType = { retail: 0, auction: 0, specialist: 0 };
  const byPlatform = {};
  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== "fulfilled") continue;
    const siteResults = results[i].value;
    const site = selected[i];
    bySaleType[site.saleType] = (bySaleType[site.saleType] || 0) + siteResults.length;
    byPlatform[site.platform] = siteResults.length;
    listings.push(...siteResults);
  }

  return { listings, bySaleType, byPlatform };
}

export const KNOWN_SITES = SITES;
