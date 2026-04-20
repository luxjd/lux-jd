/**
 * autoscout24.de scraper — uses Apify cheerio-scraper actor.
 *
 * Enhanced with:
 * - Direct HTTP fetch first (no Apify needed, faster)
 * - Model slug in URL for precise results
 * - Fallback: model slug → make-only URL with title matching
 * - Fallback: cheerio-scraper → web-scraper (for JS-rendered pages)
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "./apify-client";
import { normalizeAutoScout24 } from "./model-normalizer";
import { buildAutoScout24SearchUrl } from "./search-urls";

export async function scrapeAutoScout24({ make, model, yearFrom, yearTo, maxMileage }) {
  const searchUrl = buildAutoScout24SearchUrl({ make, model, yearFrom, yearTo, maxMileage });

  if (!process.env.APIFY_API_KEY) {
    console.warn("autoscout24: no APIFY_API_KEY, skipping");
    return { listings: [], searchUrl };
  }

  try {
    const { makeSlug, modelSlug, matchWords } = normalizeAutoScout24(make, model);

    const searchParams = new URLSearchParams({
      fregfrom: String(yearFrom), fregto: String(yearTo),
      sort: "standard", desc: "0", cy: "D",
    });
    if (maxMileage) searchParams.set("kmto", String(maxMileage));

    // Note on `searchUrl` returned below: we always surface the make+search form (built at the
    // top of this function). The model-slug path (Attempt 1) can succeed at scrape time via
    // residential proxy but still 404 when a user clicks it in a browser — AutoScout24 rotates
    // those slugs. The make+search form is stable.

    // ── Attempt 1: Model-specific URL ──
    if (modelSlug) {
      const modelUrl = `https://www.autoscout24.de/lst/${makeSlug}/${modelSlug}?${searchParams}`;
      console.log(`autoscout24: trying ${makeSlug}/${modelSlug} — match words: [${matchWords.join(", ")}]`);

      let listings = await fetchAndParse(modelUrl, matchWords, true);
      if (listings.length > 0) {
        console.log(`autoscout24: ${listings.length} listings from model-specific URL`);
        return { listings, searchUrl };
      }
    }

    // ── Attempt 2: Make-only URL with text search ──
    const makeOnlyParams = new URLSearchParams(searchParams);
    makeOnlyParams.set("search", model);
    const makeUrl = `https://www.autoscout24.de/lst/${makeSlug}?${makeOnlyParams}`;
    console.log(`autoscout24: falling back to make-only URL with search="${model}"`);

    let listings = await fetchAndParse(makeUrl, matchWords, false);
    if (listings.length > 0) {
      console.log(`autoscout24: ${listings.length} listings from make-only search`);
      return { listings, searchUrl };
    }

    // ── Attempt 3: Make-only URL WITHOUT model filter (broadest) ──
    const broadUrl = `https://www.autoscout24.de/lst/${makeSlug}?${searchParams}`;
    console.log(`autoscout24: trying broadest search (make only, no model filter)`);

    listings = await fetchAndParse(broadUrl, matchWords, false);
    if (listings.length > 0) {
      console.log(`autoscout24: ${listings.length} listings from broad search`);
      return { listings, searchUrl };
    }

    console.log("autoscout24: all attempts returned 0 listings");
    return { listings: [], searchUrl };
  } catch (err) {
    console.error("autoscout24 error:", err.message);
    return { listings: [], searchUrl };
  }
}

/**
 * Fetch HTML from URL and parse listings.
 * Tries direct fetch first, falls back to Apify.
 */
async function fetchAndParse(url, matchWords, skipFilter) {
  let html = "";

  // ── Try direct HTTP fetch first (faster, no Apify cost) ──
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      html = await res.text();
      if (html.length > 5000) {
        console.log(`autoscout24: direct fetch got ${html.length} chars`);
      } else {
        html = ""; // Too small, likely blocked
      }
    }
  } catch {
    // Direct fetch failed, fall through to Apify
  }

  // ── Fallback to Apify cheerio-scraper ──
  if (!html) {
    try {
      const items = await runActorAndGetItems("apify~cheerio-scraper", {
        startUrls: [{ url }],
        pageFunction: `async function pageFunction(context) {
          await context.pushData({ html: context.body });
        }`,
        proxyConfiguration: { useApifyProxy: true },
        maxRequestsPerCrawl: 1,
      });
      html = items?.[0]?.html || "";
    } catch (err) {
      console.log(`autoscout24: cheerio-scraper failed: ${err.message}`);
      return [];
    }
  }

  if (!html || html.length < 1000) {
    console.log(`autoscout24: no usable HTML (${html.length} chars)`);
    return [];
  }

  return parseListings(html, matchWords, skipFilter);
}

/**
 * Parse AutoScout24 HTML for listings.
 *
 * Resilience strategy:
 *   - Multiple article-container selectors (AutoScout24 rotates `data-testid`
 *     values; the stable signal is "an element that contains a link to
 *     /angebote/…")
 *   - Title extraction falls through 6 selectors + link-text fallback
 *   - Title matching normalizes both sides (strips punctuation) so the
 *     `"c-class"` matchword actually matches a `"C 220d"` article title
 *   - Price pattern tries 3 shapes (dot-separator, comma-separator, €-prefix)
 *   - Per-reason rejection counters logged so we can see the next breakage
 *     at a glance
 */
function parseListings(html, matchWords, skipFilter) {
  const $ = cheerio.load(html);
  const listings = [];
  const reasons = { noTitle: 0, noPrice: 0, titleMismatch: 0, noListingLink: 0, kept: 0 };

  // Find candidate listing cards. The stable invariant across DOM rotations
  // is "an element that contains an `/angebote/` link" — everything else
  // (class names, data-testids) drifts.
  let articles = $("article");
  if (articles.length === 0) {
    // Try the known-structured selectors
    const structuredSelectors = [
      "[data-testid='listing-card']",
      "[data-testid='ad-card']",
      ".ListItem_wrapper__TxHWu",
      ".cl-list-element",
      "[data-item-id]",
    ];
    for (const sel of structuredSelectors) {
      articles = $(sel);
      if (articles.length > 0) break;
    }
  }
  if (articles.length === 0) {
    // Last resort: every link to /angebote/ is a listing; walk up to its
    // nearest block-level parent for context.
    articles = $('a[href*="/angebote/"]').map((_, a) => $(a).closest("article, li, div")).toArray();
  }

  console.log(`autoscout24: found ${articles.length} candidate listing cards in HTML`);

  const normalizeForMatch = (s) => String(s || "").toLowerCase().replace(/[\s\-.()]+/g, "");
  const normalizedMatchWords = (matchWords || []).map(normalizeForMatch).filter(Boolean);

  articles.each((_, el) => {
    try {
      const card = $(el);

      // ── Title: try 6 selectors, then fall back to first link's text ──
      const titleSelectors = [
        "h2", "h3",
        "[data-testid='listing-title']",
        "[data-testid='ad-title']",
        "[data-testid*='title']",
        "[class*='title' i]",
      ];
      let title = "";
      for (const sel of titleSelectors) {
        title = card.find(sel).first().text().trim();
        if (title && title.length >= 5) break;
      }
      if (!title || title.length < 5) {
        // Fall back to the first link's text or title attribute
        const firstLink = card.find('a[href*="/angebote/"]').first();
        title = firstLink.attr("title") || firstLink.text().trim();
      }
      // Clean common prefixes
      title = title.replace(/^(Gesponsert|NEU|Sponsored)\s*/i, "").trim();
      if (!title || title.length < 5) { reasons.noTitle++; return; }

      // ── Match filter: normalized substring check on both sides ──
      if (!skipFilter && normalizedMatchWords.length > 0) {
        const titleNorm = normalizeForMatch(title);
        const matches = normalizedMatchWords.some((w) => titleNorm.includes(w));
        if (!matches) { reasons.titleMismatch++; return; }
      }

      const text = card.text().replace(/\s+/g, " ");

      // ── Price: try 3 shapes ──
      let price = 0;
      const pricePatterns = [
        /(\d{2,3})\.(\d{3})(?!\s*km)/g,   // "89.900" not immediately followed by km
        /€\s*(\d{2,3})[.,](\d{3})/g,      // "€ 89.900" or "€ 89,900"
        /(\d{2,3})[.,](\d{3})\s*€/g,       // "89.900 €"
      ];
      for (const pattern of pricePatterns) {
        if (price) break;
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(text)) !== null) {
          const num = parseInt(m[1] + m[2], 10);
          if (num >= 20000 && num <= 1500000) { price = num; break; }
        }
      }
      if (!price) { reasons.noPrice++; return; }

      // ── Mileage / year ──
      const kmMatch = text.match(/([\d.]+)\s*km/);
      let mileage = kmMatch ? parseInt(kmMatch[1].replace(/\./g, ""), 10) : 0;
      if (!Number.isFinite(mileage) || mileage > 999999 || mileage < 0) mileage = 0;

      const yearMatch = text.match(/(?:\d{2}\/)(20\d{2})/) || text.match(/\b(20[012]\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

      // ── Listing URL: prefer /angebote/ link over any link ──
      const link = card.find('a[href*="/angebote/"], a[href*="/offers/"]').first().attr("href")
        || card.find("a").first().attr("href") || "";
      if (!link) { reasons.noListingLink++; return; }
      const fullUrl = link.startsWith("http") ? link : `https://www.autoscout24.de${link}`;

      listings.push({ title: title.substring(0, 120), price, mileage, year, dealer: null, platform: "autoscout24.de", url: fullUrl });
      reasons.kept++;
    } catch (e) {
      // swallow per-card errors — diagnostic counters surface the class
    }
  });

  console.log(`autoscout24 parse: kept=${reasons.kept}, titleMismatch=${reasons.titleMismatch}, noTitle=${reasons.noTitle}, noPrice=${reasons.noPrice}, noLink=${reasons.noListingLink}`);
  return listings;
}
