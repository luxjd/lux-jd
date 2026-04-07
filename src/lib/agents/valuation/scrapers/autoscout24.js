/**
 * autoscout24.de scraper — uses ScrapingBee with JS rendering.
 * Costs 25 credits per request.
 */

import * as cheerio from "cheerio";

const SCRAPINGBEE_URL = "https://app.scrapingbee.com/api/v1/";

const MAKE_SLUGS = {
  "Ferrari": "ferrari", "Mercedes-AMG": "mercedes-benz", "Porsche": "porsche",
  "Jaguar": "jaguar", "Bentley": "bentley", "Aston Martin": "aston-martin",
  "Lamborghini": "lamborghini", "Maserati": "maserati", "BMW M": "bmw",
  "BMW": "bmw", "Range Rover": "land-rover",
};

function getApiKey() {
  return process.env.SCRAPINGBEE_API_KEY || "";
}

export async function scrapeAutoScout24({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("autoscout24: no SCRAPINGBEE_API_KEY, skipping");
    return listings;
  }

  try {
    const makeSlug = MAKE_SLUGS[make] || make.toLowerCase().replace(/\s+/g, "-");
    const searchParams = new URLSearchParams({
      fregfrom: String(yearFrom), fregto: String(yearTo),
      sort: "standard", desc: "0", cy: "D",
    });
    if (maxMileage) searchParams.set("kmto", String(maxMileage));

    const targetUrl = `https://www.autoscout24.de/lst/${makeSlug}?${searchParams}`;

    const beeParams = new URLSearchParams({
      api_key: apiKey,
      url: targetUrl,
      render_js: "true",
      premium_proxy: "true",
      country_code: "de",
    });

    console.log(`autoscout24: fetching via ScrapingBee...`);
    const res = await fetch(`${SCRAPINGBEE_URL}?${beeParams}`, { signal: AbortSignal.timeout(45000) });

    if (!res.ok) {
      console.warn(`autoscout24: ScrapingBee returned ${res.status}`);
      return listings;
    }

    console.log(`autoscout24: ${res.status}, credits: ${res.headers.get("spb-cost")}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const modelWords = model.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);

    $("article").each((_, el) => {
      try {
        const card = $(el);
        const title = card.find("h2").first().text().trim();
        if (!title) return;

        // Filter to matching model
        const titleLower = title.toLowerCase();
        if (!modelWords.some((w) => titleLower.includes(w))) return;

        const text = card.text().replace(/\s+/g, " ");

        // Price: xxx.xxx format, skip numbers followed by "km"
        const priceMatches = text.match(/(\d{2,3})\.(\d{3})(?!\s*km)/g);
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

        const yearMatch = text.match(/(?:\d{2}\/)(20\d{2})/) || text.match(/\b(20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        const link = card.find('a[href*="/angebote/"]').first().attr("href") || "";
        const fullUrl = link ? (link.startsWith("http") ? link : `https://www.autoscout24.de${link}`) : "https://www.autoscout24.de";

        listings.push({ title: title.substring(0, 120), price, mileage, year, dealer: null, platform: "autoscout24.de", url: fullUrl });
      } catch (e) {}
    });

    console.log(`autoscout24: ${listings.length} matching "${model}" listings extracted`);
  } catch (err) {
    console.error("autoscout24 error:", err.message);
  }

  return listings;
}
