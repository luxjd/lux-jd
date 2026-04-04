"""Landed cost calculator — the financial core.

All calculations use Decimal for precision. Never float for money.
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

from valuation_agent.config import settings
from valuation_agent.schemas import LandedCostBreakdown

logger = logging.getLogger(__name__)


def _round_eur(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_landed_cost(
    purchase_price_jpy: int,
    fx_rate: Decimal,
    *,
    fx_buffer_pct: Decimal | None = None,
    shipping_method: str = "container",
    vehicle_value_eur: Decimal | None = None,
    tuv_complexity: str = "low",
) -> LandedCostBreakdown:
    """Calculate the full landed cost from JP auction to DE sale-ready.

    Args:
        purchase_price_jpy: Hammer price in JPY.
        fx_rate: Current JPY per EUR rate (e.g. 167.0).
        fx_buffer_pct: Currency buffer percentage. Defaults to config value.
        shipping_method: 'container' or 'roro'.
        vehicle_value_eur: Estimated vehicle value for insurance calc. If None, uses purchase price.
        tuv_complexity: 'low', 'medium', or 'high'.

    Returns:
        Complete LandedCostBreakdown with every line item.
    """
    buffer = fx_buffer_pct if fx_buffer_pct is not None else settings.currency_buffer_pct
    price_jpy = Decimal(str(purchase_price_jpy))

    # Purchase price in EUR with FX buffer
    buffered_rate = fx_rate * (Decimal("1") - buffer / Decimal("100"))
    purchase_eur = _round_eur(price_jpy / buffered_rate)

    # Auction fees (4% default)
    auction_fees = _round_eur(purchase_eur * settings.auction_fee_pct)

    # Fixed JP costs
    jp_transport = settings.jp_transport_eur
    export_docs = settings.export_docs_eur

    # Freight
    freight = (
        settings.freight_container_eur
        if shipping_method == "container"
        else settings.freight_roro_eur
    )

    # Insurance (2% of vehicle value)
    insured_value = vehicle_value_eur if vehicle_value_eur else purchase_eur
    insurance = _round_eur(insured_value * settings.insurance_pct)

    # CIF value = sum of all above
    cif_value = _round_eur(
        purchase_eur + auction_fees + jp_transport + export_docs + freight + insurance
    )

    # Customs duty (10% of CIF)
    customs_duty = _round_eur(cif_value * settings.customs_duty_pct)

    # Import VAT (19% of CIF + duty) — reclaimable
    import_vat = _round_eur((cif_value + customs_duty) * settings.import_vat_pct)

    # DE-side fixed costs
    port_handling = settings.port_handling_eur

    # TÜV cost by complexity
    tuv_cost_map = {
        "low": settings.tuv_cost_low_eur,
        "medium": settings.tuv_cost_medium_eur,
        "high": settings.tuv_cost_high_eur,
    }
    tuv_cost = tuv_cost_map.get(tuv_complexity, settings.tuv_cost_low_eur)

    registration = settings.registration_eur
    de_transport = settings.de_transport_eur
    detailing = settings.detailing_eur
    photography = settings.photography_eur

    # Totals
    total_landed = _round_eur(
        cif_value
        + customs_duty
        + port_handling
        + tuv_cost
        + registration
        + de_transport
        + detailing
        + photography
    )

    total_with_vat = _round_eur(total_landed + import_vat)

    logger.info(
        "Landed cost: ¥%s → €%s (landed) / €%s (with VAT)",
        purchase_price_jpy,
        total_landed,
        total_with_vat,
    )

    return LandedCostBreakdown(
        purchase_price_jpy=purchase_price_jpy,
        fx_rate_used=fx_rate,
        fx_buffer_applied=buffer,
        purchase_price_eur=purchase_eur,
        auction_fees_eur=auction_fees,
        jp_transport_eur=jp_transport,
        export_docs_eur=export_docs,
        freight_eur=freight,
        insurance_eur=insurance,
        cif_value_eur=cif_value,
        customs_duty_eur=customs_duty,
        import_vat_eur=import_vat,
        port_handling_eur=port_handling,
        tuv_estimated_eur=tuv_cost,
        registration_eur=registration,
        de_transport_eur=de_transport,
        detailing_eur=detailing,
        photography_eur=photography,
        total_landed_cost_eur=total_landed,
        total_cash_outlay_eur=total_with_vat,
        reclaimable_vat_eur=import_vat,
    )
