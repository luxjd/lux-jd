/**
 * autoscout24.de scraper — uses Apify cheerio-scraper actor.
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "./apify-client";

const MAKE_SLUGS = {
  "Ferrari": "ferrari", "Mercedes-AMG": "mercedes-benz", "Porsche": "porsche",
  "Jaguar": "jaguar", "Bentley": "bentley", "Aston Martin": "aston-martin",
  "Lamborghini": "lamborghini", "Maserati": "maserati", "BMW M": "bmw",
  "BMW": "bmw", "Range Rover": "land-rover",
};

export async function scrapeAutoScout24({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  if (!process.env.APIFY_API_KEY) {
    console.warn("autoscout24: no APIFY_API_KEY, skipping");
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

    console.log(`autoscout24: fetching via Apify cheerio-scraper...`);
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
      console.warn("autoscout24: no HTML returned from Apify");
      return listings;
    }

    const $ = cheerio.load(html);
    // Build model match words — keep short words like XK, GT, DB, RS etc.
    const modelWords = model.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    // Map common EN→DE terms for German listings
    const termMap = { "convertible": "cabrio", "coupe": "coupé", "roadster": "roadster", "sedan": "limousine", "estate": "kombi" };
    const extraWords = modelWords.map((w) => termMap[w]).filter(Boolean);
    const allMatchWords = [...modelWords, ...extraWords];

    $("article").each((_, el) => {
      try {
        const card = $(el);
        const title = card.find("h2").first().text().trim();
        if (!title) return;

        // Filter to matching model — match any word from model name or DE equivalent
        const titleLower = title.toLowerCase();
        if (!allMatchWords.some((w) => titleLower.includes(w))) return;

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
