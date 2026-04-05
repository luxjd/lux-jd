/**
 * Test script: calls the real Valuation Engine directly.
 * Run: node scripts/test-valuation.mjs
 */

import { readFileSync } from "fs";

// Load .env.local manually
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.includes("=")) continue;
  const [key, ...vals] = line.split("=");
  process.env[key.trim()] = vals.join("=").trim();
}

console.log("🔑 OpenRouter key:", process.env.OPENROUTER_API_KEY ? "Present (" + process.env.OPENROUTER_API_KEY.substring(0, 15) + "...)" : "MISSING");
console.log("🤖 Vision model:", process.env.OPENROUTER_MODEL_VISION);
console.log("🧠 Reasoning model:", process.env.OPENROUTER_MODEL_REASONING);
console.log("");

// ─── Test 1: FX Rate (free, no key needed) ───
console.log("═══ TEST 1: Live FX Rate ═══");
try {
  const fxRes = await fetch("https://api.frankfurter.app/latest?from=EUR&to=JPY");
  const fxData = await fxRes.json();
  console.log("✅ EUR/JPY:", fxData.rates?.JPY, "(live from frankfurter.app)");
  console.log("   Date:", fxData.date);
} catch (e) {
  console.log("❌ FX fetch failed:", e.message);
}

console.log("");

// ─── Test 2: OpenRouter Text Call (market estimation) ───
console.log("═══ TEST 2: Claude Market Estimation ═══");
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

try {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://luxjd.com",
      "X-Title": "LuxJD Test",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL_REASONING || "anthropic/claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content: "You are a German luxury car market analyst. Return ONLY valid JSON."
        },
        {
          role: "user",
          content: `Estimate the current German market value for:
Make: Jaguar, Model: XK Convertible, Year: 2006, Mileage: 62074 km, LHD, Light Blue, 4.2L V8

Return JSON: {"estimated_sale_price_eur": <int>, "price_range": {"low": <int>, "high": <int>}, "avg_days_on_market": <int>, "market_liquidity": "HIGH/MEDIUM/LOW", "comparable_count": <int>, "reasoning": "1-2 sentences"}`
        }
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log("❌ API error:", res.status, err);
  } else {
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    console.log("✅ Raw response:", text.substring(0, 500));

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("\n📊 Parsed result:");
      console.log("   Sale price:", "€" + parsed.estimated_sale_price_eur?.toLocaleString());
      console.log("   Range:", "€" + parsed.price_range?.low?.toLocaleString(), "—", "€" + parsed.price_range?.high?.toLocaleString());
      console.log("   Days on market:", parsed.avg_days_on_market);
      console.log("   Liquidity:", parsed.market_liquidity);
      console.log("   Comparables:", parsed.comparable_count);
      console.log("   Reasoning:", parsed.reasoning);
    }

    console.log("\n   Model used:", data.model);
    console.log("   Tokens:", data.usage?.total_tokens);
  }
} catch (e) {
  console.log("❌ Request failed:", e.message);
}

console.log("");

// ─── Test 3: Full Valuation Calculation ───
console.log("═══ TEST 3: Full Landed Cost Calculation ═══");

const FX_RATE = 162.5; // approximate
const FX_BUFFER = 0.03;
const askingJpy = 1480000;
const bufferedRate = FX_RATE * (1 - FX_BUFFER);
const purchaseEur = Math.round(askingJpy / bufferedRate);
const auctionFees = Math.round(purchaseEur * 0.04);
const freight = 2800;
const insurance = Math.round(purchaseEur * 0.02);
const cifValue = purchaseEur + auctionFees + 400 + 175 + freight + insurance;
const customsDuty = Math.round(cifValue * 0.10);
const importVat = Math.round((cifValue + customsDuty) * 0.19);
const totalLanded = purchaseEur + auctionFees + 400 + 175 + freight + insurance + customsDuty + 600 + 800 + 150 + 450 + 1200 + 500;

console.log("   Purchase: ¥" + askingJpy.toLocaleString() + " → €" + purchaseEur.toLocaleString() + " (at ¥" + bufferedRate.toFixed(2) + ")");
console.log("   Auction fees: €" + auctionFees.toLocaleString());
console.log("   CIF value: €" + cifValue.toLocaleString());
console.log("   Customs (10%): €" + customsDuty.toLocaleString());
console.log("   VAT (19%, reclaimable): €" + importVat.toLocaleString());
console.log("   Total landed: €" + totalLanded.toLocaleString());
console.log("");
console.log("   If DE market value is €18,000:");
console.log("   Margin: €" + (18000 - totalLanded).toLocaleString() + " (" + ((18000 - totalLanded) / 18000 * 100).toFixed(1) + "%)");

console.log("\n═══ ALL TESTS COMPLETE ═══");
