"""Central configuration loaded from environment variables."""

import logging
import sys
from decimal import Decimal
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Look for .env.local in the parent project root first, then local .env
_project_root = Path(__file__).resolve().parent.parent.parent  # lux-jd/lux-jd/
_env_local = _project_root / ".env.local"
_env_file = str(_env_local) if _env_local.exists() else ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- OpenRouter API (primary LLM provider) ---
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model_vision: str = "anthropic/claude-sonnet-4"
    openrouter_model_reasoning: str = "anthropic/claude-sonnet-4"
    openrouter_model_fast: str = "anthropic/claude-haiku-4.5"

    # --- Database ---
    database_url: str = "sqlite:///./valuation_agent.db"

    # --- Exchange Rate (frankfurter.app — free, no key needed) ---
    fx_api_url: str = "https://api.frankfurter.app/latest"

    # --- Valuation Thresholds ---
    min_margin_eur: int = 15_000
    min_margin_pct: int = 20
    currency_buffer_pct: Decimal = Decimal("3")

    # --- Scraping ---
    scrape_delay_min: float = 2.0
    scrape_delay_max: float = 4.0
    scrape_max_pages: int = 5

    # --- Cost Defaults (EUR) — configurable via .env ---
    auction_fee_pct: Decimal = Decimal("0.04")
    jp_transport_eur: Decimal = Decimal("400")
    export_docs_eur: Decimal = Decimal("175")
    freight_container_eur: Decimal = Decimal("2800")
    freight_roro_eur: Decimal = Decimal("1800")
    insurance_pct: Decimal = Decimal("0.02")
    customs_duty_pct: Decimal = Decimal("0.10")
    import_vat_pct: Decimal = Decimal("0.19")
    port_handling_eur: Decimal = Decimal("600")
    tuv_cost_low_eur: Decimal = Decimal("400")
    tuv_cost_medium_eur: Decimal = Decimal("800")
    tuv_cost_high_eur: Decimal = Decimal("1500")
    registration_eur: Decimal = Decimal("150")
    de_transport_eur: Decimal = Decimal("450")
    detailing_eur: Decimal = Decimal("1200")
    photography_eur: Decimal = Decimal("500")
    opex_default_eur: Decimal = Decimal("500")
    estimated_hold_days: int = 70

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000

    def validate_required(self) -> list[str]:
        """Check that critical API keys are present. Returns list of errors."""
        errors = []
        if not self.openrouter_api_key:
            errors.append(
                "OPENROUTER_API_KEY is missing. "
                "Get one at https://openrouter.ai/keys and add to .env.local"
            )
        return errors


settings = Settings()
