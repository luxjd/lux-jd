"""Main orchestration pipeline — runs all valuation steps."""

import asyncio
import logging
import time

from valuation_agent.analyzer.market_analyzer import analyze_market
from valuation_agent.analyzer.photo_analyzer import analyze_photos
from valuation_agent.analyzer.risk_assessor import calculate_risk_assessment
from valuation_agent.analyzer.sheet_parser import parse_auction_sheet
from valuation_agent.calculator.fx import get_jpy_eur_rate
from valuation_agent.calculator.landed_cost import calculate_landed_cost
from valuation_agent.calculator.margin import calculate_margin
from valuation_agent.recommender.engine import generate_recommendation
from valuation_agent.schemas import (
    ConditionAssessment,
    ValuationInput,
    ValuationReport,
    VehicleSummary,
)
from valuation_agent.scraper.mobile_de import MobileDeScraper

logger = logging.getLogger(__name__)


async def run_valuation(input_data: ValuationInput) -> ValuationReport:
    """Execute the full valuation pipeline.

    Steps (per Section 4.1):
        1. Input validation & enrichment
        2. Photo & condition analysis  (parallel)
        3. Market research / scraping   (parallel)
        4. FX rate fetch                (parallel)
        5. Landed cost calculation
        6. Margin calculation
        7. Risk assessment
        8. Final recommendation
        9. Report assembly

    Steps 2, 3, 4 run concurrently via asyncio.gather().
    """
    start = time.perf_counter()
    logger.info(
        "Starting valuation: %s %s %d — ¥%s",
        input_data.make,
        input_data.model,
        input_data.year,
        f"{input_data.asking_price_jpy:,}",
    )

    # ── Step 1: Build vehicle summary ────────────────────────────────────
    vehicle_summary = VehicleSummary(
        make=input_data.make,
        model=input_data.model,
        year=input_data.year,
        mileage_km=input_data.mileage_km,
        drive_side=input_data.drive_side,
        exterior_color=input_data.exterior_color,
        interior_color=input_data.interior_color,
        transmission=input_data.transmission,
        fuel_type=input_data.fuel_type,
        service_history=input_data.service_history,
        accident_history=input_data.accident_history,
        auction_grade=input_data.auction_grade,
    )

    # ── Steps 2, 3, 4: Run in parallel ──────────────────────────────────
    scraper = MobileDeScraper()

    photo_task = analyze_photos(
        photo_paths=input_data.photo_paths,
        make=input_data.make,
        model=input_data.model,
        year=input_data.year,
    )

    scrape_task = scraper.search(
        make=input_data.make,
        model=input_data.model,
        year_from=input_data.year - 2,
        year_to=input_data.year + 2,
        lhd_only=(input_data.drive_side.value == "LHD"),
    )

    fx_task = get_jpy_eur_rate()

    # Parse auction sheet if provided
    sheet_task = (
        parse_auction_sheet(input_data.auction_sheet_path)
        if input_data.auction_sheet_path
        else asyncio.coroutine(lambda: None)()
    )

    condition, comparables, fx_rate, sheet_data = await asyncio.gather(
        photo_task, scrape_task, fx_task, sheet_task
    )

    # Merge auction sheet into condition if available
    if sheet_data and isinstance(sheet_data, dict) and "error" not in sheet_data:
        condition.auction_sheet_parsed = sheet_data
        if sheet_data.get("mechanical_notes"):
            condition.mechanical_notes = sheet_data["mechanical_notes"]

    # ── Step 3b: Market analysis with LLM adjustments ────────────────────
    market = await analyze_market(
        vehicle=input_data,
        comparables=comparables,
        condition_grade=condition.overall_grade.value,
    )

    # ── Step 5: Landed cost calculation ──────────────────────────────────
    landed_cost = calculate_landed_cost(
        purchase_price_jpy=input_data.asking_price_jpy,
        fx_rate=fx_rate,
        vehicle_value_eur=market.estimated_sale_price if market.estimated_sale_price else None,
    )

    # ── Step 6: Margin calculation ───────────────────────────────────────
    margin = calculate_margin(
        estimated_sale_price=market.estimated_sale_price,
        landed_cost=landed_cost,
        price_stats=market.price_statistics,
        condition_confidence=condition.condition_confidence,
    )

    # ── Step 7: Risk assessment ──────────────────────────────────────────
    risk = calculate_risk_assessment(
        vehicle=input_data,
        condition=condition,
        market=market,
        margin=margin,
    )

    # ── Step 8: Final recommendation ─────────────────────────────────────
    recommendation = await generate_recommendation(
        vehicle_summary=vehicle_summary,
        condition=condition,
        market=market,
        landed_cost=landed_cost,
        margin=margin,
        risk=risk,
    )

    # ── Step 9: Assemble report ──────────────────────────────────────────
    elapsed = time.perf_counter() - start

    report = ValuationReport(
        vehicle_summary=vehicle_summary,
        condition_assessment=condition,
        market_analysis=market,
        landed_cost=landed_cost,
        margin_analysis=margin,
        risk_assessment=risk,
        recommendation=recommendation,
        comparable_listings=comparables[:10],
        reasoning=recommendation.verdict_reasoning,
        processing_time_seconds=round(elapsed, 2),
    )

    logger.info(
        "Valuation complete in %.1fs — Verdict: %s | Margin: €%s (%.1f%%)",
        elapsed,
        recommendation.verdict.value,
        margin.gross_margin_eur,
        margin.gross_margin_pct,
    )

    return report
