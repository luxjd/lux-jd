/**
 * mobile.de scraper — uses ScrapingBee stealth proxy (only service that bypasses their Cloudflare).
 * Costs 75 credits per request.
 */

import * as cheerio from "cheerio";

const SCRAPINGBEE_URL = "https://app.scrapingbee.com/api/v1/";

const MAKE_IDS = {
  "Ferrari": "8600", "Mercedes-AMG": "17200", "Porsche": "20100",
  "Jaguar": "11400", "Bentley": "3500", "Aston Martin": "1900",
  "Lamborghini": "12600", "Maserati": "14100", "BMW M": "3500",
  "BMW": "3500", "Range Rover": "13200",
};

function getApiKey() {
  return process.env.SCRAPINGBEE_API_KEY || "";
}

export async function scrapeMobileDe({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("mobile.de: no SCRAPINGBEE_API_KEY, skipping");
    return listings;
  }

  try {
    const makeId = MAKE_IDS[make] || "";
    const searchParams = new URLSearchParams({
      dam: "false", isSearchRequest: "true", s: "Car", vc: "Car",
      "makeModelVariant1.makeId": makeId,
      "makeModelVariant1.modelDescription": model,
      fr: `${yearFrom}:${yearTo}`,
    });
    if (maxMileage) searchParams.set("ml", `:${maxMileage}`);

    const targetUrl = `https://suchen.mobile.de/fahrzeuge/search.html?${searchParams}`;

    const beeParams = new URLSearchParams({
      api_key: apiKey,
      url: targetUrl,
      render_js: "false",
      premium_proxy: "true",
      stealth_proxy: "true",
      country_code: "de",
    });

    console.log(`mobile.de: fetching via ScrapingBee stealth...`);
    const res = await fetch(`${SCRAPINGBEE_URL}?${beeParams}`, { signal: AbortSignal.timeout(45000) });

    if (!res.ok) {
      console.warn(`mobile.de: ScrapingBee returned ${res.status}`);
      return listings;
    }

    console.log(`mobile.de: ${res.status}, credits: ${res.headers.get("spb-cost")}`);
    const html = await res.text();
    const $ = cheerio.load(html);

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
        const mileage = kmMatch ? parseInt(kmMatch[1].replace(/\./g, "")) : 0;

        const yearMatch = text.match(/\b(20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        listings.push({ title: title.substring(0, 120), price, mileage, year, dealer: null, platform: "mobile.de", url: fullUrl });
      } catch (e) {}
    });

    console.log(`mobile.de: ${listings.length} listings extracted`);
  } catch (err) {
    console.error("mobile.de error:", err.message);
  }

  return listings;
}
