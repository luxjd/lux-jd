/**
 * mobile.de scraper — multi-strategy approach for reliability.
 *
 * Strategy waterfall:
 * 1. Generic Apify web-scraper with residential proxy (Puppeteer)
 * 2. Google SERP scraping (site:mobile.de) — when direct scraping is blocked
 *
 * mobile.de uses DataDome anti-bot protection which blocks most scrapers.
 * The Google SERP fallback ensures we can still get pricing data.
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "./apify-client";
import { normalizeMobileDe } from "./model-normalizer";
import { buildMobileDeSearchUrl } from "./search-urls";

export async function scrapeMobileDe({ make, model, yearFrom, yearTo, maxMileage }) {
  const searchUrl = buildMobileDeSearchUrl({ make, model, yearFrom, yearTo, maxMileage });

  if (!process.env.APIFY_API_KEY) {
    console.warn("mobile.de: no APIFY_API_KEY, skipping");
    return { listings: [], searchUrl };
  }

  const { searchModel, makeId, modelId } = normalizeMobileDe(make, model);
  console.log(`mobile.de: searching "${searchModel}" (makeId=${makeId}, modelId=${modelId || "none"})`);

  // ── Strategy 1: Generic web-scraper with residential proxy ──
  let listings = await tryGenericScraper(searchUrl);
  if (listings.length > 0) {
    console.log(`mobile.de: ${listings.length} listings from generic scraper`);
    return { listings, searchUrl };
  }

  // ── Strategy 2: Google SERP fallback ──
  listings = await tryGoogleSerp(make, searchModel, yearFrom, yearTo);
  if (listings.length > 0) {
    console.log(`mobile.de: ${listings.length} listings from Google SERP fallback`);
    return { listings, searchUrl };
  }

  console.warn("mobile.de: all strategies failed — no listings found");
  return { listings: [], searchUrl };
}

// ══════════════════════════════════════════
// Strategy 1: Generic Apify web-scraper
// ══════════════════════════════════════════

async function tryGenericScraper(targetUrl) {
  try {
    console.log("mobile.de: trying web-scraper with residential proxy...");

    const items = await runActorAndGetItems("apify~web-scraper", {
      startUrls: [{ url: targetUrl }],
      pageFunction: `async function pageFunction(context) {
        // Accept cookies / consent dialogs
        try {
          const selectors = [
            '[data-testid="gdpr-consent-accept-btn"]',
            '.mde-consent-accept-btn',
            '#consentAccept',
            'button[class*="accept"]',
            '[id*="accept"]',
          ];
          for (const sel of selectors) {
            const btn = await context.page.$(sel);
            if (btn) { await btn.click(); break; }
          }
        } catch(e) {}
        // Wait for content to load
        await context.waitFor(6000);
        const html = await context.page.content();
        // If page is too small, it's likely a challenge page — wait more
        if (html.length < 5000) {
          await context.waitFor(6000);
        }
        const finalHtml = await context.page.content();
        await context.pushData({ html: finalHtml });
      }`,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      maxRequestsPerCrawl: 1,
    });

    const html = items?.[0]?.html || "";
    if (!html || html.length < 2000) {
      console.log(`mobile.de: web-scraper returned ${html.length} chars (likely blocked)`);
      return [];
    }

    return parseListingsFromHtml(html);
  } catch (err) {
    console.log(`mobile.de: web-scraper failed: ${err.message}`);
    return [];
  }
}

// ══════════════════════════════════════════
// Strategy 2: Google SERP fallback
// Uses Google to find mobile.de listings with prices
// ══════════════════════════════════════════

async function tryGoogleSerp(make, searchModel, yearFrom, yearTo) {
  try {
    const query = `site:mobile.de "${make}" "${searchModel}" ${yearFrom}-${yearTo}`;
    console.log(`mobile.de: trying Google SERP — query: "${query}"`);

    // Use the official Apify Google SERP actor
    const items = await runActorAndGetItems("apify~google-search-scraper", {
      queries: query,
      maxPagesPerQuery: 2,
      resultsPerPage: 20,
      mobileResults: false,
      languageCode: "de",
      countryCode: "de",
    });

    if (!items || items.length === 0) {
      console.log("mobile.de: Google SERP returned no items");
      return [];
    }

    // Google search results — handle both array-of-results and nested format
    const listings = [];
    const results = items[0]?.organicResults || items.flatMap(i => i.organicResults || [i]);

    for (const result of results) {
      const url = result.url || result.link || "";
      const title = result.title || "";
      const snippet = result.description || result.snippet || "";

      if (!url.includes("mobile.de") || !url.includes("fahrzeuge")) continue;

      // Extract price from snippet or title (format: "€ 89.900" or "89.900 €" or "EUR 89.900")
      const combined = `${title} ${snippet}`;
      const priceMatches = combined.match(/€?\s?(\d{2,3})[.\s](\d{3})\s?€?/g) || [];
      let price = 0;
      for (const pm of priceMatches) {
        const num = parseInt(pm.replace(/[€\s.]/g, ""));
        if (num >= 20000 && num <= 1500000) { price = num; break; }
      }
      if (!price) continue;

      const kmMatch = combined.match(/([\d.]+)\s*km/);
      let mileage = kmMatch ? parseInt(kmMatch[1].replace(/\./g, "")) : 0;
      if (!Number.isFinite(mileage) || mileage > 999999 || mileage < 0) mileage = 0;

      const yearMatch = combined.match(/\b(20[012]\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      listings.push({
        title: title.substring(0, 120),
        price,
        mileage,
        year,
        dealer: null,
        platform: "mobile.de",
        url,
      });
    }

    return listings;
  } catch (err) {
    console.log(`mobile.de: Google SERP failed: ${err.message}`);
    return [];
  }
}

// ══════════════════════════════════════════
// HTML Parser (used by generic scraper)
// ══════════════════════════════════════════

function parseListingsFromHtml(html) {
  const $ = cheerio.load(html);
  const listings = [];
  const seenUrls = new Set();

  $('a[href*="/fahrzeuge/details"]').each((_, el) => {
    try {
      const link = $(el);
      const href = link.attr("href") || "";
      const fullUrl = href.startsWith("http") ? href : `https://www.mobile.de${href}`;
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const block = link.parent().parent().parent();
      const text = block.text().replace(/\s+/g, " ");

      let title = link.find("h2,h3").text().trim() || link.attr("title") || "";
      title = title.replace(/^Gesponsert(NEU)?/i, "").trim();
      if (!title || title.length < 5) return;

      const priceMatches = text.match(/(\d{2,3})\.(\d{3})/g);
      let price = 0;
      if (priceMatches) {
        for (const pm of priceMatches) {
          const num = parseInt(pm.replace(/\./g, ""));
          if (num >= 20000 && num <= 1500000) { price = num; break; }
        }
      }
      if (!price) return;

      const kmMatch = text.match(/([\d.]+)\s*km/);
      let mileage = kmMatch ? parseInt(kmMatch[1].replace(/\./g, "")) : 0;
      if (!Number.isFinite(mileage) || mileage > 999999 || mileage < 0) mileage = 0;

      const yearMatch = text.match(/\b(20[012]\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      listings.push({ title: title.substring(0, 120), price, mileage, year, dealer: null, platform: "mobile.de", url: fullUrl });
    } catch (e) {}
  });

  return listings;
}
