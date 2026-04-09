/**
 * mobile.de scraper — uses Apify web-scraper actor (Puppeteer-based) to bypass Cloudflare.
 */

import * as cheerio from "cheerio";
import { runActorAndGetItems } from "./apify-client";

const MAKE_IDS = {
  "Ferrari": "8600", "Porsche": "20100", "Lamborghini": "12600",
  "Bentley": "3500", "Aston Martin": "1900", "Jaguar": "11400",
  "Maserati": "14100", "Range Rover": "13200",
  // Mercedes variants all use same ID
  "Mercedes-AMG": "17200", "Mercedes-Benz": "17200", "Mercedes": "17200",
  // BMW variants
  "BMW M": "3500", "BMW": "3500",
  // Land Rover / Range Rover
  "Land Rover": "13200",
  // Additional luxury brands
  "Rolls-Royce": "21700", "McLaren": "45400", "Bugatti": "4100",
  "Lotus": "13900", "Alfa Romeo": "900",
};

export async function scrapeMobileDe({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  if (!process.env.APIFY_API_KEY) {
    console.warn("mobile.de: no APIFY_API_KEY, skipping");
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

    console.log(`mobile.de: fetching via Apify web-scraper... URL: ${targetUrl}`);
    const items = await runActorAndGetItems("apify~web-scraper", {
      startUrls: [{ url: targetUrl }],
      pageFunction: `async function pageFunction(context) {
        // Accept cookies if consent dialog appears
        try {
          const consentBtn = await context.page.$('[data-testid="gdpr-consent-accept-btn"], .mde-consent-accept-btn, #consentAccept, button[class*="accept"]');
          if (consentBtn) await consentBtn.click();
        } catch(e) {}
        // Wait for listings to load (not just page load)
        await context.waitFor(5000);
        // Check if we got actual content or a challenge page
        const html = await context.page.content();
        if (html.length < 5000) {
          // Probably a challenge/CAPTCHA page, wait longer
          await context.waitFor(5000);
        }
        const finalHtml = await context.page.content();
        await context.pushData({ html: finalHtml });
      }`,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      maxRequestsPerCrawl: 1,
    });

    const html = items?.[0]?.html || "";
    if (!html || html.length < 2000) {
      console.warn(`mobile.de: no usable HTML returned from Apify (${html.length} chars — likely blocked or CAPTCHA)`);
      return listings;
    }

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
