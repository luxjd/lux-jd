/**
 * elferspot.com scraper — Porsche specialist platform.
 * Per spec Section 6.1.2: "elferspot.com (Porsche-specific)"
 * Per spec Section 8.1: "Higher conversion rate for Porsche listings than generalist platforms"
 *
 * elferspot has clean HTML and is not heavily protected — direct fetch works.
 */

import * as cheerio from "cheerio";

const BASE_URL = "https://www.elferspot.com";

/**
 * Scrape elferspot.com for Porsche listings.
 * @param {object} params - { model, yearFrom, yearTo, maxMileage }
 * @returns {Array} listings
 */
export async function scrapeElferspot({ model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  try {
    // Map model names to elferspot URL slugs
    const modelSlug = getModelSlug(model);

    const params = new URLSearchParams({
      ...(yearFrom && { year_from: String(yearFrom) }),
      ...(yearTo && { year_to: String(yearTo) }),
      ...(maxMileage && { mileage_to: String(maxMileage) }),
      sort: "date_desc",
    });

    const url = modelSlug
      ? `${BASE_URL}/marktplatz/porsche/${modelSlug}?${params}`
      : `${BASE_URL}/marktplatz/porsche?${params}`;

    console.log(`elferspot: fetching ${url}`);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`elferspot: HTTP ${res.status}`);
      return listings;
    }

    const html = await res.text();
    if (html.length < 2000) {
      console.warn(`elferspot: response too small (${html.length} chars)`);
      return listings;
    }

    const $ = cheerio.load(html);

    // elferspot uses article/card elements for listings
    $("article, .listing-card, .vehicle-card, [class*='listing'], [class*='vehicle']").each((_, el) => {
      try {
        const card = $(el);
        const title = card.find("h2, h3, .title, [class*='title']").first().text().trim();
        if (!title || title.length < 5) return;

        const text = card.text().replace(/\s+/g, " ");

        // Price
        const priceMatch = text.match(/(\d{2,3})[.,](\d{3})\s*€/) || text.match(/€\s*(\d{2,3})[.,](\d{3})/);
        let price = 0;
        if (priceMatch) {
          price = parseInt(`${priceMatch[1]}${priceMatch[2]}`);
          if (price < 20000 || price > 1500000) price = 0;
        }
        if (!price) return;

        const kmMatch = text.match(/([\d.,]+)\s*km/);
        const mileage = kmMatch ? parseInt(kmMatch[1].replace(/[.,]/g, "")) : 0;

        const yearMatch = text.match(/\b(20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        const link = card.find("a").first().attr("href") || "";
        const fullUrl = link ? (link.startsWith("http") ? link : `${BASE_URL}${link}`) : BASE_URL;

        listings.push({
          title: title.substring(0, 120),
          price,
          mileage,
          year,
          dealer: null,
          platform: "elferspot.com",
          url: fullUrl,
        });
      } catch (e) {}
    });

    console.log(`elferspot: ${listings.length} listings extracted`);
  } catch (err) {
    console.error("elferspot error:", err.message);
  }

  return listings;
}

function getModelSlug(model) {
  const m = (model || "").toLowerCase();
  if (/911|992|991|997|996/.test(m)) return "911";
  if (/718|cayman|boxster/.test(m)) return "718";
  if (/cayenne/.test(m)) return "cayenne";
  if (/macan/.test(m)) return "macan";
  if (/panamera/.test(m)) return "panamera";
  if (/taycan/.test(m)) return "taycan";
  if (/gt3/.test(m)) return "911-gt3";
  if (/gt4/.test(m)) return "718-cayman-gt4";
  if (/gt2/.test(m)) return "911-gt2";
  if (/turbo/.test(m)) return "911-turbo";
  return null;
}
