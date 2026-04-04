"""Risk scoring logic — primarily rule-based for determinism."""

import logging

from valuation_agent.schemas import (
    ConditionAssessment,
    LandedCostBreakdown,
    MarginAnalysis,
    MarketAnalysis,
    MarketLiquidity,
    RiskAssessment,
    RiskFactor,
    RiskLevel,
    TrendDirection,
    ValuationInput,
)

logger = logging.getLogger(__name__)


def _score_to_level(score: int) -> RiskLevel:
    if score <= 2:
        return RiskLevel.LOW
    if score <= 3:
        return RiskLevel.MED
    return RiskLevel.HIGH


def assess_condition_risk(
    condition: ConditionAssessment,
    vehicle: ValuationInput,
) -> RiskFactor:
    """Assess condition risk from auction grade, photos, age/mileage ratio."""
    score = 1

    # Auction grade
    if vehicle.auction_grade:
        if vehicle.auction_grade < 3.5:
            score += 3
        elif vehicle.auction_grade < 4.0:
            score += 2
        elif vehicle.auction_grade < 4.5:
            score += 1

    # Photo confidence
    if condition.condition_confidence < 0.5:
        score += 1

    # Age vs mileage ratio (high mileage for age = higher risk)
    expected_annual_km = 8000  # luxury car average
    age = max(1, 2026 - vehicle.year)
    expected_km = expected_annual_km * age
    if vehicle.mileage_km > expected_km * 1.5:
        score += 1

    score = min(5, max(1, score))
    return RiskFactor(score=score, level=_score_to_level(score))


def assess_provenance_risk(vehicle: ValuationInput) -> RiskFactor:
    """Assess provenance risk from service history and accident status."""
    score = 1

    from valuation_agent.schemas import ServiceHistory

    if vehicle.service_history == ServiceHistory.UNKNOWN:
        score += 2
    elif vehicle.service_history == ServiceHistory.INDEPENDENT:
        score += 1

    if vehicle.accident_history:
        score += 2

    score = min(5, max(1, score))
    return RiskFactor(score=score, level=_score_to_level(score))


def assess_tuv_risk(vehicle: ValuationInput, condition: ConditionAssessment) -> RiskFactor:
    """Assess TÜV risk based on spec, drive side, modifications."""
    score = 1

    from valuation_agent.schemas import DriveSide

    if vehicle.drive_side == DriveSide.RHD:
        score += 1

    if condition.modification_notes:
        score += len(condition.modification_notes)

    score = min(5, max(1, score))
    return RiskFactor(score=score, level=_score_to_level(score))


def assess_market_risk(market: MarketAnalysis) -> RiskFactor:
    """Assess market risk from liquidity and trend."""
    score = 1

    if market.market_liquidity == MarketLiquidity.LOW:
        score += 2
    elif market.market_liquidity == MarketLiquidity.MEDIUM:
        score += 1

    if market.trend_direction == TrendDirection.DECLINING:
        score += 1

    if market.total_comparables_found < 5:
        score += 1

    score = min(5, max(1, score))
    return RiskFactor(score=score, level=_score_to_level(score))


def assess_currency_risk() -> RiskFactor:
    """Assess currency risk from FX volatility.

    TODO: Integrate real FX volatility data (30-day std dev of JPY/EUR).
    """
    return RiskFactor(score=2, level=RiskLevel.LOW)


def assess_capital_risk(margin: MarginAnalysis) -> RiskFactor:
    """Assess capital risk: capital required relative to expected margin."""
    if margin.capital_required == 0:
        return RiskFactor(score=3, level=RiskLevel.MED)

    ratio = float(margin.gross_margin_eur / margin.capital_required)
    if ratio >= 0.25:
        score = 1
    elif ratio >= 0.15:
        score = 2
    elif ratio >= 0.10:
        score = 3
    else:
        score = 4

    return RiskFactor(score=min(5, score), level=_score_to_level(min(5, score)))


def calculate_risk_assessment(
    vehicle: ValuationInput,
    condition: ConditionAssessment,
    market: MarketAnalysis,
    margin: MarginAnalysis,
) -> RiskAssessment:
    """Calculate all risk dimensions and overall weighted score.

    Weights: condition 25%, market 25%, currency 20%, provenance 15%, TÜV 10%, capital 5%.
    """
    cond = assess_condition_risk(condition, vehicle)
    prov = assess_provenance_risk(vehicle)
    tuv = assess_tuv_risk(vehicle, condition)
    mkt = assess_market_risk(market)
    ccy = assess_currency_risk()
    cap = assess_capital_risk(margin)

    overall = (
        cond.score * 0.25
        + mkt.score * 0.25
        + ccy.score * 0.20
        + prov.score * 0.15
        + tuv.score * 0.10
        + cap.score * 0.05
    )

    return RiskAssessment(
        condition_risk=cond,
        provenance_risk=prov,
        tuv_risk=tuv,
        market_risk=mkt,
        currency_risk=ccy,
        capital_risk=cap,
        overall_risk_score=round(overall, 2),
        overall_risk_level=_score_to_level(round(overall)),
    )
