"""Tests for Pydantic schema validation."""

import pytest
from decimal import Decimal

from valuation_agent.schemas import (
    DriveSide,
    ValuationInput,
    ValuationReport,
    VehicleSummary,
    ConditionAssessment,
    MarketAnalysis,
    LandedCostBreakdown,
    MarginAnalysis,
    RiskAssessment,
    Recommendation,
)


class TestValuationInput:

    def test_valid_input(self, ferrari_488_input):
        assert ferrari_488_input.make == "Ferrari"
        assert ferrari_488_input.year == 2017

    def test_year_validation(self):
        with pytest.raises(Exception):
            ValuationInput(
                make="Ferrari",
                model="488",
                year=1800,  # too old
                mileage_km=10000,
                drive_side=DriveSide.LHD,
                asking_price_jpy=10000000,
                exterior_color="Red",
            )

    def test_negative_price_rejected(self):
        with pytest.raises(Exception):
            ValuationInput(
                make="Ferrari",
                model="488",
                year=2020,
                mileage_km=10000,
                drive_side=DriveSide.LHD,
                asking_price_jpy=-100,
                exterior_color="Red",
            )


class TestValuationReport:

    def test_report_has_all_fields(self):
        """ValuationReport must contain all required sub-objects."""
        report = ValuationReport(
            vehicle_summary=VehicleSummary(
                make="Ferrari", model="488 GTB", year=2017,
                mileage_km=18000, drive_side=DriveSide.LHD,
                exterior_color="Rosso Corsa",
            ),
            condition_assessment=ConditionAssessment(),
            market_analysis=MarketAnalysis(),
            landed_cost=LandedCostBreakdown(
                purchase_price_jpy=16500000,
                fx_rate_used=Decimal("167"),
                fx_buffer_applied=Decimal("3"),
                purchase_price_eur=Decimal("101852"),
                auction_fees_eur=Decimal("4074"),
                jp_transport_eur=Decimal("400"),
                export_docs_eur=Decimal("175"),
                freight_eur=Decimal("2800"),
                insurance_eur=Decimal("1980"),
                cif_value_eur=Decimal("111281"),
                customs_duty_eur=Decimal("11128"),
                import_vat_eur=Decimal("23258"),
                port_handling_eur=Decimal("600"),
                tuv_estimated_eur=Decimal("400"),
                registration_eur=Decimal("150"),
                de_transport_eur=Decimal("450"),
                detailing_eur=Decimal("1200"),
                photography_eur=Decimal("500"),
                total_landed_cost_eur=Decimal("126709"),
                total_cash_outlay_eur=Decimal("149967"),
                reclaimable_vat_eur=Decimal("23258"),
            ),
            margin_analysis=MarginAnalysis(
                estimated_sale_price=Decimal("170000"),
                total_landed_cost=Decimal("126709"),
                gross_margin_eur=Decimal("43291"),
                gross_margin_pct=Decimal("25.5"),
                margin_after_opex=Decimal("42791"),
                capital_required=Decimal("149967"),
                return_on_capital=Decimal("28.9"),
            ),
            risk_assessment=RiskAssessment(),
            recommendation=Recommendation(),
        )

        assert report.valuation_id is not None
        assert report.timestamp is not None
        assert report.vehicle_summary.make == "Ferrari"

        # Verify JSON serialization works
        json_str = report.model_dump_json()
        assert "Ferrari" in json_str
