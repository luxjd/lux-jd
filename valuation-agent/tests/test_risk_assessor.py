"""Tests for the risk assessment engine."""

from decimal import Decimal

from valuation_agent.analyzer.risk_assessor import calculate_risk_assessment
from valuation_agent.schemas import (
    ConditionAssessment,
    DriveSide,
    MarginAnalysis,
    MarketAnalysis,
    MarketLiquidity,
    RiskLevel,
    ServiceHistory,
    TrendDirection,
    ValuationInput,
)


class TestRiskAssessor:

    def _make_input(self, **overrides) -> ValuationInput:
        defaults = dict(
            make="Ferrari",
            model="488 GTB",
            year=2017,
            mileage_km=18000,
            drive_side=DriveSide.LHD,
            asking_price_jpy=16_500_000,
            exterior_color="Rosso Corsa",
            service_history=ServiceHistory.FULL_DEALER,
            accident_history=False,
            auction_grade=4.5,
        )
        defaults.update(overrides)
        return ValuationInput(**defaults)

    def _make_condition(self, **overrides) -> ConditionAssessment:
        return ConditionAssessment(**overrides)

    def _make_market(self, **overrides) -> MarketAnalysis:
        defaults = dict(
            total_comparables_found=10,
            market_liquidity=MarketLiquidity.HIGH,
            trend_direction=TrendDirection.STABLE,
        )
        defaults.update(overrides)
        return MarketAnalysis(**defaults)

    def _make_margin(self, **overrides) -> MarginAnalysis:
        defaults = dict(
            estimated_sale_price=Decimal("170000"),
            total_landed_cost=Decimal("120000"),
            gross_margin_eur=Decimal("50000"),
            gross_margin_pct=Decimal("29.4"),
            margin_after_opex=Decimal("49500"),
            capital_required=Decimal("140000"),
            return_on_capital=Decimal("35.7"),
        )
        defaults.update(overrides)
        return MarginAnalysis(**defaults)

    def test_low_risk_vehicle(self):
        """Grade 4.5, full dealer history, LHD, no accidents → low risk."""
        risk = calculate_risk_assessment(
            vehicle=self._make_input(),
            condition=self._make_condition(condition_confidence=0.9),
            market=self._make_market(),
            margin=self._make_margin(),
        )
        assert risk.overall_risk_score <= 2.5
        assert risk.overall_risk_level == RiskLevel.LOW

    def test_high_risk_vehicle(self):
        """Low grade, unknown history, RHD, accidents → high risk."""
        risk = calculate_risk_assessment(
            vehicle=self._make_input(
                auction_grade=3.0,
                service_history=ServiceHistory.UNKNOWN,
                drive_side=DriveSide.RHD,
                accident_history=True,
            ),
            condition=self._make_condition(
                condition_confidence=0.3,
                modification_notes=["Aftermarket exhaust", "Lowering springs"],
            ),
            market=self._make_market(
                total_comparables_found=2,
                market_liquidity=MarketLiquidity.LOW,
                trend_direction=TrendDirection.DECLINING,
            ),
            margin=self._make_margin(
                gross_margin_eur=Decimal("5000"),
                capital_required=Decimal("140000"),
            ),
        )
        assert risk.overall_risk_score >= 3.0

    def test_all_six_dimensions_populated(self):
        """All risk dimensions must have scores between 1 and 5."""
        risk = calculate_risk_assessment(
            vehicle=self._make_input(),
            condition=self._make_condition(),
            market=self._make_market(),
            margin=self._make_margin(),
        )
        for factor in [
            risk.condition_risk,
            risk.provenance_risk,
            risk.tuv_risk,
            risk.market_risk,
            risk.currency_risk,
            risk.capital_risk,
        ]:
            assert 1 <= factor.score <= 5
            assert factor.level in (RiskLevel.LOW, RiskLevel.MED, RiskLevel.HIGH)
