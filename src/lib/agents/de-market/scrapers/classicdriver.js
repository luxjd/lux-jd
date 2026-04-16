/**
 * classicdriver.com scraper — premium platform for exotics and collector vehicles.
 * Per spec Section 6.1.2: "classicdriver.com (exotics and classics)"
 * Per spec Section 8.1: "Premium platform for exotics and collector vehicles.
 *   Ferrari, Aston Martin, Bentley, and Lamborghini perform well here."
 *
 * ClassicDriver has a relatively clean HTML structure and an API-like search.
 */

import * as cheerio from "cheerio";

const BASE_URL = "https://www.classicdriver.com";

// Brands that perform well on ClassicDriver per spec
const SUPPORTED_BRANDS = [
  "Ferrari", "Lamborghini", "Aston Martin", "Bentley",
  "Rolls-Royce", "McLaren", "Maserati", "Porsche", "Bugatti",
  "Mercedes-Benz", "Mercedes-AMG", "BMW M",
];

/**
 * Scrape classicdriver.com for luxury/exotic listings.
 * @param {object} params - { make, model, yearFrom, yearTo, maxMileage }
 * @returns {Array} listings
 */
export async function scrapeClassicDriver({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  // Only scrape brands that ClassicDriver is strong for
  if (!SUPPORTED_BRANDS.some((b) => make.includes(b) || b.includes(make))) {
    console.log(`classicdriver: skipping ${make} (not a specialist brand for this platform)`);
    return listings;
  }

  try {
    const makeSlug = getMakeSlug(make);
    const params = new URLSearchParams({
      "categories[]": "cars",
      make: makeSlug,
      ...(yearFrom && { year_from: String(yearFrom) }),
      ...(yearTo && { year_to: String(yearTo) }),
      ...(maxMileage && { mileage_to: String(maxMileage) }),
    });

    const url = `${BASE_URL}/en/cars?${params}`;
    console.log(`classicdriver: fetching ${make} ${model || ""}`);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9,de;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`classicdriver: HTTP ${res.status}`);
      return listings;
    }

    const html = await res.text();
    if (html.length < 2000) {
      console.warn(`classicdriver: response too small (${html.length} chars)`);
      return listings;
    }

    const $ = cheerio.load(html);
    const modelLower = (model || "").toLowerCase();
    const modelWords = modelLower.split(/\s+/).filter((w) => w.length >= 2);

    // ClassicDriver uses listing cards
    $("article, .listing, [class*='vehicle-card'], [class*='listing-item']").each((_, el) => {
      try {
        const card = $(el);
        const title = card.find("h2, h3, .title, [class*='title']").first().text().trim();
        if (!title || title.length < 5) return;

        // Filter by model if provided
        if (modelWords.length > 0) {
          const titleLower = title.toLowerCase();
          if (!modelWords.some((w) => titleLower.includes(w))) return;
        }

        const text = card.text().replace(/\s+/g, " ");

        // Price — ClassicDriver uses various formats: €189,000 / EUR 189.000 / Price on request
        let price = 0;
        const pricePatterns = [
          /€\s*([\d,. ]+)/,
          /EUR\s*([\d,. ]+)/,
          /([\d]{2,3})[.,]([\d]{3})\s*€/,
        ];
        for (const pattern of pricePatterns) {
          const match = text.match(pattern);
          if (match) {
            const raw = (match[1] + (match[2] || "")).replace(/[,.\s]/g, "");
            price = parseInt(raw);
            if (price >= 20000 && price <= 5000000) break;
            price = 0;
          }
        }
        if (!price) return; // Skip "Price on request"

        const kmMatch = text.match(/([\d.,]+)\s*km/);
        const mileage = kmMatch ? parseInt(kmMatch[1].replace(/[.,]/g, "")) : 0;

        const yearMatch = text.match(/\b(19[89]\d|20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        const link = card.find("a").first().attr("href") || "";
        const fullUrl = link ? (link.startsWith("http") ? link : `${BASE_URL}${link}`) : BASE_URL;

        listings.push({
          title: title.substring(0, 120),
          price,
          mileage,
          year,
          dealer: null,
          platform: "classicdriver.com",
          url: fullUrl,
        });
      } catch (e) {}
    });

    console.log(`classicdriver: ${listings.length} listings extracted for ${make}`);
  } catch (err) {
    console.error("classicdriver error:", err.message);
  }

  return listings;
}

function getMakeSlug(make) {
  const map = {
    "Ferrari": "ferrari", "Lamborghini": "lamborghini",
    "Aston Martin": "aston-martin", "Bentley": "bentley",
    "Rolls-Royce": "rolls-royce", "McLaren": "mclaren",
    "Maserati": "maserati", "Porsche": "porsche",
    "Bugatti": "bugatti",
    "Mercedes-Benz": "mercedes-benz", "Mercedes-AMG": "mercedes-benz",
    "BMW M": "bmw", "BMW": "bmw",
    "Jaguar": "jaguar",
  };
  return map[make] || make.toLowerCase().replace(/\s+/g, "-");
}
