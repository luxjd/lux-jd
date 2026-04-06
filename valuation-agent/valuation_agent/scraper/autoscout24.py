"""autoscout24.de Playwright scraper for cross-validation of German market prices."""

import asyncio
import logging
import random
import re
from decimal import Decimal

from valuation_agent.config import settings
from valuation_agent.schemas import ComparableListing
from valuation_agent.scraper.base import BaseScraper

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

# AutoScout24 uses URL-slug-based make/model mapping
MAKE_SLUGS = {
    "Ferrari": "ferrari",
    "Mercedes-AMG": "mercedes-benz",
    "Porsche": "porsche",
    "Jaguar": "jaguar",
    "Bentley": "bentley",
    "Aston Martin": "aston-martin",
    "Lamborghini": "lamborghini",
    "Maserati": "maserati",
    "BMW M": "bmw",
    "Range Rover": "land-rover",
}


class AutoScout24Scraper(BaseScraper):
    """Scrapes autoscout24.de for comparable luxury vehicle listings."""

    BASE_URL = "https://www.autoscout24.de"

    async def search(
        self,
        make: str,
        model: str,
        year_from: int,
        year_to: int,
        mileage_max: int | None = None,
        lhd_only: bool = True,
    ) -> list[ComparableListing]:
        """Search autoscout24.de for comparable vehicles using Playwright."""
        from playwright.async_api import async_playwright

        make_slug = MAKE_SLUGS.get(make, make.lower().replace(" ", "-"))
        model_slug = model.lower().replace(" ", "-")
        listings: list[ComparableListing] = []

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent=random.choice(USER_AGENTS),
                    locale="de-DE",
                )
                page = await context.new_page()

                # AutoScout24 URL structure: /lst/{make}/{model}?...
                params = [
                    f"fregfrom={year_from}",
                    f"fregto={year_to}",
                    "sort=standard",
                    "desc=0",
                    "damaged_listing=exclude",
                    "cy=D",  # Germany only
                ]
                if mileage_max:
                    params.append(f"kmto={mileage_max}")

                query = "&".join(params)

                logger.info(
                    "Scraping autoscout24.de: %s %s (%d–%d)",
                    make, model, year_from, year_to,
                )

                for page_num in range(1, settings.scrape_max_pages + 1):
                    page_param = f"&page={page_num}" if page_num > 1 else ""
                    url = f"{self.BASE_URL}/lst/{make_slug}/{model_slug}?{query}{page_param}"

                    await page.goto(url, wait_until="domcontentloaded")
                    await asyncio.sleep(
                        random.uniform(settings.scrape_delay_min, settings.scrape_delay_max)
                    )

                    # Handle cookie consent if it appears
                    try:
                        consent_btn = await page.query_selector(
                            '[data-testid="gdpr-consent-accept-all"], '
                            '#onetrust-accept-btn-handler'
                        )
                        if consent_btn:
                            await consent_btn.click()
                            await asyncio.sleep(1)
                    except Exception:
                        pass

                    # Extract listing articles
                    cards = await page.query_selector_all(
                        'article[data-testid="listing"], '
                        'div[class*="ListItem_wrapper"]'
                    )
                    if not cards:
                        # Try broader selector
                        cards = await page.query_selector_all("article")

                    if not cards:
                        logger.info("No results on page %d", page_num)
                        break

                    for card in cards:
                        try:
                            listing = await self._parse_card(card)
                            if listing:
                                listings.append(listing)
                        except Exception as e:
                            logger.debug("Failed to parse autoscout24 card: %s", e)
                            continue

                    logger.info(
                        "autoscout24 page %d: found %d cards (total: %d)",
                        page_num, len(cards), len(listings),
                    )

                await browser.close()

        except Exception as e:
            logger.error("AutoScout24 scraping failed: %s", e)

        return listings

    async def _parse_card(self, card) -> ComparableListing | None:
        """Extract listing data from an autoscout24 search result card."""
        # Title
        title_el = await card.query_selector("h2, a[data-testid='title-link']")
        if not title_el:
            return None
        title = (await title_el.inner_text()).strip()
        if not title:
            return None

        # Price
        price_el = await card.query_selector(
            "[data-testid='price'], span[class*='Price']"
        )
        if not price_el:
            return None
        price_text = (await price_el.inner_text()).strip()
        price_clean = re.sub(r"[^\d]", "", price_text)
        if not price_clean:
            return None
        try:
            price_eur = Decimal(price_clean)
        except Exception:
            return None

        # Skip unrealistic prices (< €5k or > €1M likely parsing errors)
        if price_eur < 5000 or price_eur > 1_000_000:
            return None

        # Link
        link_el = await card.query_selector("a[href*='/angebote/']")
        href = await link_el.get_attribute("href") if link_el else ""
        url = href if href.startswith("http") else f"{self.BASE_URL}{href}"

        # Vehicle details (mileage, year, etc.)
        details_text = ""
        details_els = await card.query_selector_all(
            "[data-testid='vehicle-details'] span, "
            "span[class*='VehicleDetailTable']"
        )
        for el in details_els:
            details_text += " " + (await el.inner_text()).strip()

        # Fallback: get all text from the card
        if not details_text.strip():
            details_text = (await card.inner_text()).strip()

        mileage_km = self._extract_mileage(details_text)
        year = self._extract_year(details_text)

        # Dealer
        dealer_el = await card.query_selector(
            "[data-testid='seller-name'], span[class*='SellerInfo']"
        )
        dealer = (await dealer_el.inner_text()).strip() if dealer_el else None

        return ComparableListing(
            title=title,
            price_eur=price_eur,
            mileage_km=mileage_km,
            year=year,
            url=url,
            dealer=dealer,
        )

    @staticmethod
    def _extract_mileage(text: str) -> int:
        """Extract mileage from text like '18.000 km' or '18000 km'."""
        match = re.search(r"([\d.]+)\s*km", text)
        if match:
            return int(match.group(1).replace(".", ""))
        return 0

    @staticmethod
    def _extract_year(text: str) -> int:
        """Extract a 4-digit year from text."""
        # Look for registration date patterns like "01/2017" or just "2017"
        match = re.search(r"(?:\d{2}/)(20\d{2})", text)
        if match:
            return int(match.group(1))
        match = re.search(r"\b(20[012]\d)\b", text)
        if match:
            return int(match.group(1))
        return 0
