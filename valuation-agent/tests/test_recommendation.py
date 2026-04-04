"""Tests for the rule-based verdict logic."""

from decimal import Decimal

from valuation_agent.recommender.engine import rule_based_verdict
from valuation_agent.schemas import (
    MarginAnalysis,
    RiskAssessment,
    RiskFactor,
    RiskLevel,
    Verdict,
)


def _make_margin(**overrides) -> MarginAnalysis:
    defaults = dict(
        estimated_sale_price=Decimal("170000"),
        total_landed_cost=Decimal("120000"),
        gross_margin_eur=Decimal("50000"),
        gross_margin_pct=Decimal("29.4"),
        margin_after_opex=Decimal("49500"),
        capital_required=Decimal("140000"),
        return_on_capital=Decimal("35.7"),
        margin_confidence=Decimal("0.85"),
    )
    defaults.update(overrides)
    return MarginAnalysis(**defaults)


def _make_risk(**overrides) -> RiskAssessment:
    defaults = dict(
        overall_risk_score=2.0,
        overall_risk_level=RiskLevel.LOW,
    )
    defaults.update(overrides)
    return RiskAssessment(**defaults)


class TestRuleBasedVerdict:

    def test_buy_high_margin_low_risk(self):
        """High margin + high confidence + low risk → BUY."""
        verdict = rule_based_verdict(
            margin=_make_margin(),
            risk=_make_risk(),
        )
        assert verdict == Verdict.BUY

    def test_pass_low_margin(self):
        """Margin below threshold → PASS."""
        verdict = rule_based_verdict(
            margin=_make_margin(
                gross_margin_eur=Decimal("5000"),
                gross_margin_pct=Decimal("5"),
                margin_confidence=Decimal("0.3"),
            ),
            risk=_make_risk(),
        )
        assert verdict == Verdict.PASS

    def test_pass_very_high_risk(self):
        """Overall risk > 4.0 → PASS."""
        verdict = rule_based_verdict(
            margin=_make_margin(),
            risk=_make_risk(overall_risk_score=4.5),
        )
        assert verdict == Verdict.PASS

    def test_review_low_confidence(self):
        """Good margin but low confidence → REVIEW."""
        verdict = rule_based_verdict(
            margin=_make_margin(margin_confidence=Decimal("0.55")),
            risk=_make_risk(),
        )
        assert verdict == Verdict.REVIEW

    def test_review_one_high_risk(self):
        """One HIGH individual risk → REVIEW."""
        verdict = rule_based_verdict(
            margin=_make_margin(),
            risk=_make_risk(
                condition_risk=RiskFactor(score=5, level=RiskLevel.HIGH),
                overall_risk_score=3.0,
            ),
        )
        assert verdict == Verdict.REVIEW

    def test_pass_multiple_high_risks(self):
        """Multiple HIGH risks → PASS."""
        verdict = rule_based_verdict(
            margin=_make_margin(),
            risk=_make_risk(
                condition_risk=RiskFactor(score=5, level=RiskLevel.HIGH),
                provenance_risk=RiskFactor(score=5, level=RiskLevel.HIGH),
                overall_risk_score=4.5,
            ),
        )
        assert verdict == Verdict.PASS
