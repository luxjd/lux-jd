/**
 * Listing Description Generator — Claude-powered, multi-platform, multi-language.
 *
 * For each vehicle, generates 5 platform-specific descriptions:
 * 1. mobile.de — German, structured, SEO, legally compliant
 * 2. AutoScout24 — German + English, cross-border optimized
 * 3. ClassicDriver — English, narrative, provenance-focused
 * 4. elferspot — German + English, Porsche-specialist (if applicable)
 * 5. Instagram — Aspirational, hashtags, short
 */

import { callClaude, isAIAvailable } from "@/lib/claude";
import { formatNumber } from "@/lib/format";

const SYSTEM_PROMPT = `You are a premium automotive copywriter for LuxJD, a luxury vehicle dealership specializing in Japanese-sourced imports to Germany. You write in the voice of a high-end dealer — professional, knowledgeable, trustworthy, never salesy.

CRITICAL RULES:
- NEVER reveal purchase price, sourcing details, or margin information
- ALWAYS include legally required disclosures for German vehicle sales
- Emphasize: Japanese maintenance culture (exceptional condition), low mileage, specification rarity
- Use proper automotive terminology for the brand (e.g., Porsche option codes, Ferrari factory codes)
- German text must be grammatically perfect, professional dealer-level Deutsch
- English text must be sophisticated, collector-oriented`;

const GENERATE_PROMPT = (vehicle) => `Generate listing content for this vehicle across ALL platforms.

VEHICLE DATA:
Make: ${vehicle.make}
Model: ${vehicle.model}
Year: ${vehicle.year}
Mileage: ${formatNumber(vehicle.mileageKm)} km
Drive Side: ${vehicle.driveSide}
Exterior: ${vehicle.exteriorColor}
Interior: ${vehicle.interiorColor || "Leather"}
Engine: ${vehicle.engineSpec || "Standard"}
Transmission: ${vehicle.transmission || "Automatic"}
Service History: ${vehicle.serviceHistory || "Available"}
Auction Grade: ${vehicle.auctionGrade || "N/A"}
Accident History: ${vehicle.accidentHistory ? "Minor (disclosed)" : "Clean — no accidents"}
Specification Notes: ${vehicle.specNotes || "Factory specification"}
Condition: ${vehicle.conditionNotes || "Excellent overall condition"}

LISTING PRICE: €${vehicle.listingPrice != null ? formatNumber(vehicle.listingPrice) : "TBD"}

FACTORY OPTIONS WITH MARKET VALUE (join of DE Market premiums + this vehicle's equipment):
${
  Array.isArray(vehicle.matchedOptions) && vehicle.matchedOptions.length > 0
    ? vehicle.matchedOptions.slice(0, 20).map((o) =>
        `- ${o.canonicalName || o.option}${o.premiumEur ? ` — market premium €${formatNumber(o.premiumEur)}${o.reason ? ` (${o.reason})` : ""}` : ""}`
      ).join("\n")
    : "- (none recorded)"
}
${vehicle.totalOptionPremiumEur ? `Total option premium value: €${formatNumber(vehicle.totalOptionPremiumEur)}` : ""}

Return ONLY valid JSON:

{
  "mobile_de": {
    "title_de": "<70 char max German title>",
    "description_de": "<800-1200 word German description, structured with sections, SEO keywords, legal disclosures: Importfahrzeug, km-Stand, Unfallfreiheit, §38 GewO, MwSt ausweisbar, Widerrufsrecht bei Fernabsatz>",
    "highlights_de": ["highlight 1", "highlight 2", "highlight 3", "highlight 4", "highlight 5"],
    "seo_keywords_de": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  },
  "autoscout24": {
    "title_de": "<German title>",
    "title_en": "<English title>",
    "description_de": "<600-800 word German description>",
    "description_en": "<600-800 word English description for cross-border buyers>",
    "highlights": ["bilingual highlight 1", "highlight 2", "highlight 3"]
  },
  "classicdriver": {
    "title_en": "<Elegant English title>",
    "description_en": "<800-1200 word English narrative — provenance story, specification analysis, collector context, driving experience. Written like a premium magazine article.>",
    "highlights_en": ["collector-focused highlight 1", "highlight 2", "highlight 3"]
  },
  "elferspot": {
    "title_de": "<German title — Porsche-specific if applicable>",
    "description_de": "<500-800 word German description with option codes if Porsche, or general luxury focus>",
    "description_en": "<500-800 word English version>",
    "option_codes": ["option code or notable spec 1", "option code 2"]
  },
  "instagram": {
    "caption": "<150-250 char aspirational caption>",
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
    "story_text": "<50 char story overlay text>",
    "cta": "<call to action text>"
  },
  "specification_sheet": {
    "brand": "${vehicle.make}",
    "model": "${vehicle.model}",
    "year": ${vehicle.year},
    "mileage_km": ${vehicle.mileageKm || 0},
    "engine": "<full engine spec>",
    "power": "<PS / kW>",
    "transmission": "<type>",
    "drive_type": "<RWD/AWD/FWD>",
    "fuel": "<Petrol/Diesel/Hybrid>",
    "co2": "<g/km estimate>",
    "top_speed": "<km/h>",
    "acceleration_0_100": "<seconds>",
    "weight_kg": "<integer>",
    "notable_options": ["option 1 with value", "option 2"],
    "vin_prefix": "<first 11 chars of typical VIN for this model>"
  }
}`;

/**
 * Generate all listing descriptions for a vehicle.
 * @param {object} vehicle — vehicle data with make, model, year, etc.
 * @returns {object|null} Multi-platform listing content
 */
export async function generateListingContent(vehicle) {
  if (!isAIAvailable()) return null;

  const result = await callClaude({
    prompt: GENERATE_PROMPT(vehicle),
    system: SYSTEM_PROMPT,
    maxTokens: 8192,
    jsonMode: true,
  });

  if (!result) return null;

  return {
    ...result,
    vehicleId: vehicle.id,
    generatedAt: new Date().toISOString(),
    generatedBy: "listing-agent-ai",
  };
}
