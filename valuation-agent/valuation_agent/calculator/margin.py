"""Margin analysis — profitability calculation with three scenarios."""

import logging
from decimal import Decimal, ROUND_HALF_UP

from valuation_agent.config import settings
from valuation_agent.schemas import (
    LandedCostBreakdown,
    MarginAnalysis,
    MarginRange,
    PriceStatistics,
)

logger = logging.getLogger(__name__)


def _round(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_margin(
    estimated_sale_price: Decimal,
    landed_cost: LandedCostBreakdown,
    price_stats: PriceStatistics | None = None,
    market_data_confidence: float = 0.7,
    condition_confidence: float = 0.7,
    fx_confidence: float = 0.8,
) -> MarginAnalysis:
    """Calculate margin analysis including three scenarios.

    Args:
        estimated_sale_price: Estimated DE market sale price (EUR).
        landed_cost: Complete landed cost breakdown.
        price_stats: Price statistics for scenario calculations.
        market_data_confidence: Confidence in market data (0-1).
        condition_confidence: Confidence in condition assessment (0-1).
        fx_confidence: Confidence in FX stability (0-1).

    Returns:
        Complete MarginAnalysis object.
    """
    total = landed_cost.total_landed_cost_eur
    cash_outlay = landed_cost.total_cash_outlay_eur
    opex = settings.opex_default_eur

    gross_margin = _round(estimated_sale_price - total)
    gross_margin_pct = (
        _round(gross_margin / estimated_sale_price * Decimal("100"))
        if estimated_sale_price > 0
        else Decimal("0")
    )
    margin_after_opex = _round(gross_margin - opex)

    return_on_capital = (
        _round(gross_margin / cash_outlay * Decimal("100"))
        if cash_outlay > 0
        else Decimal("0")
    )

    # Estimated hold time: ~70 days (4-6 wk shipping + 2-4 wk customs/TÜV + 2-4 wk sale)
    hold_days = 70
    annualized_roi = (
        _round(return_on_capital * Decimal("365") / Decimal(str(hold_days)))
        if hold_days > 0
        else Decimal("0")
    )

    # Composite confidence = geometric mean of three sub-scores
    composite = (market_data_confidence * condition_confidence * fx_confidence) ** (1 / 3)

    # Three scenarios
    margin_range = None
    if price_stats:
        pessimistic = _round(price_stats.p25 - total * Decimal("1.10"))
        base = gross_margin
        optimistic = _round(price_stats.p75 - total)
        margin_range = MarginRange(
            pessimistic=pessimistic,
            base=base,
            optimistic=optimistic,
        )

    logger.info(
        "Margin: €%s (%.1f%%) | ROC: %.1f%% | Confidence: %.2f",
        gross_margin,
        gross_margin_pct,
        return_on_capital,
        composite,
    )

    return MarginAnalysis(
        estimated_sale_price=estimated_sale_price,
        total_landed_cost=total,
        gross_margin_eur=gross_margin,
        gross_margin_pct=gross_margin_pct,
        margin_after_opex=margin_after_opex,
        capital_required=cash_outlay,
        return_on_capital=return_on_capital,
        estimated_hold_days=hold_days,
        annualized_roi=annualized_roi,
        margin_confidence=Decimal(str(round(composite, 2))),
        margin_range=margin_range,
    )
