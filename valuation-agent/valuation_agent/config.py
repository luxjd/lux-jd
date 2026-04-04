"""Central configuration loaded from environment variables."""

from decimal import Decimal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Claude API ---
    anthropic_api_key: str = ""
    claude_model_reasoning: str = "claude-sonnet-4-20250514"
    claude_model_fast: str = "claude-haiku-4-5-20251001"

    # --- Database ---
    database_url: str = "sqlite:///./valuation_agent.db"

    # --- Exchange Rate ---
    fx_api_key: str = ""
    fx_api_url: str = "https://api.exchangeratesapi.io/v1/latest"

    # --- Valuation Thresholds ---
    min_margin_eur: int = 15_000
    min_margin_pct: int = 20
    currency_buffer_pct: Decimal = Decimal("3")

    # --- Scraping ---
    scrape_delay_min: float = 2.0
    scrape_delay_max: float = 4.0
    scrape_max_pages: int = 5

    # --- Cost Defaults (EUR) ---
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

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
