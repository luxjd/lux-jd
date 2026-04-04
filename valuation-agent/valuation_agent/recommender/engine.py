"""Final BUY/REVIEW/PASS recommendation engine."""

import json
import logging
from decimal import Decimal

from valuation_agent.config import settings
from valuation_agent.llm.client import call_claude, load_prompt
from valuation_agent.schemas import (
    ConditionAssessment,
    LandedCostBreakdown,
    MarginAnalysis,
    MarketAnalysis,
    Recommendation,
    RiskAssessment,
    RiskLevel,
    Verdict,
    VehicleSummary,
)

logger = logging.getLogger(__name__)


def _has_high_risk(risk: RiskAssessment) -> int:
    """Count how many individual risk dimensions are HIGH."""
    count = 0
    for factor in [
        risk.condition_risk,
        risk.provenance_risk,
        risk.tuv_risk,
        risk.market_risk,
        risk.currency_risk,
        risk.capital_risk,
    ]:
        if factor.level == RiskLevel.HIGH:
            count += 1
    return count


def rule_based_verdict(
    margin: MarginAnalysis,
    risk: RiskAssessment,
) -> Verdict:
    """Apply the deterministic verdict rules from Section 3.8."""
    min_margin = Decimal(str(settings.min_margin_eur))
    min_pct = Decimal(str(settings.min_margin_pct))
    high_count = _has_high_risk(risk)

    # PASS conditions
    if margin.gross_margin_eur < min_margin or margin.gross_margin_pct < min_pct:
        if margin.margin_confidence < Decimal("0.50"):
            return Verdict.PASS
        # Check if margin is borderline (within 15% of threshold)
        margin_ratio = margin.gross_margin_eur / min_margin if min_margin > 0 else Decimal("0")
        if margin_ratio < Decimal("0.85"):
            return Verdict.PASS

    if margin.margin_confidence < Decimal("0.50"):
        return Verdict.PASS
    if risk.overall_risk_score > 4.0:
        return Verdict.PASS
    if high_count >= 2:
        return Verdict.PASS

    # REVIEW conditions
    if margin.margin_confidence < Decimal("0.70"):
        return Verdict.REVIEW
    if 3.0 <= risk.overall_risk_score <= 4.0:
        return Verdict.REVIEW
    if high_count == 1:
        return Verdict.REVIEW

    # Check borderline margin
    if margin.gross_margin_eur < min_margin or margin.gross_margin_pct < min_pct:
        return Verdict.REVIEW

    margin_ratio = margin.gross_margin_eur / min_margin if min_margin > 0 else Decimal("0")
    if margin_ratio < Decimal("1.15"):
        return Verdict.REVIEW

    # BUY
    return Verdict.BUY


async def generate_recommendation(
    vehicle_summary: VehicleSummary,
    condition: ConditionAssessment,
    market: MarketAnalysis,
    landed_cost: LandedCostBreakdown,
    margin: MarginAnalysis,
    risk: RiskAssessment,
) -> Recommendation:
    """Generate the final recommendation using rule-based verdict + LLM reasoning."""
    verdict = rule_based_verdict(margin, risk)

    # Calculate max_bid_jpy for BUY or REVIEW
    max_bid_jpy = None
    if verdict in (Verdict.BUY, Verdict.REVIEW):
        min_margin = Decimal(str(settings.min_margin_eur))
        fixed_costs = (
            landed_cost.total_landed_cost_eur - landed_cost.purchase_price_eur
        )
        if landed_cost.fx_rate_used > 0:
            max_purchase_eur = market.estimated_sale_price - min_margin - fixed_costs
            max_bid_jpy = int(max_purchase_eur * landed_cost.fx_rate_used)

    # Use LLM for reasoning
    try:
        prompt_template = load_prompt("recommendation")
        prompt = prompt_template.format(
            vehicle_summary=vehicle_summary.model_dump_json(indent=2),
            condition_assessment=condition.model_dump_json(indent=2),
            market_analysis=market.model_dump_json(indent=2),
            landed_cost=landed_cost.model_dump_json(indent=2),
            margin_analysis=margin.model_dump_json(indent=2),
            risk_assessment=risk.model_dump_json(indent=2),
        )

        response = call_claude(prompt, model_tier="reasoning")
        data = json.loads(response)

        return Recommendation(
            verdict=verdict,
            verdict_reasoning=data.get("verdict_reasoning", ""),
            max_bid_jpy=max_bid_jpy,
            max_bid_reasoning=data.get("max_bid_reasoning", ""),
            key_concerns=data.get("key_concerns", []),
            key_strengths=data.get("key_strengths", []),
            action_items=data.get("action_items", []),
        )

    except Exception as e:
        logger.error("LLM recommendation failed: %s, using rule-based only", e)
        return Recommendation(
            verdict=verdict,
            verdict_reasoning=f"Rule-based verdict: {verdict.value}",
            max_bid_jpy=max_bid_jpy,
            max_bid_reasoning="Calculated from minimum margin threshold",
        )
