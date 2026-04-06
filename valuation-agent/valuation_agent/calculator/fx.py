"""Exchange rate fetcher using frankfurter.app (free, no API key needed).

Provides live JPY/EUR rates and 30-day historical data for volatility assessment.
"""

import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal

import httpx

from valuation_agent.config import settings

logger = logging.getLogger(__name__)

# In-memory caches
_rate_cache: dict[str, tuple[Decimal, float]] = {}
_history_cache: dict[str, tuple[list[Decimal], float]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


async def get_jpy_eur_rate() -> Decimal:
    """Fetch the current JPY/EUR exchange rate from frankfurter.app.

    Returns JPY per 1 EUR (e.g., 167.0 means ¥167 = €1).
    No API key required.
    """
    cache_key = "JPY_EUR"

    # Check cache
    if cache_key in _rate_cache:
        rate, cached_at = _rate_cache[cache_key]
        if time.time() - cached_at < CACHE_TTL_SECONDS:
            logger.debug("Using cached FX rate: %.4f", rate)
            return rate

    # Fetch live rate from frankfurter.app
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.frankfurter.app/latest",
                params={"from": "EUR", "to": "JPY"},
            )
            response.raise_for_status()
            data = response.json()

            if "rates" in data and "JPY" in data["rates"]:
                rate = Decimal(str(data["rates"]["JPY"]))
                _rate_cache[cache_key] = (rate, time.time())
                logger.info("Fetched live FX rate: JPY/EUR = %s (date: %s)", rate, data.get("date"))
                return rate

    except Exception as e:
        logger.error("Failed to fetch live FX rate from frankfurter.app: %s", e)

    # Check if we have a stale cached rate (better than hardcoded)
    if cache_key in _rate_cache:
        stale_rate, _ = _rate_cache[cache_key]
        logger.warning("Using stale cached FX rate: %s", stale_rate)
        return stale_rate

    # Last resort — this should rarely happen
    logger.error("No FX rate available. Using emergency fallback. VALUES MAY BE INACCURATE.")
    return Decimal("162.0")


async def get_jpy_eur_history(days: int = 30) -> list[Decimal]:
    """Fetch historical JPY/EUR rates for volatility calculation.

    Args:
        days: Number of days of history to fetch (default 30).

    Returns:
        List of daily JPY/EUR rates, oldest first.
    """
    cache_key = f"JPY_EUR_HISTORY_{days}"

    if cache_key in _history_cache:
        rates, cached_at = _history_cache[cache_key]
        if time.time() - cached_at < CACHE_TTL_SECONDS:
            return rates

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"https://api.frankfurter.app/{start_date}..{end_date}",
                params={"from": "EUR", "to": "JPY"},
            )
            response.raise_for_status()
            data = response.json()

            if "rates" in data:
                rates = [
                    Decimal(str(day_rates["JPY"]))
                    for date_str, day_rates in sorted(data["rates"].items())
                    if "JPY" in day_rates
                ]
                _history_cache[cache_key] = (rates, time.time())
                logger.info("Fetched %d days of FX history (%s to %s)", len(rates), start_date, end_date)
                return rates

    except Exception as e:
        logger.error("Failed to fetch FX history: %s", e)

    return []


async def calculate_fx_volatility(days: int = 30) -> float:
    """Calculate the standard deviation of daily JPY/EUR rate changes.

    Returns:
        Volatility as a percentage (e.g., 2.5 means 2.5% std dev).
        Returns -1.0 if insufficient data.
    """
    rates = await get_jpy_eur_history(days)
    if len(rates) < 5:
        return -1.0

    # Calculate daily percentage changes
    changes = []
    for i in range(1, len(rates)):
        pct_change = float((rates[i] - rates[i - 1]) / rates[i - 1] * 100)
        changes.append(pct_change)

    if not changes:
        return -1.0

    mean = sum(changes) / len(changes)
    variance = sum((x - mean) ** 2 for x in changes) / len(changes)
    std_dev = variance**0.5

    logger.info(
        "FX volatility (30d): std_dev=%.4f%%, mean_daily_change=%.4f%%, "
        "rate_range=%.2f–%.2f",
        std_dev,
        mean,
        float(min(rates)),
        float(max(rates)),
    )
    return round(std_dev, 4)
