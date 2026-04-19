/**
 * auc.japan-auktion.de scraper — German-language Japanese auction aggregator.
 *
 * Covers multiple auction houses in one source: ARAI Bayside, USS, TAA (Kinki,
 * Yokohama, Minami Kyushu), JU Gifu, MIRIVE Aichi, ZIP Tokyo, CAA Gifu, AUCNET.
 *
 * Key advantage over goo-net/carsensor: provides auction grades, actual hammer
 * (sold) prices, and lot numbers — critical for JP Sourcing risk assessment.
 *
 * The site is JS-heavy (AJAX data loading), so we use Apify web-scraper (Puppeteer).
 */

import { runActorAndGetItems } from "@/lib/agents/valuation/scrapers/apify-client";

const BASE_URL = "https://auc.japan-auktion.de";

/**
 * Map our make names to how they appear in the japan-auktion.de left sidebar.
 */
const MAKE_MAP = {
  "Ferrari": "FERRARI",
  "Mercedes-AMG": "MERCEDES BENZ",
  "Porsche": "PORSCHE",
  "Lamborghini": "LAMBORGHINI",
  "Bentley": "BENTLEY",
  "Aston Martin": "ASTON MARTIN",
  "Maserati": "MASERATI",
  "BMW": "BMW",
  "Jaguar": "JAGUAR",
  "Land Rover": "LAND ROVER",
};

/**
 * Map our model names to the sub-model filter text on japan-auktion.de.
 * The site's model list shows entries like "AMG (31)", "911 (45)", etc.
 * We match the start of the model text (case-insensitive).
 */
const MODEL_KEYWORDS = {
  // Mercedes-AMG models — site lists under "MERCEDES BENZ" → "AMG" sub-filter
  "GT R": ["AMG GT"],
  "G63": ["AMG G CLASS", "G63"],
  "C63": ["AMG C CLASS", "AMG C63", "AMG C "],
  "E63": ["AMG E CLASS", "AMG E63", "AMG E "],
  // Ferrari
  "488 GTB": ["488"],
  "F12 Berlinetta": ["F12"],
  "Roma": ["ROMA"],
  // Porsche
  "911 GT3 (992)": ["911", "GT3"],
  "718 Cayman GT4": ["718", "CAYMAN", "GT4"],
  "Cayenne Turbo GT": ["CAYENNE"],
  // Lamborghini
  "Huracan STO": ["HURACAN", "HURACÁN"],
  // Bentley
  "Continental GT": ["CONTINENTAL"],
  // Aston Martin
  "DB11 V12": ["DB11"],
  "Vantage": ["VANTAGE"],
  // BMW M
  "M3 Competition": ["M3"],
  "M4 Competition": ["M4"],
  // Jaguar
  "F-Type R": ["F-TYPE", "F TYPE"],
  // Range Rover
  "Range Rover Sport SVR": ["RANGE ROVER", "SPORT"],
  // Maserati
  "MC20": ["MC20"],
};

/**
 * Scrape auc.japan-auktion.de for Japanese auction results.
 *
 * @param {object} params
 * @param {string} params.make - e.g. "Ferrari", "Mercedes-AMG"
 * @param {string} params.model - e.g. "488 GTB", "GT R"
 * @param {number} [params.yearFrom]
 * @param {number} [params.yearTo]
 * @param {number} [params.maxMileage] - in km
 * @returns {Array} listings with auction-specific fields
 */
export async function scrapeJapanAuktion({ make, model, yearFrom, yearTo, maxMileage }) {
  const listings = [];

  if (!process.env.APIFY_API_KEY) {
    console.warn("japan-auktion: no APIFY_API_KEY, skipping");
    return listings;
  }

  const siteMake = MAKE_MAP[make];
  if (!siteMake) {
    console.log(`japan-auktion: no mapping for make "${make}", skipping`);
    return listings;
  }

  try {
    // Build the page function that Puppeteer will execute on the site.
    // The site loads data via AJAX into a table with class patterns aj_dark/aj_light.
    // We interact with the search form, then extract the rendered results.
    const modelKeywords = MODEL_KEYWORDS[model] || [model.split(" ")[0].toUpperCase()];
    const modelKeywordsJson = JSON.stringify(modelKeywords);
    const makeLower = siteMake.toLowerCase();

    const pageFunction = `
async function pageFunction(context) {
  const { page, log } = context;
  const results = [];

  try {
    // Wait for the page to fully load
    await page.waitForSelector('#poisk, .aj_dark, .aj_light, table', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Step 1: Click the make in the left sidebar
    const makeClicked = await page.evaluate((targetMake) => {
      const links = document.querySelectorAll('a, td, div, span');
      for (const el of links) {
        const text = el.textContent.trim().toUpperCase();
        if (text === targetMake || text.startsWith(targetMake + ' ') || text.startsWith(targetMake + '\\n')) {
          el.click();
          return true;
        }
      }
      return false;
    }, '${siteMake}');

    if (!makeClicked) {
      log.warning('Could not find make: ${siteMake}');
    }

    await new Promise(r => setTimeout(r, 2000));

    // Step 2: Set year range if provided
    ${yearFrom ? `
    await page.evaluate(() => {
      const el = document.getElementById('yearN');
      if (el) { el.value = '${yearFrom}'; el.dispatchEvent(new Event('change')); }
    });` : ""}

    // Step 3: Set mileage max if provided (site uses field "probegN" in 1000s of km)
    ${maxMileage ? `
    await page.evaluate(() => {
      const el = document.getElementById('probegN');
      if (el) { el.value = '${Math.round(maxMileage / 1000)}'; el.dispatchEvent(new Event('change')); }
    });` : ""}

    // Step 4: Click SEARCH
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, input[type="submit"], a, div');
      for (const b of btns) {
        if (b.textContent.trim().toUpperCase() === 'SEARCH' || b.value === 'SEARCH') {
          b.click();
          return;
        }
      }
    });

    await new Promise(r => setTimeout(r, 5000));

    // Step 5: Extract results from the table
    const data = await page.evaluate((modelKws) => {
      const rows = document.querySelectorAll('tr.aj_dark, tr.aj_light, tr[id^="aj_view"]');
      const items = [];

      for (const row of rows) {
        try {
          const cells = row.querySelectorAll('td');
          if (cells.length < 6) continue;

          const fullText = row.textContent.replace(/\\s+/g, ' ').trim();
          const textUpper = fullText.toUpperCase();

          // Filter by model keywords
          const matchesModel = modelKws.some(kw => textUpper.includes(kw.toUpperCase()));
          if (!matchesModel) continue;

          // Extract year — 4-digit number between 2000-2026
          const yearMatch = fullText.match(/\\b(20[012]\\d)\\b/);
          const year = yearMatch ? parseInt(yearMatch[1]) : 0;

          // Extract mileage — number followed by "km"
          const kmMatch = fullText.match(/([\\d,.]+)\\s*km/i);
          const mileage = kmMatch ? parseInt(kmMatch[1].replace(/[,.]/g, '')) : 0;

          // Extract prices in yen — patterns like "1 710 000¥" or "780 000 ¥"
          const priceMatches = fullText.match(/([\\d\\s,]+)\\s*[¥\\u00A5]/g) || [];
          const prices = priceMatches.map(p => parseInt(p.replace(/[^\\d]/g, ''))).filter(p => p >= 100000);

          // First price is usually start price, second is sold price
          const startPrice = prices[0] || 0;
          const soldPrice = prices[1] || 0;
          const bestPrice = soldPrice || startPrice;
          if (!bestPrice) continue;

          // Extract auction grade — number like 4.5, 4, 3.5, 5
          const gradeMatch = fullText.match(/\\b([345](?:\\.5)?)\\b/);
          let grade = gradeMatch ? parseFloat(gradeMatch[1]) : null;
          // Disambiguate: grades are typically in a green-colored element
          const gradeEl = row.querySelector('[style*="73aa00"], [style*="color:#73aa00"], .grade_hide + div b');
          if (gradeEl) {
            const gVal = parseFloat(gradeEl.textContent.trim());
            if (gVal >= 1 && gVal <= 5.5) grade = gVal;
          }

          // Extract color
          const colorEl = row.querySelector('[style*="color:"]');
          const colorCandidates = ['WHITE', 'BLACK', 'SILVER', 'RED', 'BLUE', 'GREY', 'GRAY', 'PEARL', 'YELLOW', 'GREEN', 'GOLD', 'BROWN', 'ORANGE', 'WINE'];
          let color = null;
          for (const c of colorCandidates) {
            if (textUpper.includes(c)) { color = c.charAt(0) + c.slice(1).toLowerCase(); break; }
          }

          // Extract auction house — known names
          const auctionHouses = ['ARAI Bayside', 'AUCNET', 'CAA Gifu', 'JU Gifu', 'MIRIVE Aichi', 'TAA Kinki', 'TAA Minami Kyushu', 'TAA Yokohama', 'ZIP Tokyo', 'USS', 'HAA', 'BH Auction'];
          let auctionHouse = null;
          for (const ah of auctionHouses) {
            if (fullText.includes(ah)) { auctionHouse = ah; break; }
          }

          // Extract lot number
          const lotEl = row.querySelector('.ffix_bid a, .ffix_bid b');
          const lotNumber = lotEl ? lotEl.textContent.trim() : null;

          // Extract model/variant text
          const modelCell = cells[3] || cells[2];
          const modelText = modelCell ? modelCell.textContent.replace(/\\s+/g, ' ').trim().substring(0, 120) : '';

          // Extract engine CC
          const ccMatch = fullText.match(/(\\d{3,4})\\s*cc/i);
          const engineCc = ccMatch ? parseInt(ccMatch[1]) : null;

          // Extract transmission
          const transmission = textUpper.includes(' AT') || textUpper.includes('AT ') || textUpper.includes('\\tAT') ? 'AT' : textUpper.includes(' MT') || textUpper.includes('MT ') ? 'MT' : null;

          // Sold status
          const isSold = textUpper.includes('VERKAUFT') || textUpper.includes('SOLD');
          const isCancelled = textUpper.includes('CANCEL');
          const isNotSold = textUpper.includes('NOT SOLD');
          const status = isCancelled ? 'cancelled' : isNotSold ? 'not_sold' : isSold ? 'sold' : 'listed';

          // Build title
          const yearStr = year ? String(year) : '';
          const title = (yearStr + ' ' + modelText).trim().substring(0, 120) || 'Japanese Auction Vehicle';

          // Link to details
          const linkEl = row.querySelector('a[href]');
          const url = linkEl ? linkEl.href : '';

          // Extract vehicle photo URLs from this row.
          // Aggregator exposes auction-lot thumbnails; block promos, badges, and UI chrome.
          const photos = [];
          const BAD = /(cpn|bnr|banner|campaign|promo|event|present|gift|amazon|oshirase|coupon|popup|modal|\\/pr\\/|topimg|kyanpe|logo|icon|sprite|flag|star|ruler|arrow|badge|spacer|blank|grade|dummy|noimage|[_\\-\\/]ad[_\\-\\/])/i;
          const BAD_ALT = /(キャンペーン|プレゼント|当たる|ギフト|クーポン|amazon|広告|お知らせ)/i;
          const imgEls = row.querySelectorAll('img');
          for (const img of imgEls) {
            if (photos.length >= 20) break;
            const src = img.getAttribute('src') || img.getAttribute('data-src') || img.dataset?.original || '';
            if (!src) continue;
            const abs = src.startsWith('http') ? src : new URL(src, window.location.origin).toString();
            const lower = abs.toLowerCase();
            const alt = (img.getAttribute('alt') || '').toString();
            if (BAD.test(lower)) continue;
            if (BAD_ALT.test(alt)) continue;
            if (!/\\.(jpe?g|png|webp)($|\\?|#)/.test(lower)) continue;
            const w = img.naturalWidth || img.width || 0;
            const h = img.naturalHeight || img.height || 0;
            if ((w && w < 80) || (h && h < 60)) continue;
            // Aspect-ratio gate: vehicle photos are 4:3 or 16:9-ish; reject extreme banner ratios.
            if (w && h) {
              const ar = w / h;
              if (ar < 0.6 || ar > 2.5) continue;
            }
            if (!photos.includes(abs)) photos.push(abs);
          }

          items.push({
            title,
            priceJpy: bestPrice,
            startPriceJpy: startPrice,
            soldPriceJpy: soldPrice > 0 ? soldPrice : null,
            mileage,
            year,
            color,
            auctionGrade: grade,
            auctionHouse,
            lotNumber,
            engineCc,
            transmission,
            status,
            url,
            photos,
          });
        } catch (e) {}
      }
      return items;
    }, ${modelKeywordsJson});

    for (const item of data) {
      results.push(item);
    }
  } catch (err) {
    log.error('Scrape error: ' + err.message);
  }

  await context.pushData({ results });
}`;

    console.log(`japan-auktion: fetching via Apify web-scraper for ${make} ${model}...`);

    const items = await runActorAndGetItems("apify~web-scraper", {
      startUrls: [{ url: `${BASE_URL}/set` }],
      pageFunction,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      maxRequestsPerCrawl: 1,
    });

    const results = items?.[0]?.results || [];

    for (const item of results) {
      // Validate price range for luxury vehicles
      if (!item.priceJpy || item.priceJpy < 500000) continue;

      // Filter by year range
      if (yearFrom && item.year && item.year < yearFrom) continue;
      if (yearTo && item.year && item.year > yearTo) continue;

      // Filter by mileage
      if (maxMileage && item.mileage && item.mileage > maxMileage) continue;

      listings.push({
        title: item.title,
        priceJpy: item.priceJpy,
        startPriceJpy: item.startPriceJpy || null,
        soldPriceJpy: item.soldPriceJpy || null,
        mileage: item.mileage || 0,
        year: item.year || 0,
        color: item.color || null,
        auctionGrade: item.auctionGrade || null,
        auctionHouse: item.auctionHouse || null,
        lotNumber: item.lotNumber || null,
        engineCc: item.engineCc || null,
        transmission: item.transmission || null,
        status: item.status || "listed",
        platform: "japan-auktion.de",
        url: item.url || `${BASE_URL}/set`,
        location: "Japan",
        photos: Array.isArray(item.photos) ? item.photos.slice(0, 20) : [],
      });
    }

    console.log(`japan-auktion: ${listings.length} matching "${model}" listings extracted (${listings.filter(l => l.soldPriceJpy).length} with sold prices)`);
  } catch (err) {
    console.error("japan-auktion error:", err.message);
  }

  return listings;
}
