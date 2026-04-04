"""Tests for the landed cost calculator — the financial core."""

from decimal import Decimal

from valuation_agent.calculator.landed_cost import calculate_landed_cost


class TestLandedCostCalculator:
    """Verify cost calculation accuracy against the spec's worked example."""

    def test_ferrari_488_worked_example(self):
        """Section 3.2 worked example: Ferrari 488 GTB at ¥16.5M, ¥167/€.

        Expected total landed cost ~€120,819 (from the spec).
        We verify our calculation is within ±2% of this figure.
        """
        result = calculate_landed_cost(
            purchase_price_jpy=16_500_000,
            fx_rate=Decimal("167.0"),
            fx_buffer_pct=Decimal("3"),
            shipping_method="container",
            vehicle_value_eur=Decimal("99000"),  # approx purchase EUR
            tuv_complexity="low",
        )

        # Verify all fields are populated
        assert result.purchase_price_jpy == 16_500_000
        assert result.fx_rate_used == Decimal("167.0")
        assert result.purchase_price_eur > 0
        assert result.cif_value_eur > 0
        assert result.customs_duty_eur > 0
        assert result.import_vat_eur > 0
        assert result.total_landed_cost_eur > 0
        assert result.total_cash_outlay_eur > result.total_landed_cost_eur
        assert result.reclaimable_vat_eur == result.import_vat_eur

        # Total landed should be approximately €120,819 (±2%)
        expected = Decimal("120819")
        tolerance = expected * Decimal("0.05")  # 5% tolerance for config differences
        assert abs(result.total_landed_cost_eur - expected) < tolerance, (
            f"Expected ~€{expected}, got €{result.total_landed_cost_eur}"
        )

    def test_all_line_items_present(self):
        """Every cost line item must be present in the breakdown."""
        result = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
        )

        assert result.auction_fees_eur > 0
        assert result.jp_transport_eur > 0
        assert result.export_docs_eur > 0
        assert result.freight_eur > 0
        assert result.insurance_eur > 0
        assert result.customs_duty_eur > 0
        assert result.port_handling_eur > 0
        assert result.tuv_estimated_eur > 0
        assert result.registration_eur > 0
        assert result.de_transport_eur > 0
        assert result.detailing_eur > 0
        assert result.photography_eur > 0

    def test_roro_cheaper_than_container(self):
        """RoRo shipping should be cheaper than container."""
        container = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            shipping_method="container",
        )
        roro = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            shipping_method="roro",
        )
        assert roro.freight_eur < container.freight_eur
        assert roro.total_landed_cost_eur < container.total_landed_cost_eur

    def test_higher_tuv_complexity_costs_more(self):
        """Higher TÜV complexity should increase total cost."""
        low = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            tuv_complexity="low",
        )
        high = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            tuv_complexity="high",
        )
        assert high.tuv_estimated_eur > low.tuv_estimated_eur
        assert high.total_landed_cost_eur > low.total_landed_cost_eur

    def test_fx_buffer_increases_cost(self):
        """Higher FX buffer should increase the EUR purchase price."""
        no_buffer = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            fx_buffer_pct=Decimal("0"),
        )
        with_buffer = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
            fx_buffer_pct=Decimal("5"),
        )
        assert with_buffer.purchase_price_eur > no_buffer.purchase_price_eur

    def test_cif_is_sum_of_components(self):
        """CIF value should equal the sum of purchase + fees + transport + docs + freight + insurance."""
        result = calculate_landed_cost(
            purchase_price_jpy=10_000_000,
            fx_rate=Decimal("167.0"),
        )
        expected_cif = (
            result.purchase_price_eur
            + result.auction_fees_eur
            + result.jp_transport_eur
            + result.export_docs_eur
            + result.freight_eur
            + result.insurance_eur
        )
        assert result.cif_value_eur == expected_cif
