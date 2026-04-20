/**
 * Auction houses + specialist marketplaces scraper (spec §6.1.2).
 *
 * Sources wired (per `luxury_auto_arbitrage_1.docx` §6.1.2):
 *   - collectingcars.com    — UK enthusiast online auction marketplace
 *   - bfrm.io               — Ferrari-specific marketplace
 *   - rmsothebys.com        — RM Sotheby's auction results
 *   - bonhams.com           — Bonhams auction results
 *   - artcurial.com         — Artcurial (Paris) auction results
 *
 * Strategy — single Google SERP query scoped to the 5 domains via
 * `site:X OR site:Y OR …`. The Apify `apify~google-search-scraper` actor
 * handles CAPTCHAs and returns organic results with title + snippet + URL.
 *
 * Why SERP instead of per-site scrapers:
 *   - Auction result pages are often JS-rendered or session-gated
 *   - Google cleanly indexes realized prices in the snippet
 *   - One Apify call covers all 5 sites (cost-efficient)
 *
 * Prices appear in mixed currencies (EUR / USD / GBP). We apply a rough FX
 * multiplier to produce EUR-comparable numbers. These prices are used for
 * aggregate trend + median calculations — they're not used for individual
 * financial decisions, so approximate FX is acceptable here.
 */

import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

const AUCTION_DOMAINS = [
  { domain: "collectingcars.com", saleType: "auction",    currency: "GBP", name: "Collecting Cars" },
  { domain: "bfrm.io",            saleType: "specialist", currency: "EUR", name: "BFRM" },
  { domain: "rmsothebys.com",     saleType: "auction",    currency: "USD", name: "RM Sotheby's" },
  { domain: "bonhams.com",        saleType: "auction",    currency: "GBP", name: "Bonhams" },
  { domain: "artcurial.com",      saleType: "auction",    currency: "EUR", name: "Artcurial" },
];

// Approximate cross-currency conversion for snippet prices. These are
// aggregation-time estimates, not hard financial calcs.
const FX_APPROX = { EUR: 1.0, USD: 0.92, GBP: 1.17 };

// Reject SEO / category landing pages rather than individual lots.
function isAggregatorTitle(title) {
  if (!title) return false;
  const t = String(title).trim();
  return (
    /^\d{1,5}\s+(cars?|results|vehicles|lots)/i.test(t) ||
    /\b(all|alle)\s+(results|cars|lots)\b/i.test(t) ||
    /\bcategory\b/i.test(t) ||
    /\bpast\s+auctions\b/i.test(t)
  );
}

// Relaxed variant match — for auction titles which usually include the full
// brand + model prefix. We require brand token + first 3-5 chars of model.
function matchesVariant(title, make, model) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-.()]+/g, "");
  const titleNorm = norm(title);
  const modelNorm = norm(model);
  const makeLc = String(make || "").toLowerCase();
  if (!titleNorm) return false;
  const brandToken = makeLc.split(/[\s-]/)[0];
  if (!titleNorm.includes(brandToken)) return false;
  if (modelNorm.length < 3) return true;
  const prefix = modelNorm.slice(0, Math.min(5, modelNorm.length));
  return titleNorm.includes(prefix);
}

function parsePrice(text, currency) {
  const mul = FX_APPROX[currency] || 1.0;
  const patterns = [
    /€\s?(\d{2,3})[.,](\d{3})/g,
    /(\d{2,3})[.,](\d{3})\s?€/g,
    /\$\s?(\d{2,3})[.,](\d{3})/g,
    /£\s?(\d{2,3})[.,](\d{3})/g,
    /\b(EUR|USD|GBP)\s?(\d{2,3})[.,](\d{3})\b/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const numStr = m.length === 4 ? m[2] + m[3] : m[1] + m[2];
      const raw = parseInt(numStr, 10);
      if (raw >= 20000 && raw <= 2000000) {
        return Math.round(raw * mul);
      }
    }
  }
  return null;
}

function parseYear(text) {
  const m = text.match(/\b(19[89]\d|20[012]\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

function parseMileage(text) {
  const m = text.match(/([\d.,]+)\s*(km|miles?|mi\b)/i);
  if (!m) return null;
  const val = parseInt(m[1].replace(/[.,]/g, ""), 10);
  if (isNaN(val) || val <= 0) return null;
  const isMiles = /miles?|mi\b/i.test(m[2]);
  return isMiles ? Math.round(val * 1.609) : val;
}

/**
 * Scrape auction houses + specialist marketplaces for the given model.
 * @returns {{ listings: Array<{title,price,mileage,year,dealer,platform,url,saleType}>, searched: boolean }}
 */
export async function scrapeAuctionHouses({ make, model, yearFrom, yearTo }) {
  if (!process.env.APIFY_API_KEY) {
    console.log("auction-houses: no APIFY_API_KEY — skipping");
    return { listings: [], searched: false };
  }

  const modelClean = String(model || "").replace(/\(.*?\)/g, "").trim();
  const sitesClause = AUCTION_DOMAINS.map((d) => `site:${d.domain}`).join(" OR ");
  const yearClause = yearFrom && yearTo && yearFrom !== yearTo
    ? `${yearFrom}..${yearTo}`
    : (yearFrom || yearTo || "");
  const query = `(${sitesClause}) "${make}" "${modelClean}" ${yearClause}`.trim();

  const listings = [];
  try {
    console.log(`auction-houses: search — "${query}"`);
    const items = await runActorAndGetItems("apify~google-search-scraper", {
      queries: query,
      maxPagesPerQuery: 2,
      resultsPerPage: 20,
      languageCode: "en",
      countryCode: "de",
    });

    const results = items?.[0]?.organicResults
      || items?.flatMap((i) => i.organicResults || [i])
      || [];
    const seen = new Set();

    for (const r of results) {
      const url = r.url || r.link || "";
      const title = (r.title || "").substring(0, 140);
      const snippet = r.description || r.snippet || "";
      const text = `${title} ${snippet}`;

      const matched = AUCTION_DOMAINS.find((d) => url.includes(d.domain));
      if (!matched) continue;
      if (isAggregatorTitle(title)) continue;
      if (!matchesVariant(title, make, model)) continue;

      const price = parsePrice(text, matched.currency);
      if (!price) continue;

      const key = url || `${price}-${title}`;
      if (seen.has(key)) continue;
      seen.add(key);

      listings.push({
        title,
        price,
        mileage: parseMileage(text) || 0,
        year: parseYear(text),
        dealer: matched.name,
        platform: matched.domain,
        url,
        saleType: matched.saleType,
      });
    }
  } catch (err) {
    console.warn(`auction-houses: search failed — ${err.message}`);
    return { listings: [], searched: true, error: err.message };
  }

  const bySaleType = listings.reduce((acc, l) => {
    acc[l.saleType] = (acc[l.saleType] || 0) + 1;
    return acc;
  }, {});
  console.log(`auction-houses: found ${listings.length} listings across ${Object.keys(listings.reduce((a, l) => ({ ...a, [l.platform]: 1 }), {})).length} domains (${JSON.stringify(bySaleType)})`);

  return { listings, searched: true };
}

export { AUCTION_DOMAINS };
