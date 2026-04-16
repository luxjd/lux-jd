/**
 * Auction Sheet Analyzer for JP Sourcing Agent.
 *
 * Fetches auction sheet images from listing URLs and runs them through
 * the Valuation Agent's sheet-parser (Claude Vision multi-pass OCR).
 *
 * Only processes BUY/STRONG_BUY candidates to save API costs.
 * Enriches vehicles with: condition grades, damage notes, service history,
 * accident indicators, and per-field confidence scores.
 */

import { parseAuctionSheet } from "@/lib/agents/valuation/sheet-parser";
import { isAIAvailable } from "@/lib/claude";

/**
 * Try to fetch an auction sheet image from a listing URL.
 * Returns { data: base64, mediaType } or null.
 */
async function fetchAuctionSheetImage(listingUrl) {
  if (!listingUrl) return null;

  try {
    // japan-auktion.de: auction sheet images are typically accessible via lot detail pages
    // goo-net / carsensor: may have inspection sheet images in listing detail
    const res = await fetch(listingUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,image/*",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";

    // If the URL directly returns an image
    if (contentType.startsWith("image/")) {
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mediaType = contentType.split(";")[0].trim();
      return { data: base64, mediaType };
    }

    // If it returns HTML, look for auction sheet image links
    const html = await res.text();

    // Common patterns for auction sheet images on Japanese sites
    const imgPatterns = [
      /https?:\/\/[^"'\s]+(?:auction.?sheet|inspection|hyouka|satei|出品票|検査表)[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/[^"'\s]+(?:\/sheet\/|\/inspect\/|\/grade\/)[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
      /https?:\/\/[^"'\s]+(?:img|image|photo)[^"'\s]*(?:sheet|grade|inspect)[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi,
    ];

    for (const pattern of imgPatterns) {
      const match = html.match(pattern);
      if (match) {
        const imgUrl = match[0];
        try {
          const imgRes = await fetch(imgUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(8000),
          });
          if (imgRes.ok) {
            const imgType = imgRes.headers.get("content-type") || "image/jpeg";
            if (imgType.startsWith("image/")) {
              const buffer = await imgRes.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");
              return { data: base64, mediaType: imgType.split(";")[0].trim() };
            }
          }
        } catch {}
      }
    }

    return null;
  } catch (err) {
    console.warn(`Sheet image fetch failed for ${listingUrl}:`, err.message);
    return null;
  }
}

/**
 * Summarize sheet-parser output into fields for the opportunity record.
 */
function summarizeSheetData(parsed) {
  if (!parsed) return null;

  // Determine service history status from parsed data
  let serviceHistory = "UNKNOWN";
  if (parsed.service_history === true || parsed.service_record === "FULL" || parsed.service_book_present) {
    serviceHistory = "FULL_DEALER";
  } else if (parsed.service_history === false || parsed.service_record === "NONE") {
    serviceHistory = "NONE";
  } else if (parsed.service_record === "PARTIAL") {
    serviceHistory = "PARTIAL_DEALER";
  }

  // Build condition notes from damage codes
  const damageNotes = (parsed.damage_codes || [])
    .filter((d) => d.severity === "MAJOR" || d.severity === "MODERATE")
    .map((d) => `${d.code} (${d.meaning || d.en}): ${d.location || "unknown panel"}`)
    .join("; ");

  // Auction sheet summary
  const sheetNotes = [
    parsed.overall_grade ? `Overall grade: ${parsed.overall_grade}` : null,
    parsed.interior_grade ? `Interior: ${parsed.interior_grade}` : null,
    parsed._damage_severity_score != null ? `Damage severity: ${parsed._damage_severity_score}/10` : null,
    parsed._tuv_relevant_damage?.length ? `TUV-relevant issues: ${parsed._tuv_relevant_damage.length}` : null,
    parsed.mechanical_notes?.length ? `Mechanical: ${parsed.mechanical_notes.join(", ")}` : null,
    parsed.modification_notes?.length ? `Modifications: ${parsed.modification_notes.join(", ")}` : null,
  ].filter(Boolean).join(" | ");

  return {
    service_history: serviceHistory,
    accident_history: parsed.accident_indicator === true || parsed.accident_history === true,
    auction_grade: parsed.overall_grade || null,
    condition_notes: damageNotes || null,
    auction_sheet_notes: sheetNotes || null,
    sheet_confidence: parsed._field_confidence || null,
    tuv_relevant_count: parsed._tuv_relevant_damage?.length || 0,
    damage_severity: parsed._damage_severity_score || 0,
    extraction_mode: parsed._extraction_mode || null,
    passes_completed: parsed._passes_completed || 0,
  };
}

/**
 * Analyze auction sheets for qualifying opportunities.
 * Only processes BUY and STRONG_BUY candidates.
 *
 * @param {Array} opportunities — evaluated opportunities from the evaluator
 * @param {object} options
 * @param {function} options.onProgress — progress callback(analyzed, total)
 * @param {function} options.checkState — returns scan state for pause/stop
 * @returns {object} { analyzed: number, enriched: number, failed: number }
 */
export async function analyzeAuctionSheets(opportunities, { onProgress, checkState } = {}) {
  if (!isAIAvailable()) {
    console.log("Sheet analyzer: AI not available, skipping");
    return { analyzed: 0, enriched: 0, failed: 0 };
  }

  const qualifying = opportunities.filter(
    (o) => o.recommendation === "STRONG_BUY" || o.recommendation === "BUY"
  );

  if (qualifying.length === 0) return { analyzed: 0, enriched: 0, failed: 0 };

  console.log(`Sheet analyzer: processing ${qualifying.length} qualifying candidates`);

  let analyzed = 0;
  let enriched = 0;
  let failed = 0;

  for (const opp of qualifying) {
    // Check for stop/pause
    if (checkState) {
      const state = await checkState();
      if (state === "stopped") break;
      while (state === "paused") {
        await new Promise((r) => setTimeout(r, 500));
        if (await checkState() === "stopped") break;
      }
    }

    const listingUrl = opp.vehicle?.listingUrl || opp.listing_url;
    if (!listingUrl) {
      analyzed++;
      continue;
    }

    try {
      onProgress?.(analyzed, qualifying.length);

      // Fetch the auction sheet image
      const image = await fetchAuctionSheetImage(listingUrl);
      if (!image) {
        analyzed++;
        continue;
      }

      // Run through the sheet parser (quickMode for speed — single pass, no verification)
      const parsed = await parseAuctionSheet(image, { quickMode: true });
      if (!parsed) {
        analyzed++;
        failed++;
        continue;
      }

      // Enrich the opportunity with sheet data
      const sheetData = summarizeSheetData(parsed);
      if (sheetData) {
        // Update the vehicle data
        if (sheetData.service_history !== "UNKNOWN") {
          opp.vehicle.serviceHistory = sheetData.service_history;
        }
        if (sheetData.accident_history) {
          opp.vehicle.accidentHistory = true;
        }
        if (sheetData.auction_grade && !opp.vehicle.auctionGrade) {
          opp.vehicle.auctionGrade = sheetData.auction_grade;
        }
        if (sheetData.condition_notes) {
          opp.vehicle.conditionNotes = sheetData.condition_notes;
        }
        opp.vehicle.auctionSheetNotes = sheetData.auction_sheet_notes;

        // Attach full sheet analysis
        opp.sheetAnalysis = {
          tuvRelevantCount: sheetData.tuv_relevant_count,
          damageSeverity: sheetData.damage_severity,
          extractionMode: sheetData.extraction_mode,
          passesCompleted: sheetData.passes_completed,
          confidence: sheetData.sheet_confidence,
        };

        enriched++;
      }

      analyzed++;

      // Rate limit between Vision API calls
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Sheet analysis failed for ${opp.id}:`, err.message);
      analyzed++;
      failed++;
    }
  }

  console.log(`Sheet analyzer: ${analyzed} analyzed, ${enriched} enriched, ${failed} failed`);
  return { analyzed, enriched, failed };
}
