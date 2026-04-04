"""Abstract scraper interface for market data sources."""

from abc import ABC, abstractmethod

from valuation_agent.schemas import ComparableListing


class BaseScraper(ABC):
    """Base interface for all market scrapers."""

    @abstractmethod
    async def search(
        self,
        make: str,
        model: str,
        year_from: int,
        year_to: int,
        mileage_max: int | None = None,
        lhd_only: bool = True,
    ) -> list[ComparableListing]:
        """Search for comparable listings.

        Args:
            make: Vehicle brand.
            model: Vehicle model.
            year_from: Start of year range.
            year_to: End of year range.
            mileage_max: Maximum mileage filter.
            lhd_only: Only return LHD vehicles.

        Returns:
            List of comparable listings found.
        """
        ...
