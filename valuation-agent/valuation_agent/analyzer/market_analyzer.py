"""Market analysis — price statistics and LLM-powered price adjustments.

Uses real scraper data to derive trends, days-on-market, and liquidity.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal

from valuation_agent.llm.client import call_claude, load_prompt
from valuation_agent.schemas import (
    ComparableListing,
    MarketAnalysis,
    MarketLiquidity,
    PriceAdjustment,
    PriceStatistics,
    TrendDirection,
    ValuationInput,
)

logger = logging.getLogger(__name__)


def calculate_price_statistics(listings: list[ComparableListing]) -> PriceStatistics | None:
    """Calculate basic price statistics from comparable listings."""
    if not listings:
        return None

    prices = sorted(listing.price_eur for listing in listings)
    n = len(prices)

    return PriceStatistics(
        mean=Decimal(str(sum(prices) / n)),
        median=prices[n // 2] if n % 2 else Decimal(str((prices[n // 2 - 1] + prices[n // 2]) / 2)),
        p25=prices[max(0, n // 4)],
        p75=prices[min(n - 1, 3 * n // 4)],
        min=prices[0],
        max=prices[-1],
    )


def estimate_days_on_market(listings: list[ComparableListing]) -> int:
    """Estimate average days-on-market from listing dates.

    If listing dates are available, calculates how long listings have been active.
    Falls back to a heuristic based on listing count (more listings = longer DOM).
    """
    today = datetime.utcnow()
    days_list = []

    for listing in listings:
        if listing.listing_date:
            try:
                # Try common date formats
                for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
                    try:
                        listed = datetime.strptime(listing.listing_date, fmt)
                        dom = (today - listed).days
                        if 0 < dom < 365:
                            days_list.append(dom)
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

    if days_list:
        avg_dom = sum(days_list) // len(days_list)
        logger.info("Estimated DOM from %d listings with dates: %d days", len(days_list), avg_dom)
        return avg_dom

    # Heuristic fallback: more listings on market = slower sales
    count = len(listings)
    if count <= 5:
        return 21  # Low supply = fast sales
    elif count <= 15:
        return 35  # Moderate supply
    elif count <= 30:
        return 45  # High supply
    else:
        return 60  # Very high supply = slow market

    return 30


def detect_trend(listings: list[ComparableListing]) -> TrendDirection:
    """Detect price trend from listing data.

    Compares lower-mileage (newer condition) listings against higher-mileage ones
    within the same year range to infer if the market is rising or declining.

    A more sophisticated version would compare against historical snapshots.
    """
    if len(listings) < 5:
        return TrendDirection.STABLE  # Not enough data

    # Sort by mileage as a proxy for "freshness" of listing
    sorted_by_km = sorted(listings, key=lambda x: x.mileage_km)
    half = len(sorted_by_km) // 2

    low_km_avg = sum(l.price_eur for l in sorted_by_km[:half]) / half
    high_km_avg = sum(l.price_eur for l in sorted_by_km[half:]) / (len(sorted_by_km) - half)

    # If low-km vehicles are priced significantly above average, demand is strong
    if low_km_avg > 0:
        premium_pct = float((low_km_avg - high_km_avg) / low_km_avg * 100)
    else:
        premium_pct = 0

    if premium_pct > 15:
        trend = TrendDirection.RISING
    elif premium_pct < 5:
        trend = TrendDirection.DECLINING
    else:
        trend = TrendDirection.STABLE

    logger.info(
        "Trend detection: low-km avg=€%.0f, high-km avg=€%.0f, premium=%.1f%% → %s",
        low_km_avg, high_km_avg, premium_pct, trend.value,
    )
    return trend


async def analyze_market(
    vehicle: ValuationInput,
    comparables: list[ComparableListing],
    condition_grade: str = "GOOD",
) -> MarketAnalysis:
    """Run full market analysis with real data-driven metrics.

    Args:
        vehicle: The vehicle being valued.
        comparables: List of comparable DE market listings.
        condition_grade: Condition assessment grade string.

    Returns:
        Complete MarketAnalysis object.
    """
    stats = calculate_price_statistics(comparables)

    if not stats:
        logger.warning("No comparables found — market analysis will be empty")
        return MarketAnalysis(data_source="none")

    # Real data-driven metrics
    count = len(comparables)
    if count >= 15:
        liquidity = MarketLiquidity.HIGH
    elif count >= 5:
        liquidity = MarketLiquidity.MEDIUM
    else:
        liquidity = MarketLiquidity.LOW

    dom = estimate_days_on_market(comparables)
    trend = detect_trend(comparables)

    # Use LLM for price adjustment analysis
    adjustments, estimated_price, confidence = await _llm_price_analysis(
        vehicle, comparables, stats, condition_grade
    )

    return MarketAnalysis(
        search_criteria={
            "make": vehicle.make,
            "model": vehicle.model,
            "year_range": f"{vehicle.year - 2}–{vehicle.year + 2}",
            "comparables_count": count,
        },
        total_comparables_found=count,
        price_statistics=stats,
        estimated_sale_price=estimated_price,
        price_adjustments=adjustments,
        days_on_market_avg=dom,
        market_liquidity=liquidity,
        trend_direction=trend,
        data_freshness=datetime.utcnow(),
        data_source="mobile.de + autoscout24.de",
    )


async def _llm_price_analysis(
    vehicle: ValuationInput,
    comparables: list[ComparableListing],
    stats: PriceStatistics,
    condition_grade: str,
) -> tuple[list[PriceAdjustment], Decimal, float]:
    """Use Claude to analyze price adjustments based on comparables."""
    prompt_template = load_prompt("price_analysis")

    comparables_data = [
        {
            "title": c.title,
            "price_eur": str(c.price_eur),
            "mileage_km": c.mileage_km,
            "year": c.year,
            "color": c.color,
            "url": c.url,
        }
        for c in comparables[:15]  # Limit to keep prompt manageable
    ]

    prompt = prompt_template.format(
        make=vehicle.make,
        model=vehicle.model,
        year=vehicle.year,
        mileage_km=vehicle.mileage_km,
        exterior_color=vehicle.exterior_color,
        interior_color=vehicle.interior_color or "Unknown",
        drive_side=vehicle.drive_side.value,
        service_history=vehicle.service_history.value,
        accident_history=vehicle.accident_history,
        condition_grade=condition_grade,
        notable_options=vehicle.specification_notes or "None specified",
        comparables_json=json.dumps(comparables_data, indent=2),
    )

    try:
        response = call_claude(prompt, model_tier="reasoning")
        data = json.loads(response)

        adjustments = [
            PriceAdjustment(
                factor=adj["factor"],
                adjustment_eur=Decimal(str(adj["adjustment_eur"])),
                reasoning=adj["reasoning"],
            )
            for adj in data.get("adjustments", [])
        ]

        estimated_price = Decimal(str(data.get("estimated_sale_price_eur", stats.median)))
        confidence = data.get("confidence", 0.6)

        return adjustments, estimated_price, confidence

    except (json.JSONDecodeError, KeyError) as e:
        logger.error("LLM price analysis failed: %s, falling back to median", e)
        return [], stats.median, 0.5
