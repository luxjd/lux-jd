import { callClaude } from "@/lib/claude";
import { formatNumber } from "@/lib/format";
import { validateRiskOutput } from "./validation";
import { scoreRisksDeterministic } from "./risk-scorer";

/**
 * Spec §6.5 split:
 *   - The 6 risk scores + weighted overall come from `scoreRisksDeterministic`
 *     (pure rules, no LLM). See `risk-scorer.js`.
 *   - The LLM produces only:
 *       * qualitative nuance for condition_risk + provenance_risk
 *         (the two judgment-heavy dimensions per spec §6.5)
 *       * the verdict bundle: verdict, max_bid, strengths, concerns, action_items
 *
 * The LLM receives the deterministic scores as INPUTS — it cannot change them.
 */

const SYSTEM_PROMPT = `You are a senior automotive investment analyst specializing in Japanese-to-European luxury vehicle arbitrage. You evaluate acquisition opportunities with rigorous financial discipline. Your recommendations directly influence purchasing decisions on vehicles worth €50,000-€400,000. Be conservative — a missed deal costs nothing, a bad purchase costs everything.

The 6 numerical risk scores have ALREADY been computed deterministically from rules (per spec §6.5). You DO NOT score risks. Your job is two-fold:
1. Provide qualitative nuance for condition_risk and provenance_risk reasoning — the two dimensions where human judgment adds value beyond the rule.
2. Produce the final verdict, max-bid, key strengths/concerns, and action items.`;

const USER_PROMPT = (data, det) => `Evaluate this vehicle acquisition opportunity.

VEHICLE:
${data.make} ${data.model} ${data.year}
${formatNumber(data.mileageKm)} km | ${data.driveSide} | ${data.exteriorColor}
Service History: ${data.serviceHistory || "Unknown"}
Service Book Present: ${data.serviceBookPresent != null ? (data.serviceBookPresent ? "Yes" : "No") : "Unknown"}
Auction Grade: ${data.auctionGrade || "N/A"}${data.interiorGrade ? ` (Interior: ${data.interiorGrade})` : ""}
Accident History: ${data.accidentHistory ? "YES — documented" : "No"}
${data.accidentContradiction ? `⚠ ACCIDENT FLAG CONTRADICTION: ${data.accidentContradiction}` : ""}

CONDITION ASSESSMENT (from AI photo/sheet analysis):
Exterior Score: ${data.conditionExterior}/10
Interior Score: ${data.conditionInterior}/10
Interior Originality: ${data.interiorOriginality || "Unknown"}
Condition Notes: ${data.conditionNotes || "None"}
${data.tuvRiskFlags?.length ? `TUV Risk Flags: ${data.tuvRiskFlags.join("; ")}` : "No TUV risk flags detected"}
${data.visibleDamage?.length ? `Visible Damage: ${data.visibleDamage.join("; ")}` : ""}
${data.modifications?.length ? `Modifications: ${data.modifications.join("; ")}` : "No modifications"}

PANEL CONDITION (from auction sheet):
${data.panelConditions ? Object.entries(data.panelConditions).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "Not available"}

DAMAGE CODES:
${data.damageCodes?.length ? data.damageCodes.map((d) => `  ${d.location}: ${d.code} — ${d.meaning} [${d.severity}]`).join("\n") : "None found"}

FINANCIALS:
Asking Price: ¥${formatNumber(data.askingPriceJpy)} (€${formatNumber(data.purchaseEur)})
Total Landed Cost: €${formatNumber(data.totalLandedCost)}
Estimated DE Sale Price: €${formatNumber(data.estimatedSalePrice)}
Gross Margin: €${formatNumber(data.grossMargin)} (${data.grossMarginPct}%)
Cash Outlay Required: €${formatNumber(data.cashOutlay)}
FX Rate: ¥${data.fxRate}/€
${data.fxVolatilityAlert ? `⚠ FX ALERT: ${data.fxVolatilityAlertReason}` : "FX Stability: Normal"}
Deterministic Max Bid: ¥${formatNumber(data.deterministicMaxBid)} (pre-calculated)
${data.maxPurchaseEur ? `Max Purchase Limit: €${formatNumber(data.maxPurchaseEur)} (company policy)` : ""}

MARGIN SCENARIOS:
Pessimistic (P25 sale): €${formatNumber(data.pessimisticMargin)}
Base (median sale): €${formatNumber(data.grossMargin)}
Optimistic (P75 sale): €${formatNumber(data.optimisticMargin)}

MARKET:
Comparable Listings: ${data.comparableCount}
Avg Days on Market: ${data.avgDaysOnMarket}
Market Liquidity: ${data.marketLiquidity}
Trend: ${data.trendDirection}
${data.webSearchFallback ? `⚠ DATA-QUALITY ALERT: Direct scrapers (mobile.de, AutoScout24) were blocked. Market estimate is from Google snippet parsing — fewer details, higher wrong-variant risk. Pipeline will deterministically downgrade BUY → REVIEW.` : ""}${data.webSearchFilterStats ? `\nFilter stats: raw=${data.webSearchFilterStats.raw}, aggregator_filtered=${data.webSearchFilterStats.aggregatorFiltered}, variant_mismatch_filtered=${data.webSearchFilterStats.variantFiltered}, accepted=${data.webSearchFilterStats.accepted}` : ""}

${data.additionalDocsContext ? `ADDITIONAL DOCUMENTS:\n${data.additionalDocsContext}${data.euTypeApproval != null ? `\nEU Type Approval: ${data.euTypeApproval ? "YES" : "NO"}` : ""}` : ""}

${data.historicalComparison ? `HISTORICAL CONTEXT:\n${data.historicalComparison}` : ""}

═══════════════════════════════════════════════════
PRE-COMPUTED RISK SCORES (rule-based per spec §6.5)
═══════════════════════════════════════════════════
These scores are FINAL — you cannot change them. Use them as inputs to your verdict.

Condition Risk:   ${det.risk_scores.condition.score}/5 (${det.risk_scores.condition.level}) — ${det.risk_scores.condition.reasoning}
Provenance Risk:  ${det.risk_scores.provenance.score}/5 (${det.risk_scores.provenance.level}) — ${det.risk_scores.provenance.reasoning}
TUV Risk:         ${det.risk_scores.tuv.score}/5 (${det.risk_scores.tuv.level}) — ${det.risk_scores.tuv.reasoning}
Market Risk:      ${det.risk_scores.market.score}/5 (${det.risk_scores.market.level}) — ${det.risk_scores.market.reasoning}
Currency Risk:    ${det.risk_scores.currency.score}/5 (${det.risk_scores.currency.level}) — ${det.risk_scores.currency.reasoning}
Capital Risk:     ${det.risk_scores.capital.score}/5 (${det.risk_scores.capital.level}) — ${det.risk_scores.capital.reasoning}
Overall:          ${det.overall_risk_score}/5 (${det.overall_risk_level})
                  [weighted: condition×25% + market×25% + currency×20% + provenance×15% + tuv×10% + capital×5%]

═══════════════════════════════════════════════════

Return ONLY valid JSON:
{
  "condition_nuance": "1-2 sentences adding qualitative judgment that the rule didn't capture (e.g. 'bolster wear inconsistent with claimed mileage', 'paint quality belies the score'). Empty string if rule reasoning is sufficient.",
  "provenance_nuance": "1-2 sentences adding qualitative judgment on documentation/history (e.g. 'stamps from non-authorized dealer', 'CoC missing critical pages'). Empty string if rule reasoning is sufficient.",
  "verdict": "BUY" | "REVIEW" | "PASS",
  "verdict_reasoning": "2-3 sentence explanation referencing specific numbers and the risk levels above",
  "max_bid_jpy": <integer — use the deterministic max bid as baseline, may adjust based on overall risk. Null if PASS.>,
  "max_bid_reasoning": "How you arrived at this bid — reference the deterministic calculation and any risk-driven adjustments",
  "key_strengths": ["strength 1 with evidence", "strength 2", "strength 3"],
  "key_concerns": ["concern 1 with evidence", "concern 2"],
  "action_items": ["specific action for REVIEW verdicts — what info would change the verdict"]
}

VERDICT RULES (STRICT — you MUST follow these thresholds set by the user):
- BUY: Gross margin >= €${data.minMarginEur != null ? formatNumber(data.minMarginEur) : "15,000"} AND >= ${data.minMarginPct || 20}% AND confidence >= 0.70 AND overall_risk <= 3.0 AND no HIGH individual risks AND pessimistic margin > €0 AND margin is NOT borderline (within 15% of threshold)${data.maxPurchaseEur ? ` AND total landed cost <= €${formatNumber(data.maxPurchaseEur)}` : ""}
- REVIEW: Margin meets BUY threshold but one or more: confidence 0.50-0.70, overall_risk 3.0-4.0, one HIGH risk, pessimistic margin < €0, FX alert active, margin is borderline (within 15% of threshold)
- PASS: Margin < €${data.minMarginEur != null ? formatNumber(data.minMarginEur) : "15,000"} OR < ${data.minMarginPct || 20}% OR confidence < 0.50 OR overall_risk > 4.0 OR multiple HIGH risks OR accident history with poor condition${data.maxPurchaseEur ? ` OR total landed cost > €${formatNumber(data.maxPurchaseEur)}` : ""}`;

/**
 * Assess risks (rules) + generate final BUY/REVIEW/PASS recommendation (LLM).
 *
 * Per spec §6.5, the 6 risk scores are computed deterministically.
 * The LLM is used ONLY for:
 *   - qualitative nuance on condition_risk and provenance_risk
 *   - the final verdict bundle (verdict, max_bid, strengths, concerns, action_items)
 *
 * Output shape matches the previous LLM-only contract so downstream consumers
 * (real-engine.js report assembly, UI) need no changes.
 */
export async function assessRiskAndRecommend(data) {
  // ── Step 1: Deterministic risk scoring (pure rules) ──
  const det = scoreRisksDeterministic(data);

  // ── Step 2: LLM call — verdict bundle + condition/provenance nuance only ──
  const llm = await callClaude({
    prompt: USER_PROMPT(data, det),
    system: SYSTEM_PROMPT,
    jsonMode: true,
    maxTokens: 4096,
  });

  // ── Step 3: Compose final result ──
  // Risk scores ALWAYS come from rules. LLM nuance text is appended to the
  // condition/provenance reasoning when the LLM provides it.
  const conditionNuance = typeof llm?.condition_nuance === "string" ? llm.condition_nuance.trim() : "";
  const provenanceNuance = typeof llm?.provenance_nuance === "string" ? llm.provenance_nuance.trim() : "";

  const composed = {
    risk_scores: {
      ...det.risk_scores,
      condition: {
        ...det.risk_scores.condition,
        reasoning: conditionNuance
          ? `${det.risk_scores.condition.reasoning}. Nuance: ${conditionNuance}`
          : det.risk_scores.condition.reasoning,
        nuance: conditionNuance || null,
      },
      provenance: {
        ...det.risk_scores.provenance,
        reasoning: provenanceNuance
          ? `${det.risk_scores.provenance.reasoning}. Nuance: ${provenanceNuance}`
          : det.risk_scores.provenance.reasoning,
        nuance: provenanceNuance || null,
      },
    },
    overall_risk_score: det.overall_risk_score,
    overall_risk_level: det.overall_risk_level,
    verdict: llm?.verdict || "REVIEW",
    verdict_reasoning: llm?.verdict_reasoning || "Verdict reasoning unavailable",
    max_bid_jpy: llm?.max_bid_jpy ?? null,
    max_bid_reasoning: llm?.max_bid_reasoning || null,
    key_strengths: Array.isArray(llm?.key_strengths) ? llm.key_strengths : [],
    key_concerns: Array.isArray(llm?.key_concerns) ? llm.key_concerns : [],
    action_items: Array.isArray(llm?.action_items) ? llm.action_items : [],
    _rule_based_risks: true,
  };

  return validateRiskOutput(composed);
}
