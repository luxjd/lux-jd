/**
 * carsensor.net scraper — Major Japanese used car marketplace (Recruit-owned).
 * Uses Apify cheerio-scraper for HTML parsing.
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

const MAKE_CODES = {
  "Ferrari": "FE",
  "Mercedes-AMG": "ME",
  "Porsche": "PO",
  "Lamborghini": "LA",
  "Bentley": "BE",
  "Aston Martin": "AS",
  "Maserati": "MZ",
  "BMW": "BM",
  "BMW M": "BM",
  "Jaguar": "JA",
  "Range Rover": "LR",
};

/**
 * Scrape carsensor.net for Japanese used car listings.
 */
export async function scrapeCarsensor({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  if (!process.env.APIFY_API_KEY) {
    console.warn("carsensor: no APIFY_API_KEY, skipping");
    return listings;
  }

  try {
    const makeCode = MAKE_CODES[make] || make.substring(0, 2).toUpperCase();

    // Build carsensor search URL
    const params = new URLSearchParams();
    if (yearFrom) params.set("YMIN", String(yearFrom));
    if (yearTo) params.set("YMAX", String(yearTo));
    if (maxMileage) params.set("KMMAX", String(Math.round(maxMileage / 10000))); // in 万km

    const targetUrl = `https://www.carsensor.net/usedcar/b${makeCode}/index.html${params.toString() ? "?" + params : ""}`;

    console.log(`carsensor: fetching via Apify cheerio-scraper for ${make} ${model}...`);
    const items = await runActorAndGetItems("apify~cheerio-scraper", {
      startUrls: [{ url: targetUrl }],
      pageFunction: `async function pageFunction(context) {
        await context.pushData({ html: context.body });
      }`,
      proxyConfiguration: { useApifyProxy: true },
      maxRequestsPerCrawl: 1,
    });

    const html = items?.[0]?.html || "";
    if (!html) {
      console.warn("carsensor: no HTML returned");
      return listings;
    }

    const $ = cheerio.load(html);
    const modelLower = model.toLowerCase();

    // Carsensor uses various card formats
    $(".cassette, .js-listItemBody, .casetteWrap, [class*='used_car'] li, article, .list_item").each((_, el) => {
      try {
        const card = $(el);
        const text = card.text().replace(/\s+/g, " ").trim();
        if (!text || text.length < 20) return;

        // Check model match
        const textLower = text.toLowerCase();
        const modelWords = modelLower.split(/\s+/).filter((w) => w.length >= 2);
        if (!modelWords.some((w) => textLower.includes(w))) return;

        // Title
        let title = card.find("h3, h4, .car_name, .cassetteCarName, a[class*='name']").first().text().trim();
        if (!title) title = text.substring(0, 80);

        // Price in 万円
        const priceManMatch = text.match(/([\d,.]+)\s*万円/);
        const pricePlainMatch = text.match(/本体価格\s*([\d,.]+)/);
        let priceJpy = 0;
        if (priceManMatch) {
          priceJpy = Math.round(parseFloat(priceManMatch[1].replace(/,/g, "")) * 10000);
        } else if (pricePlainMatch) {
          priceJpy = Math.round(parseFloat(pricePlainMatch[1].replace(/,/g, "")) * 10000);
        }
        if (!priceJpy || priceJpy < 500000) return;

        // Mileage
        const kmManMatch = text.match(/([\d.]+)\s*万km/);
        const kmMatch = text.match(/([\d,]+)\s*km/i);
        let mileage = 0;
        if (kmManMatch) {
          mileage = Math.round(parseFloat(kmManMatch[1]) * 10000);
        } else if (kmMatch) {
          mileage = parseInt(kmMatch[1].replace(/,/g, ""));
        }

        // Year
        const yearMatch = text.match(/(20[012]\d)\s*[年(]/) || text.match(/\b(20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        // Color
        const colorMatch = text.match(/色\s*[：:]?\s*(\S+)/) || text.match(/(ブラック|ホワイト|シルバー|レッド|ブルー|グレー)/);
        const color = colorMatch ? colorMatch[1] : null;

        // URL
        const link = card.find("a").first().attr("href") || "";
        const fullUrl = link ? (link.startsWith("http") ? link : `https://www.carsensor.net${link}`) : "https://www.carsensor.net";

        listings.push({
          title: title.substring(0, 120),
          priceJpy,
          mileage,
          year,
          color,
          platform: "carsensor.net",
          url: fullUrl,
          location: "Japan",
        });
      } catch (e) {}
    });

    console.log(`carsensor: ${listings.length} matching "${model}" listings extracted`);
  } catch (err) {
    console.error("carsensor error:", err.message);
  }

  return listings;
}
