/**
 * Goo-net.com scraper — Japan's largest used car marketplace.
 * Uses Apify web-scraper (Puppeteer) for JS-rendered pages.
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

const MAKE_SLUGS = {
  "Ferrari": "FERRARI",
  "Mercedes-AMG": "MERCEDES_BENZ",
  "Porsche": "PORSCHE",
  "Lamborghini": "LAMBORGHINI",
  "Bentley": "BENTLEY",
  "Aston Martin": "ASTON_MARTIN",
  "Maserati": "MASERATI",
  "BMW": "BMW",
  "BMW M": "BMW",
  "Jaguar": "JAGUAR",
  "Range Rover": "LAND_ROVER",
};

/**
 * Scrape Goo-net for Japanese used car listings.
 */
export async function scrapeGooNet({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  if (!process.env.APIFY_API_KEY) {
    console.warn("goo-net: no APIFY_API_KEY, skipping");
    return listings;
  }

  try {
    const makeSlug = MAKE_SLUGS[make] || make.toUpperCase().replace(/\s+/g, "_");
    const params = new URLSearchParams();
    if (yearFrom) params.set("year_from", String(yearFrom));
    if (yearTo) params.set("year_to", String(yearTo));
    if (maxMileage) params.set("mileage_to", String(maxMileage));

    const targetUrl = `https://www.goo-net.com/usedcar/brand-${makeSlug}/${params.toString() ? "?" + params : ""}`;

    console.log(`goo-net: fetching via Apify web-scraper for ${make} ${model}...`);
    const items = await runActorAndGetItems("apify~web-scraper", {
      startUrls: [{ url: targetUrl }],
      pageFunction: `async function pageFunction(context) {
        await context.waitFor(3000);
        const html = await context.page.content();
        await context.pushData({ html });
      }`,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      maxRequestsPerCrawl: 1,
    });

    const html = items?.[0]?.html || "";
    if (!html) {
      console.warn("goo-net: no HTML returned");
      return listings;
    }

    const $ = cheerio.load(html);
    const modelLower = model.toLowerCase();

    // Goo-net uses .catalog_detail_inner or similar card structures
    $(".catalog_detail, .cassette, [class*='car_list'] li, .list_body_inner, article").each((_, el) => {
      try {
        const card = $(el);
        const text = card.text().replace(/\s+/g, " ").trim();
        if (!text || text.length < 20) return;

        // Check if model matches
        const textLower = text.toLowerCase();
        const modelWords = modelLower.split(/\s+/).filter((w) => w.length >= 2);
        if (!modelWords.some((w) => textLower.includes(w))) return;

        // Extract title
        let title = card.find("h3, h4, .car_name, .name, a[class*='name']").first().text().trim();
        if (!title) title = text.substring(0, 80);

        // Extract price in 万円 (man-yen = 10,000 yen)
        const priceManMatch = text.match(/([\d,.]+)\s*万円/);
        const pricePlainMatch = text.match(/¥\s*([\d,]+)/);
        let priceJpy = 0;
        if (priceManMatch) {
          priceJpy = Math.round(parseFloat(priceManMatch[1].replace(/,/g, "")) * 10000);
        } else if (pricePlainMatch) {
          priceJpy = parseInt(pricePlainMatch[1].replace(/,/g, ""));
        }
        if (!priceJpy || priceJpy < 500000) return; // Skip unrealistic prices

        // Extract mileage
        const kmMatch = text.match(/([\d,.]+)\s*(km|万km)/i);
        let mileage = 0;
        if (kmMatch) {
          mileage = parseFloat(kmMatch[1].replace(/,/g, ""));
          if (kmMatch[2] === "万km") mileage *= 10000;
          mileage = Math.round(mileage);
        }

        // Extract year
        const yearMatch = text.match(/(20[012]\d)\s*年/) || text.match(/\b(20[012]\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;

        // Extract color
        const colorMatch = text.match(/色[：:]?\s*(\S+)/) || text.match(/(ブラック|ホワイト|シルバー|レッド|ブルー|グレー|イエロー)/);
        const color = colorMatch ? colorMatch[1] : null;

        // Build listing URL
        const link = card.find("a").first().attr("href") || "";
        const fullUrl = link ? (link.startsWith("http") ? link : `https://www.goo-net.com${link}`) : "https://www.goo-net.com";

        listings.push({
          title: title.substring(0, 120),
          priceJpy,
          mileage,
          year,
          color,
          platform: "goo-net.com",
          url: fullUrl,
          location: "Japan",
        });
      } catch (e) {}
    });

    console.log(`goo-net: ${listings.length} matching "${model}" listings extracted`);
  } catch (err) {
    console.error("goo-net error:", err.message);
  }

  return listings;
}
