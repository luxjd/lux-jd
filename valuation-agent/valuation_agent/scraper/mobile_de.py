"""mobile.de Playwright scraper for German market comparables."""

import asyncio
import logging
import random
from decimal import Decimal

from valuation_agent.config import settings
from valuation_agent.schemas import ComparableListing
from valuation_agent.scraper.base import BaseScraper

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
]


class MobileDeScraper(BaseScraper):
    """Scrapes mobile.de for comparable luxury vehicle listings."""

    BASE_URL = "https://suchen.mobile.de/fahrzeuge/search.html"

    async def search(
        self,
        make: str,
        model: str,
        year_from: int,
        year_to: int,
        mileage_max: int | None = None,
        lhd_only: bool = True,
    ) -> list[ComparableListing]:
        """Search mobile.de for comparable vehicles using Playwright."""
        from playwright.async_api import async_playwright

        listings: list[ComparableListing] = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent=random.choice(USER_AGENTS),
                    locale="de-DE",
                )
                page = await context.new_page()

                # Build search URL with query params
                params = {
                    "dam": "false",  # not damaged
                    "isSearchRequest": "true",
                    "ms": f"{make};{model};;;",
                    "fr": f"{year_from}:{year_to}",
                    "s": "Car",
                    "vc": "Car",
                }
                if mileage_max:
                    params["ml"] = f":{mileage_max}"

                query = "&".join(f"{k}={v}" for k, v in params.items())
                url = f"{self.BASE_URL}?{query}"

                logger.info("Scraping mobile.de: %s %s (%d–%d)", make, model, year_from, year_to)

                for page_num in range(1, settings.scrape_max_pages + 1):
                    page_url = f"{url}&pageNumber={page_num}" if page_num > 1 else url

                    await page.goto(page_url, wait_until="domcontentloaded")
                    await asyncio.sleep(
                        random.uniform(settings.scrape_delay_min, settings.scrape_delay_max)
                    )

                    # Extract listing cards
                    cards = await page.query_selector_all('[data-testid="result-listing"]')
                    if not cards:
                        logger.info("No more results at page %d", page_num)
                        break

                    for card in cards:
                        try:
                            listing = await self._parse_card(card)
                            if listing:
                                listings.append(listing)
                        except Exception as e:
                            logger.debug("Failed to parse listing card: %s", e)
                            continue

                    logger.info(
                        "Page %d: found %d listings (total: %d)",
                        page_num,
                        len(cards),
                        len(listings),
                    )

                await browser.close()

        except Exception as e:
            logger.error("Scraping failed: %s", e)

        return listings

    async def _parse_card(self, card) -> ComparableListing | None:
        """Extract listing data from a search result card element."""
        title_el = await card.query_selector("h2, [data-testid='result-listing-title']")
        price_el = await card.query_selector("[data-testid='price-label'], .price-block")
        link_el = await card.query_selector("a[href*='/fahrzeuge/']")

        if not title_el or not price_el:
            return None

        title = (await title_el.inner_text()).strip()
        price_text = (await price_el.inner_text()).strip()
        url = await link_el.get_attribute("href") if link_el else ""

        # Parse price: "€ 165.000" or "165.000 €"
        price_clean = price_text.replace("€", "").replace(".", "").replace(",", ".").strip()
        try:
            price_eur = Decimal(price_clean)
        except Exception:
            return None

        # Extract mileage and year from attributes text
        attrs_el = await card.query_selector(
            "[data-testid='result-listing-attributes'], .vehicle-data"
        )
        attrs_text = (await attrs_el.inner_text()).strip() if attrs_el else ""

        mileage_km = self._extract_mileage(attrs_text)
        year = self._extract_year(attrs_text)

        # Dealer info
        dealer_el = await card.query_selector(
            "[data-testid='seller-info'], .seller-info"
        )
        dealer = (await dealer_el.inner_text()).strip() if dealer_el else None

        return ComparableListing(
            title=title,
            price_eur=price_eur,
            mileage_km=mileage_km,
            year=year,
            url=url if url.startswith("http") else f"https://www.mobile.de{url}",
            dealer=dealer,
        )

    @staticmethod
    def _extract_mileage(text: str) -> int:
        """Extract mileage from attribute text like '18.000 km'."""
        import re

        match = re.search(r"([\d.]+)\s*km", text.replace(".", ""))
        return int(match.group(1)) if match else 0

    @staticmethod
    def _extract_year(text: str) -> int:
        """Extract year from attribute text."""
        import re

        match = re.search(r"((?:19|20)\d{2})", text)
        return int(match.group(1)) if match else 0
