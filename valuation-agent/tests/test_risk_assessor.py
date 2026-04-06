"""Tests for the risk assessment engine."""

import pytest
from decimal import Decimal

from valuation_agent.analyzer.risk_assessor import (
    assess_condition_risk,
    assess_provenance_risk,
    assess_tuv_risk,
    assess_market_risk,
    assess_capital_risk,
    calculate_risk_assessment,
)
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

    def test_low_risk_condition(self):
        """Grade 4.5, high confidence → low condition risk."""
        risk = assess_condition_risk(
            condition=self._make_condition(condition_confidence=0.9),
            vehicle=self._make_input(),
        )
        assert risk.score <= 2
        assert risk.level == RiskLevel.LOW

    def test_high_risk_condition(self):
        """Low grade, low confidence → high condition risk."""
        risk = assess_condition_risk(
            condition=self._make_condition(condition_confidence=0.3),
            vehicle=self._make_input(auction_grade=3.0),
        )
        assert risk.score >= 4

    def test_provenance_risk_full_dealer_no_accident(self):
        """Full dealer history, no accidents → low provenance risk."""
        risk = assess_provenance_risk(self._make_input())
        assert risk.score == 1
        assert risk.level == RiskLevel.LOW

    def test_provenance_risk_unknown_with_accident(self):
        """Unknown history + accident → high provenance risk."""
        risk = assess_provenance_risk(
            self._make_input(
                service_history=ServiceHistory.UNKNOWN,
                accident_history=True,
            )
        )
        assert risk.score >= 4

    def test_market_risk_low_supply(self):
        """Few comparables + declining trend → high market risk."""
        risk = assess_market_risk(
            self._make_market(
                total_comparables_found=2,
                market_liquidity=MarketLiquidity.LOW,
                trend_direction=TrendDirection.DECLINING,
            )
        )
        assert risk.score >= 4

    def test_brand_adjusted_mileage(self):
        """Ferrari with 5k expected annual km — 18k over 9 years is fine."""
        risk = assess_condition_risk(
            condition=self._make_condition(condition_confidence=0.9),
            vehicle=self._make_input(make="Ferrari", year=2017, mileage_km=18000),
        )
        # 9 years * 5000 = 45000 expected, 18000 actual = low mileage = low risk
        assert risk.score <= 2

    def test_all_six_dimensions_populated(self):
        """All non-async risk dimensions must have scores between 1 and 5."""
        for risk_fn, args in [
            (assess_condition_risk, (self._make_condition(), self._make_input())),
            (assess_provenance_risk, (self._make_input(),)),
            (assess_tuv_risk, (self._make_input(), self._make_condition())),
            (assess_market_risk, (self._make_market(),)),
            (assess_capital_risk, (self._make_margin(),)),
        ]:
            factor = risk_fn(*args)
            assert 1 <= factor.score <= 5
            assert factor.level in (RiskLevel.LOW, RiskLevel.MED, RiskLevel.HIGH)

    @pytest.mark.asyncio
    async def test_full_risk_assessment_async(self):
        """Full risk assessment (with real FX volatility call) returns valid results."""
        risk = await calculate_risk_assessment(
            vehicle=self._make_input(),
            condition=self._make_condition(condition_confidence=0.9),
            market=self._make_market(),
            margin=self._make_margin(),
        )
        assert 1.0 <= risk.overall_risk_score <= 5.0
        assert risk.overall_risk_level in (RiskLevel.LOW, RiskLevel.MED, RiskLevel.HIGH)
        # Currency risk should now come from real data (not hardcoded LOW)
        assert 1 <= risk.currency_risk.score <= 5
