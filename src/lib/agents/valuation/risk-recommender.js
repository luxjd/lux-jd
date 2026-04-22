import { callClaude } from "@/lib/claude";
import { formatNumber } from "@/lib/format";
import { validateRiskOutput } from "./validation";
import { scoreRisksDeterministic } from "./risk-scorer";
import { loadPrompt } from "./prompts/loader";

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

// Spec §8.1 — system + user prompts live in prompts/recommendation*.txt.
function buildRecommendationPrompt(data, det) {
  const panelConditionsBlock = data.panelConditions
    ? Object.entries(data.panelConditions).map(([k, v]) => `  ${k}: ${v}`).join("\n")
    : "Not available";
  const damageCodesBlock = data.damageCodes?.length
    ? data.damageCodes.map((d) => `  ${d.location}: ${d.code} — ${d.meaning} [${d.severity}]`).join("\n")
    : "None found";

  return loadPrompt("recommendation", {
    make: data.make,
    model: data.model,
    year: data.year,
    mileageKm: formatNumber(data.mileageKm),
    driveSide: data.driveSide,
    exteriorColor: data.exteriorColor,
    serviceHistory: data.serviceHistory || "Unknown",
    serviceBookPresent: data.serviceBookPresent != null ? (data.serviceBookPresent ? "Yes" : "No") : "Unknown",
    auctionGradeLine: `${data.auctionGrade || "N/A"}${data.interiorGrade ? ` (Interior: ${data.interiorGrade})` : ""}`,
    accidentHistoryLine: data.accidentHistory ? "YES — documented" : "No",
    accidentContradictionLine: data.accidentContradiction ? `⚠ ACCIDENT FLAG CONTRADICTION: ${data.accidentContradiction}` : "",
    conditionExterior: data.conditionExterior,
    conditionInterior: data.conditionInterior,
    interiorOriginality: data.interiorOriginality || "Unknown",
    conditionNotes: data.conditionNotes || "None",
    tuvRiskFlagsLine: data.tuvRiskFlags?.length ? `TUV Risk Flags: ${data.tuvRiskFlags.join("; ")}` : "No TUV risk flags detected",
    visibleDamageLine: data.visibleDamage?.length ? `Visible Damage: ${data.visibleDamage.join("; ")}` : "",
    modificationsLine: data.modifications?.length ? `Modifications: ${data.modifications.join("; ")}` : "No modifications",
    panelConditionsBlock,
    damageCodesBlock,
    askingPriceJpy: formatNumber(data.askingPriceJpy),
    purchaseEur: formatNumber(data.purchaseEur),
    totalLandedCost: formatNumber(data.totalLandedCost),
    estimatedSalePrice: formatNumber(data.estimatedSalePrice),
    grossMargin: formatNumber(data.grossMargin),
    grossMarginPct: data.grossMarginPct,
    cashOutlay: formatNumber(data.cashOutlay),
    fxRate: data.fxRate,
    fxAlertLine: data.fxVolatilityAlert ? `⚠ FX ALERT: ${data.fxVolatilityAlertReason}` : "FX Stability: Normal",
    deterministicMaxBid: formatNumber(data.deterministicMaxBid),
    maxPurchaseLimitLine: data.maxPurchaseEur ? `Max Purchase Limit: €${formatNumber(data.maxPurchaseEur)} (company policy)` : "",
    pessimisticMargin: formatNumber(data.pessimisticMargin),
    optimisticMargin: formatNumber(data.optimisticMargin),
    comparableCount: data.comparableCount,
    avgDaysOnMarket: data.avgDaysOnMarket,
    marketLiquidity: data.marketLiquidity,
    trendDirection: data.trendDirection,
    webSearchFallbackLine: data.webSearchFallback
      ? "⚠ DATA-QUALITY ALERT: Direct scrapers (mobile.de, AutoScout24) were blocked. Market estimate is from Google snippet parsing — fewer details, higher wrong-variant risk. Pipeline will deterministically downgrade BUY → REVIEW."
      : "",
    webSearchFilterLine: data.webSearchFilterStats
      ? `\nFilter stats: raw=${data.webSearchFilterStats.raw}, aggregator_filtered=${data.webSearchFilterStats.aggregatorFiltered}, variant_mismatch_filtered=${data.webSearchFilterStats.variantFiltered}, accepted=${data.webSearchFilterStats.accepted}`
      : "",
    additionalDocsBlock: data.additionalDocsContext
      ? `ADDITIONAL DOCUMENTS:\n${data.additionalDocsContext}${data.euTypeApproval != null ? `\nEU Type Approval: ${data.euTypeApproval ? "YES" : "NO"}` : ""}`
      : "",
    historicalContextBlock: data.historicalComparison ? `HISTORICAL CONTEXT:\n${data.historicalComparison}` : "",
    conditionScore: det.risk_scores.condition.score,
    conditionLevel: det.risk_scores.condition.level,
    conditionReasoning: det.risk_scores.condition.reasoning,
    provenanceScore: det.risk_scores.provenance.score,
    provenanceLevel: det.risk_scores.provenance.level,
    provenanceReasoning: det.risk_scores.provenance.reasoning,
    tuvScore: det.risk_scores.tuv.score,
    tuvLevel: det.risk_scores.tuv.level,
    tuvReasoning: det.risk_scores.tuv.reasoning,
    marketScore: det.risk_scores.market.score,
    marketLevel: det.risk_scores.market.level,
    marketReasoning: det.risk_scores.market.reasoning,
    currencyScore: det.risk_scores.currency.score,
    currencyLevel: det.risk_scores.currency.level,
    currencyReasoning: det.risk_scores.currency.reasoning,
    capitalScore: det.risk_scores.capital.score,
    capitalLevel: det.risk_scores.capital.level,
    capitalReasoning: det.risk_scores.capital.reasoning,
    overallRiskScore: det.overall_risk_score,
    overallRiskLevel: det.overall_risk_level,
    minMarginEur: data.minMarginEur != null ? formatNumber(data.minMarginEur) : "15,000",
    minMarginPct: data.minMarginPct || 20,
    maxPurchaseClause: data.maxPurchaseEur ? ` AND total landed cost <= €${formatNumber(data.maxPurchaseEur)}` : "",
    maxPurchasePassClause: data.maxPurchaseEur ? ` OR total landed cost > €${formatNumber(data.maxPurchaseEur)}` : "",
  });
}

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
    prompt: buildRecommendationPrompt(data, det),
    system: loadPrompt("recommendation.system"),
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
