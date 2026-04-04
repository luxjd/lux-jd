"""Tests for the margin calculator."""

from decimal import Decimal

from valuation_agent.calculator.landed_cost import calculate_landed_cost
from valuation_agent.calculator.margin import calculate_margin
from valuation_agent.schemas import PriceStatistics


class TestMarginCalculator:

    def test_basic_margin_calculation(self):
        """Margin = sale price - landed cost."""
        landed = calculate_landed_cost(
            purchase_price_jpy=16_500_000,
            fx_rate=Decimal("167.0"),
        )
        margin = calculate_margin(
            estimated_sale_price=Decimal("170000"),
            landed_cost=landed,
        )

        assert margin.gross_margin_eur == Decimal("170000") - landed.total_landed_cost_eur
        assert margin.gross_margin_pct > 0
        assert margin.capital_required == landed.total_cash_outlay_eur
        assert margin.return_on_capital > 0

    def test_margin_with_scenarios(self):
        """Three scenarios should be present when price stats are provided."""
        landed = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
        )
        stats = PriceStatistics(
            mean=Decimal("90000"),
            median=Decimal("88000"),
            p25=Decimal("80000"),
            p75=Decimal("98000"),
            min=Decimal("70000"),
            max=Decimal("110000"),
        )
        margin = calculate_margin(
            estimated_sale_price=Decimal("88000"),
            landed_cost=landed,
            price_stats=stats,
        )

        assert margin.margin_range is not None
        assert margin.margin_range.pessimistic < margin.margin_range.base
        assert margin.margin_range.base <= margin.margin_range.optimistic

    def test_negative_margin(self):
        """If sale price < landed cost, margin should be negative."""
        landed = calculate_landed_cost(
            purchase_price_jpy=20_000_000,
            fx_rate=Decimal("167.0"),
        )
        margin = calculate_margin(
            estimated_sale_price=Decimal("80000"),
            landed_cost=landed,
        )

        assert margin.gross_margin_eur < 0
        assert margin.gross_margin_pct < 0

    def test_confidence_composite(self):
        """Confidence should be the geometric mean of sub-scores."""
        landed = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
        )
        margin = calculate_margin(
            estimated_sale_price=Decimal("100000"),
            landed_cost=landed,
            market_data_confidence=1.0,
            condition_confidence=1.0,
            fx_confidence=1.0,
        )
        assert float(margin.margin_confidence) == 1.0
