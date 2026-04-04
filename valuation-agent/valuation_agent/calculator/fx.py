"""Exchange rate fetcher with caching."""

import logging
import time
from decimal import Decimal

import httpx

from valuation_agent.config import settings

logger = logging.getLogger(__name__)

# In-memory cache: (rate, timestamp)
_fx_cache: dict[str, tuple[Decimal, float]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


async def get_jpy_eur_rate() -> Decimal:
    """Fetch the current JPY/EUR exchange rate.

    Returns JPY per 1 EUR (e.g., 167.0 means ¥167 = €1).
    Falls back to a sensible default if API is unavailable.
    """
    cache_key = "JPY_EUR"

    # Check cache
    if cache_key in _fx_cache:
        rate, cached_at = _fx_cache[cache_key]
        if time.time() - cached_at < CACHE_TTL_SECONDS:
            logger.debug("Using cached FX rate: %.4f", rate)
            return rate

    # Try fetching live rate
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                settings.fx_api_url,
                params={
                    "access_key": settings.fx_api_key,
                    "base": "EUR",
                    "symbols": "JPY",
                },
            )
            response.raise_for_status()
            data = response.json()

            if data.get("success") and "rates" in data:
                rate = Decimal(str(data["rates"]["JPY"]))
                _fx_cache[cache_key] = (rate, time.time())
                logger.info("Fetched live FX rate: JPY/EUR = %.4f", rate)
                return rate

    except Exception as e:
        logger.warning("Failed to fetch live FX rate: %s", e)

    # Fallback default
    fallback = Decimal("167.0")
    logger.info("Using fallback FX rate: JPY/EUR = %.4f", fallback)
    return fallback
