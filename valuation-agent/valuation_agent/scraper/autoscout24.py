"""autoscout24.de scraper — same interface as mobile_de, for cross-validation."""

import logging

from valuation_agent.schemas import ComparableListing
from valuation_agent.scraper.base import BaseScraper

logger = logging.getLogger(__name__)


class AutoScout24Scraper(BaseScraper):
    """Scrapes autoscout24.de for comparable luxury vehicle listings.

    TODO: Implement Playwright-based scraping similar to MobileDeScraper.
    """

    BASE_URL = "https://www.autoscout24.de/lst"

    async def search(
        self,
        make: str,
        model: str,
        year_from: int,
        year_to: int,
        mileage_max: int | None = None,
        lhd_only: bool = True,
    ) -> list[ComparableListing]:
        logger.warning("AutoScout24 scraper not yet implemented, returning empty list")
        return []
