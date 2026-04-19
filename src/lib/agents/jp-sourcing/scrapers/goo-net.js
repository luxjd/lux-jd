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
  "Land Rover": "LAND_ROVER",
  "Range Rover": "LAND_ROVER",
};

// Goo-net vehicle-photo CDN hosts (whitelist — anything else is a promo/banner/asset).
const GOONET_PHOTO_HOSTS = /(^|\/\/)(img|cdn|www)\.goo-net\.com\/(kuruma|photo|images\/car|usedcar)/i;
const PROMO_URL_RX = /(cpn|bnr|banner|campaign|promo|event|present|gift|amazon|oshirase|coupon|popup|modal|\/pr\/|topimg|kyanpe|logo|icon|sprite|flag|spacer|blank|dummy|noimage|[_\-/]ad[_\-/]|sp_img\/bnr)/i;
const PROMO_ALT_RX = /(キャンペーン|プレゼント|当たる|ギフト|クーポン|amazon|広告|お知らせ|来店|成約)/i;

/**
 * Given Goo-net detail-page URLs, run Apify web-scraper to pull the full photo
 * gallery from each listing detail page. Returns {url: [photoUrls]}.
 */
async function fetchGooNetDetailPhotos(urls) {
  if (!urls.length) return {};
  // Puppeteer-based, ~6-10s per page — cap tighter than cheerio to stay inside Apify's 90s polling window.
  const startUrls = urls.slice(0, 25).map((u) => ({ url: u }));

  const pageFunction = `async function pageFunction(context) {
  await context.waitFor(2500);
  const photos = [];
  const seen = new Set();
  const BAD = /(cpn|bnr|banner|campaign|promo|event|present|gift|amazon|oshirase|coupon|popup|modal|\\/pr\\/|topimg|kyanpe|logo|icon|sprite|flag|spacer|blank|dummy|noimage|[_\\-\\/]ad[_\\-\\/]|sp_img\\/bnr)/i;
  const GOOD = /(^|\\/\\/)(img|cdn|www)\\.goo-net\\.com\\/(kuruma|photo|images\\/car|usedcar)/i;
  const BAD_ALT = /(キャンペーン|プレゼント|当たる|ギフト|クーポン|amazon|広告|お知らせ|来店|成約)/i;

  const candidates = await context.page.evaluate(() => {
    const out = [];
    // Helper: pick highest-res URL out of an srcset string.
    function pickLargest(srcset) {
      if (!srcset) return '';
      const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
      let best = '', bestScore = -1;
      for (const p of parts) {
        const bits = p.split(/\\s+/);
        const url = bits[0];
        const desc = bits[1] || '';
        if (!url) continue;
        const score = desc ? (parseInt(desc.replace(/[^0-9]/g, ''), 10) || 1) : 1;
        if (score > bestScore) { bestScore = score; best = url; }
      }
      return best;
    }
    const nodes = document.querySelectorAll('.photo_box img, .thumb_list img, .photoBox img, #photoAll img, [class*="photo_"] img, [class*="slide"] img, [class*="gallery"] img, [class*="thumbnail"] img, figure img, picture img, img[src*="img.goo-net.com/kuruma"], img[src*="img.goo-net.com/photo"], img[data-src*="img.goo-net.com/kuruma"]');
    for (const n of nodes) {
      const urls = [];
      // Prefer parent <a href="*.jpg"> (zoom link), then explicit large attrs, srcset, src.
      const parent = n.closest('a');
      if (parent) {
        const href = parent.getAttribute('href') || '';
        if (/\\.(jpe?g|png|webp)(\\?|$|#)/i.test(href)) urls.push(href);
      }
      const bigAttrs = ['data-zoom-src','data-large-src','data-large','data-original-src','data-src-lg','data-fullsrc','data-url'];
      for (const a of bigAttrs) { const v = n.getAttribute(a); if (v) urls.push(v); }
      const ss = pickLargest(n.getAttribute('srcset') || '');
      if (ss) urls.push(ss);
      const fallback = n.getAttribute('data-src') || n.getAttribute('data-original') || n.getAttribute('data-lazy') || n.getAttribute('src') || '';
      if (fallback) urls.push(fallback);
      const alt = (n.getAttribute('alt') || '').toString();
      const w = n.naturalWidth || n.width || 0;
      const h = n.naturalHeight || n.height || 0;
      for (const u of urls) out.push({ src: u, alt, w, h });
    }
    // Also scan inline JSON/scripts for goo-net photo URLs.
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const txt = (s.textContent || '').slice(0, 200000);
      const matches = txt.match(/https?:\\/\\/(?:img|cdn|www)\\.goo-net\\.com\\/[^"'\\s)]+?\\.(?:jpe?g|png|webp)/gi) || [];
      for (const m of matches) out.push({ src: m, alt: '', w: 0, h: 0 });
    }
    return out;
  });

  for (const img of candidates) {
    let abs = img.src;
    if (abs.startsWith('//')) abs = 'https:' + abs;
    if (!abs.startsWith('http')) continue;
    if (!/\\.(jpe?g|png|webp)(\\?|$|#)/i.test(abs)) continue;
    if (BAD.test(abs)) continue;
    if (BAD_ALT.test(img.alt)) continue;
    if (!GOOD.test(abs)) continue;
    if ((img.w && img.w < 80) || (img.h && img.h < 60)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    photos.push(abs);
  }

  await context.pushData({ url: context.request.url, photos });
}`;

  try {
    const items = await runActorAndGetItems("apify~web-scraper", {
      startUrls,
      pageFunction,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      maxRequestsPerCrawl: startUrls.length,
      maxConcurrency: 5,
    });
    const map = {};
    for (const item of items || []) {
      if (item?.url && Array.isArray(item.photos)) map[item.url] = item.photos;
    }
    return map;
  } catch (err) {
    console.warn(`goo-net: detail-photo fetch failed: ${err.message}`);
    return {};
  }
}

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

        // Card-level hero photos (strict whitelist). Detail-page fetch below is the real source.
        const photos = [];
        card.find(".photo_img img, .mainPhoto img, .photoBox img, figure img, picture img, [class*='carImg'] img, [class*='photo_'] img, [class*='thumb'] img, img[src*='img.goo-net.com/kuruma'], img[src*='img.goo-net.com/photo'], img[data-src*='img.goo-net.com/kuruma']").each((__, imgEl) => {
          if (photos.length >= 3) return false;
          const attrs = imgEl.attribs || {};
          let raw = attrs["data-src"] || attrs["data-original"] || attrs["data-lazy"] || attrs.src || "";
          if (!raw) return;
          let abs = raw.startsWith("//") ? `https:${raw}` : raw;
          if (!abs.startsWith("http")) return;
          if (!/\.(jpe?g|png|webp)(\?|$|#)/i.test(abs)) return;
          if (PROMO_URL_RX.test(abs)) return;
          const alt = (attrs.alt || "").toString();
          if (PROMO_ALT_RX.test(alt)) return;
          if (!GOONET_PHOTO_HOSTS.test(abs)) return;
          if (!photos.includes(abs)) photos.push(abs);
        });

        listings.push({
          title: title.substring(0, 120),
          priceJpy,
          mileage,
          year,
          color,
          platform: "goo-net.com",
          url: fullUrl,
          location: "Japan",
          photos,
        });
      } catch (e) {}
    });

    // Enrich each listing with its full detail-page photo gallery.
    const detailUrls = listings
      .map((l) => l.url)
      .filter((u) => u && u !== "https://www.goo-net.com" && /goo-net\.com\//i.test(u) && u !== targetUrl);
    if (detailUrls.length > 0) {
      console.log(`goo-net: fetching detail-page photos for ${detailUrls.length} listings...`);
      const photoMap = await fetchGooNetDetailPhotos(detailUrls);
      let enriched = 0;
      for (const l of listings) {
        const extra = photoMap[l.url] || [];
        if (extra.length > 0) {
          l.photos = Array.from(new Set([...extra, ...(l.photos || [])]));
          enriched++;
        }
      }
      console.log(`goo-net: enriched ${enriched}/${listings.length} listings with detail-page gallery`);
    }

    console.log(`goo-net: ${listings.length} matching "${model}" listings extracted`);
  } catch (err) {
    console.error("goo-net error:", err.message);
  }

  return listings;
}
