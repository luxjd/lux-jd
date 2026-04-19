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
  "Land Rover": "LR",
  "Range Rover": "LR",
};

// Carsensor vehicle-photo CDN hosts (whitelist — anything else is a promo/banner/asset).
const CARSENSOR_PHOTO_HOSTS = /(^|\/\/)(ccsrpcml|ccis|img|cdn)\.carsensor\.net\//i;
// Blacklist tokens that show up in promotional/asset URLs.
const PROMO_URL_RX = /(cpn|bnr|banner|campaign|promo|event|present|gift|amazon|oshirase|coupon|popup|modal|\/pr\/|topimg|kyanpe|logo|icon|sprite|flag|spacer|blank|dummy|noimage|[_\-/]ad[_\-/])/i;
const PROMO_ALT_RX = /(キャンペーン|プレゼント|当たる|ギフト|クーポン|amazon|広告|お知らせ|来店)/i;

/**
 * Given a list of Carsensor detail-page URLs, run Apify cheerio-scraper to pull
 * the full photo gallery from each detail page. Returns {url: [photoUrls]}.
 */
async function fetchCarsensorDetailPhotos(urls) {
  if (!urls.length) return {};
  const startUrls = urls.slice(0, 50).map((u) => ({ url: u }));

  const pageFunction = `async function pageFunction(context) {
  const $ = context.$;
  const photos = [];
  const seen = new Set();
  const BAD = /(cpn|bnr|banner|campaign|promo|event|present|gift|amazon|oshirase|coupon|popup|modal|\\/pr\\/|topimg|kyanpe|logo|icon|sprite|flag|spacer|blank|dummy|noimage|[_\\-\\/]ad[_\\-\\/])/i;
  const GOOD = /(^|\\/\\/)(ccsrpcml|ccis|img|cdn)\\.carsensor\\.net\\//i;
  const BAD_ALT = /(キャンペーン|プレゼント|当たる|ギフト|クーポン|amazon|広告|お知らせ|来店)/i;

  function pickLargest(srcset) {
    if (!srcset) return '';
    const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
    let best = '', bestScore = -1;
    for (const p of parts) {
      const [url, desc] = p.split(/\\s+/);
      if (!url) continue;
      const score = desc ? parseInt(desc.replace(/[^0-9]/g, ''), 10) || 1 : 1;
      if (score > bestScore) { bestScore = score; best = url; }
    }
    return best;
  }

  function considerUrl(raw, altText) {
    if (!raw) return;
    let abs = raw.trim();
    if (abs.startsWith('//')) abs = 'https:' + abs;
    if (!abs.startsWith('http')) return;
    if (!/\\.(jpe?g|png|webp)(\\?|$|#)/i.test(abs)) return;
    if (BAD.test(abs)) return;
    if (altText && BAD_ALT.test(altText)) return;
    if (!GOOD.test(abs)) return;
    // Carsensor CDN marks thumbnails by prefixing the filename with "S" (e.g.
    // SUZ0051707686_2_002.jpg = 2KB thumbnail; UZ0051707686_2_002.jpg = 46KB full-res).
    // Verified by direct CDN probing — strip leading "S" on the filename.
    abs = abs.replace(/\\/S([A-Z]{1,4}\\d+_\\d+_\\d+\\.(?:jpe?g|png|webp))/i, '/$1');
    if (seen.has(abs)) return;
    seen.add(abs);
    photos.push(abs);
  }

  // Prefer large-variant attributes, parent <a href> linking to the full image,
  // and the highest-resolution srcset entry. Fall back to src/data-src.
  $('.photoGalleryMain img, .photoGallery img, .mainPhoto img, .photo_slide img, .slideBox img, #slider img, #mainImg img, .thumb_list img, .photoArea img, [class*="photoList"] img, [class*="gallery"] img, [class*="slide"] img, figure img, picture img, img[src*="ccsrpcml"], img[src*="img.carsensor.net/CSphoto"], img[data-src*="ccsrpcml"], img[data-src*="img.carsensor.net/CSphoto"]').each((_, el) => {
    const attrs = el.attribs || {};
    const alt = (attrs.alt || '').toString();

    // 1. Parent <a href="...jpg"> is the classic zoom target on Carsensor
    const parent = el.parent;
    if (parent && parent.name === 'a') {
      const href = (parent.attribs && parent.attribs.href) || '';
      if (/\\.(jpe?g|png|webp)(\\?|$|#)/i.test(href)) considerUrl(href, alt);
    }
    // 2. Explicit large/zoom attributes
    considerUrl(attrs['data-zoom-src'] || attrs['data-large-src'] || attrs['data-large'] || attrs['data-original-src'] || attrs['data-src-lg'] || attrs['data-fullsrc'] || '', alt);
    // 3. srcset's largest entry
    considerUrl(pickLargest(attrs.srcset || ''), alt);
    // 4. Fallbacks
    considerUrl(attrs['data-src'] || attrs['data-original'] || attrs['data-lazy'] || attrs['data-lazyload'] || attrs.src || '', alt);
  });

  // Also harvest any image URL embedded in inline JSON/scripts (some pages
  // expose the photo list as a JS variable rather than DOM img tags).
  $('script').each((_, s) => {
    const txt = ($(s).html() || '').slice(0, 200000);
    const matches = txt.match(/https?:\\/\\/(?:ccsrpcml|ccis|img|cdn)\\.carsensor\\.net\\/[^"'\\s)]+?\\.(?:jpe?g|png|webp)/gi) || [];
    for (const m of matches) considerUrl(m, '');
  });

  await context.pushData({ url: context.request.url, photos });
}`;

  try {
    const items = await runActorAndGetItems("apify~cheerio-scraper", {
      startUrls,
      pageFunction,
      proxyConfiguration: { useApifyProxy: true },
      maxRequestsPerCrawl: startUrls.length,
      maxConcurrency: 10,
    });
    const map = {};
    for (const item of items || []) {
      if (item?.url && Array.isArray(item.photos)) map[item.url] = item.photos;
    }
    return map;
  } catch (err) {
    console.warn(`carsensor: detail-photo fetch failed: ${err.message}`);
    return {};
  }
}

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

        // Extract card-level hero photos (strict CDN whitelist + alt/url blacklist).
        // This is a fallback — the real gallery is pulled from each detail page below.
        const photos = [];
        card.find(".cassetteMain__img img, .casetteImg img, figure img, picture img, [class*='photo'] img, [class*='mainImg'] img, [class*='thumb'] img, img[src*='ccsrpcml'], img[src*='img.carsensor.net/CSphoto'], img[data-src*='ccsrpcml'], img[data-src*='img.carsensor.net/CSphoto']").each((__, imgEl) => {
          if (photos.length >= 3) return false;
          const attrs = imgEl.attribs || {};
          let raw = attrs["data-src"] || attrs["data-original"] || attrs["data-lazy"] || attrs["data-lazyload"] || attrs.src || "";
          if (!raw) return;
          let abs = raw.startsWith("//") ? `https:${raw}` : raw;
          if (!abs.startsWith("http")) return;
          if (!/\.(jpe?g|png|webp)(\?|$|#)/i.test(abs)) return;
          if (PROMO_URL_RX.test(abs)) return;
          const alt = (attrs.alt || "").toString();
          if (PROMO_ALT_RX.test(alt)) return;
          if (!CARSENSOR_PHOTO_HOSTS.test(abs)) return;
          // Carsensor thumbnails prefix the filename with "S"; strip it for full-res.
          abs = abs.replace(/\/S([A-Z]{1,4}\d+_\d+_\d+\.(?:jpe?g|png|webp))/i, "/$1");
          if (!photos.includes(abs)) photos.push(abs);
        });

        listings.push({
          title: title.substring(0, 120),
          priceJpy,
          mileage,
          year,
          color,
          platform: "carsensor.net",
          url: fullUrl,
          location: "Japan",
          photos,
        });
      } catch (e) {}
    });

    // Enrich each listing with its full detail-page photo gallery.
    const detailUrls = listings
      .map((l) => l.url)
      .filter((u) => u && u !== "https://www.carsensor.net" && /carsensor\.net\//i.test(u) && u !== targetUrl);
    if (detailUrls.length > 0) {
      console.log(`carsensor: fetching detail-page photos for ${detailUrls.length} listings...`);
      const photoMap = await fetchCarsensorDetailPhotos(detailUrls);
      let enriched = 0;
      for (const l of listings) {
        const extra = photoMap[l.url] || [];
        if (extra.length > 0) {
          l.photos = Array.from(new Set([...extra, ...(l.photos || [])]));
          enriched++;
        }
      }
      console.log(`carsensor: enriched ${enriched}/${listings.length} listings with detail-page gallery`);
    }

    console.log(`carsensor: ${listings.length} matching "${model}" listings extracted`);
  } catch (err) {
    console.error("carsensor error:", err.message);
  }

  return listings;
}
