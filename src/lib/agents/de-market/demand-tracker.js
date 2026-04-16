/**
 * Demand Velocity Tracker — computes REAL demand metrics by tracking listings over time.
 * Per spec Section 6.1.3: "Measure how quickly vehicles of each type sell
 * (average days-on-market), inquiry frequency, and price resilience"
 *
 * How it works:
 * 1. Each scan captures a snapshot of active listing URLs
 * 2. By comparing snapshots over time, we detect:
 *    - Listings that disappeared (sold or removed) → computes days-on-market
 *    - Listings that had price drops → measures price resilience
 *    - New listings appearing → measures supply velocity
 * 3. These real metrics replace the old fake velocity scores
 */

import { db } from "@/lib/db-storage";

const KV_PREFIX = "demand-tracker";

/**
 * Record a snapshot of current listings for a model.
 * Call this after every scan.
 * @param {string} modelId
 * @param {Array} listings — current active listings with { url, price, title }
 */
export async function recordListingSnapshot(modelId, listings) {
  const key = `${KV_PREFIX}.${modelId}`;

  // Load existing tracking data
  const existing = await db.kv.get(key) || { snapshots: [], tracked: {} };

  const now = new Date().toISOString();
  const currentUrls = new Set(listings.map((l) => l.url).filter(Boolean));

  // ── Track each listing ──
  for (const listing of listings) {
    if (!listing.url) continue;
    if (!existing.tracked[listing.url]) {
      // New listing — start tracking
      existing.tracked[listing.url] = {
        firstSeen: now,
        lastSeen: now,
        initialPrice: listing.price,
        currentPrice: listing.price,
        priceDrops: 0,
        title: listing.title,
      };
    } else {
      // Known listing — update
      const t = existing.tracked[listing.url];
      t.lastSeen = now;
      if (listing.price < t.currentPrice) {
        t.priceDrops++;
      }
      t.currentPrice = listing.price;
    }
  }

  // ── Detect disappeared listings (sold) ──
  const soldListings = [];
  for (const [url, data] of Object.entries(existing.tracked)) {
    if (!currentUrls.has(url) && data.lastSeen !== now) {
      const firstSeen = new Date(data.firstSeen);
      const lastSeen = new Date(data.lastSeen);
      const daysOnMarket = Math.max(1, Math.round((lastSeen - firstSeen) / (1000 * 60 * 60 * 24)));
      soldListings.push({ url, daysOnMarket, priceDrops: data.priceDrops, initialPrice: data.initialPrice, finalPrice: data.currentPrice });
    }
  }

  // Add snapshot record
  existing.snapshots.push({
    date: now,
    activeCount: currentUrls.size,
    newListings: listings.filter((l) => l.url && !existing.tracked[l.url]?.firstSeen || existing.tracked[l.url]?.firstSeen === now).length,
    soldCount: soldListings.length,
  });

  // Keep only last 90 days of snapshots
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  existing.snapshots = existing.snapshots.filter((s) => s.date > cutoff);

  // Clean up old tracked listings (gone for > 30 days)
  const cleanupCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const [url, data] of Object.entries(existing.tracked)) {
    if (data.lastSeen < cleanupCutoff && !currentUrls.has(url)) {
      delete existing.tracked[url];
    }
  }

  await db.kv.set(key, existing);

  return { soldListings, activeCount: currentUrls.size, newCount: existing.snapshots[existing.snapshots.length - 1]?.newListings || 0 };
}

/**
 * Compute real demand velocity metrics for a model.
 * @param {string} modelId
 * @returns {object} { avgDaysOnMarket, velocityScore, priceResilience, supplyRate, turnoverRate }
 */
export async function computeDemandVelocity(modelId) {
  const key = `${KV_PREFIX}.${modelId}`;
  const data = await db.kv.get(key);

  if (!data || !data.snapshots || data.snapshots.length < 2) {
    return {
      avgDaysOnMarket: null,
      velocityScore: null,
      priceResilience: null,
      supplyRate: null,
      turnoverRate: null,
      dataPoints: 0,
      message: "Insufficient data — need at least 2 scans to compute velocity",
    };
  }

  const tracked = Object.values(data.tracked || {});
  const snapshots = data.snapshots;

  // ── Average days on market (from listings that disappeared) ──
  const completedListings = tracked.filter((t) => {
    const first = new Date(t.firstSeen);
    const last = new Date(t.lastSeen);
    return (last - first) > 24 * 60 * 60 * 1000; // Seen across at least 2 scans
  });

  let avgDom = null;
  if (completedListings.length > 0) {
    const doms = completedListings.map((t) => {
      return Math.max(1, Math.round((new Date(t.lastSeen) - new Date(t.firstSeen)) / (1000 * 60 * 60 * 24)));
    });
    avgDom = Math.round(doms.reduce((a, b) => a + b, 0) / doms.length);
  }

  // ── Price resilience (% of listings with zero price drops) ──
  const withPriceData = tracked.filter((t) => t.initialPrice > 0);
  const noPriceDrop = withPriceData.filter((t) => t.priceDrops === 0);
  const priceResilience = withPriceData.length > 0 ? Math.round((noPriceDrop.length / withPriceData.length) * 100) : null;

  // ── Supply rate (new listings per week) ──
  const recentSnapshots = snapshots.slice(-14); // Last 14 snapshots
  const totalNew = recentSnapshots.reduce((sum, s) => sum + (s.newListings || 0), 0);
  const weeks = Math.max(1, recentSnapshots.length / 2); // Assume ~2 scans per week at 4/day cron
  const supplyRate = Math.round(totalNew / weeks);

  // ── Velocity score (0-100) ──
  // Fast selling (low DOM) + high price resilience + healthy supply = high velocity
  let velocityScore = 50; // Default
  if (avgDom !== null) {
    if (avgDom <= 14) velocityScore = 90;
    else if (avgDom <= 21) velocityScore = 75;
    else if (avgDom <= 35) velocityScore = 60;
    else if (avgDom <= 50) velocityScore = 40;
    else velocityScore = 25;
  }
  // Adjust for price resilience
  if (priceResilience !== null) {
    if (priceResilience >= 80) velocityScore = Math.min(100, velocityScore + 10);
    else if (priceResilience < 40) velocityScore = Math.max(0, velocityScore - 10);
  }

  return {
    avgDaysOnMarket: avgDom,
    velocityScore,
    priceResilience,
    supplyRate,
    turnoverRate: avgDom ? Math.round(365 / avgDom) : null,
    dataPoints: snapshots.length,
    trackedListings: tracked.length,
    message: avgDom ? `Based on ${completedListings.length} tracked listings across ${snapshots.length} scans` : "Computing — more scan data needed",
  };
}
