"""All Pydantic models for Valuation Agent input, output, and internal objects."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────


class DriveSide(str, Enum):
    LHD = "LHD"
    RHD = "RHD"


class Transmission(str, Enum):
    MANUAL = "MANUAL"
    AUTOMATIC = "AUTOMATIC"
    DCT = "DCT"
    PDK = "PDK"
    SMG = "SMG"


class FuelType(str, Enum):
    PETROL = "PETROL"
    DIESEL = "DIESEL"
    HYBRID = "HYBRID"
    ELECTRIC = "ELECTRIC"


class ServiceHistory(str, Enum):
    FULL_DEALER = "FULL_DEALER"
    PARTIAL_DEALER = "PARTIAL_DEALER"
    INDEPENDENT = "INDEPENDENT"
    UNKNOWN = "UNKNOWN"


class ConditionGrade(str, Enum):
    EXCELLENT = "EXCELLENT"
    VERY_GOOD = "VERY_GOOD"
    GOOD = "GOOD"
    FAIR = "FAIR"
    POOR = "POOR"


class Verdict(str, Enum):
    BUY = "BUY"
    REVIEW = "REVIEW"
    PASS = "PASS"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MED = "MED"
    HIGH = "HIGH"


class MarketLiquidity(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class TrendDirection(str, Enum):
    RISING = "RISING"
    STABLE = "STABLE"
    DECLINING = "DECLINING"


SUPPORTED_MAKES = [
    "Ferrari",
    "Mercedes-AMG",
    "Porsche",
    "Jaguar",
    "Bentley",
    "Aston Martin",
    "Lamborghini",
    "Maserati",
    "BMW M",
    "Range Rover",
]


# ─── Input ───────────────────────────────────────────────────────────────────


class ValuationInput(BaseModel):
    """Everything the user provides when requesting a valuation."""

    make: str = Field(..., description="Brand name, must be one of SUPPORTED_MAKES")
    model: str = Field(..., description="Model name, e.g. 488 GTB")
    year: int = Field(..., ge=1990, le=2026)
    mileage_km: int = Field(..., ge=0)
    drive_side: DriveSide
    asking_price_jpy: int = Field(..., gt=0)
    exterior_color: str

    # Optional fields
    interior_color: Optional[str] = None
    transmission: Optional[Transmission] = None
    fuel_type: Optional[FuelType] = None
    specification_notes: Optional[str] = None
    service_history: ServiceHistory = ServiceHistory.UNKNOWN
    accident_history: bool = False
    auction_grade: Optional[float] = Field(None, ge=1.0, le=6.5)

    # File paths (populated after upload handling)
    photo_paths: list[str] = Field(default_factory=list)
    auction_sheet_path: Optional[str] = None
    additional_doc_paths: list[str] = Field(default_factory=list)


# ─── Output Sub-Objects (Section 3.2–3.8) ────────────────────────────────────


class NotableOption(BaseModel):
    option_name: str
    estimated_value_premium_eur: Decimal


class VehicleSummary(BaseModel):
    """Section 3.2 — echoes input + enriched data."""

    make: str
    model: str
    year: int
    mileage_km: int
    drive_side: DriveSide
    exterior_color: str
    interior_color: Optional[str] = None
    transmission: Optional[Transmission] = None
    fuel_type: Optional[FuelType] = None
    service_history: ServiceHistory
    accident_history: bool
    auction_grade: Optional[float] = None

    # Enriched fields
    model_full_name: str = ""
    engine_spec: str = ""
    original_msrp_eur: Optional[Decimal] = None
    production_years: str = ""
    notable_options: list[NotableOption] = Field(default_factory=list)


class ConditionAssessment(BaseModel):
    """Section 3.3 — AI analysis of photos and auction sheet."""

    overall_grade: ConditionGrade = ConditionGrade.GOOD
    overall_grade_numeric: float = Field(5.0, ge=1.0, le=10.0)
    exterior_score: float = Field(5.0, ge=1.0, le=10.0)
    exterior_notes: list[str] = Field(default_factory=list)
    interior_score: float = Field(5.0, ge=1.0, le=10.0)
    interior_notes: list[str] = Field(default_factory=list)
    mechanical_notes: list[str] = Field(default_factory=list)
    modification_notes: list[str] = Field(default_factory=list)
    auction_sheet_parsed: Optional[dict] = None
    photo_analysis_summary: str = ""
    condition_confidence: float = Field(0.5, ge=0.0, le=1.0)


class PriceAdjustment(BaseModel):
    factor: str
    adjustment_eur: Decimal
    reasoning: str


class PriceStatistics(BaseModel):
    mean: Decimal
    median: Decimal
    p25: Decimal
    p75: Decimal
    min: Decimal
    max: Decimal


class MarketAnalysis(BaseModel):
    """Section 3.4 — German market comparables and pricing."""

    search_criteria: dict = Field(default_factory=dict)
    total_comparables_found: int = 0
    price_statistics: Optional[PriceStatistics] = None
    estimated_sale_price: Decimal = Decimal("0")
    price_adjustments: list[PriceAdjustment] = Field(default_factory=list)
    days_on_market_avg: int = 0
    market_liquidity: MarketLiquidity = MarketLiquidity.MEDIUM
    trend_direction: TrendDirection = TrendDirection.STABLE
    data_freshness: Optional[datetime] = None
    data_source: str = ""


class ComparableListing(BaseModel):
    """A single comparable vehicle found on the DE market."""

    title: str
    price_eur: Decimal
    mileage_km: int
    year: int
    color: Optional[str] = None
    spec_summary: Optional[str] = None
    url: str
    dealer: Optional[str] = None
    listing_date: Optional[str] = None


class LandedCostBreakdown(BaseModel):
    """Section 3.5 — full cost breakdown JP → DE."""

    purchase_price_jpy: int
    fx_rate_used: Decimal
    fx_buffer_applied: Decimal
    purchase_price_eur: Decimal
    auction_fees_eur: Decimal
    jp_transport_eur: Decimal
    export_docs_eur: Decimal
    freight_eur: Decimal
    insurance_eur: Decimal
    cif_value_eur: Decimal
    customs_duty_eur: Decimal
    import_vat_eur: Decimal
    port_handling_eur: Decimal
    tuv_estimated_eur: Decimal
    registration_eur: Decimal
    de_transport_eur: Decimal
    detailing_eur: Decimal
    photography_eur: Decimal
    total_landed_cost_eur: Decimal
    total_cash_outlay_eur: Decimal
    reclaimable_vat_eur: Decimal


class MarginRange(BaseModel):
    pessimistic: Decimal
    base: Decimal
    optimistic: Decimal


class MarginAnalysis(BaseModel):
    """Section 3.6 — profitability calculation."""

    estimated_sale_price: Decimal
    total_landed_cost: Decimal
    gross_margin_eur: Decimal
    gross_margin_pct: Decimal
    margin_after_opex: Decimal
    capital_required: Decimal
    return_on_capital: Decimal
    estimated_hold_days: int = 0
    annualized_roi: Decimal = Decimal("0")
    margin_confidence: Decimal = Decimal("0")
    margin_range: Optional[MarginRange] = None


class RiskFactor(BaseModel):
    score: int = Field(1, ge=1, le=5)
    level: RiskLevel = RiskLevel.LOW


class RiskAssessment(BaseModel):
    """Section 3.7 — risk flags and scores."""

    condition_risk: RiskFactor = Field(default_factory=RiskFactor)
    provenance_risk: RiskFactor = Field(default_factory=RiskFactor)
    tuv_risk: RiskFactor = Field(default_factory=RiskFactor)
    market_risk: RiskFactor = Field(default_factory=RiskFactor)
    currency_risk: RiskFactor = Field(default_factory=RiskFactor)
    capital_risk: RiskFactor = Field(default_factory=RiskFactor)
    overall_risk_score: float = 1.0
    overall_risk_level: RiskLevel = RiskLevel.LOW


class Recommendation(BaseModel):
    """Section 3.8 — final verdict."""

    verdict: Verdict = Verdict.PASS
    verdict_reasoning: str = ""
    max_bid_jpy: Optional[int] = None
    max_bid_reasoning: str = ""
    key_concerns: list[str] = Field(default_factory=list)
    key_strengths: list[str] = Field(default_factory=list)
    action_items: list[str] = Field(default_factory=list)


# ─── Top-Level Report (Section 3.1) ─────────────────────────────────────────


class ValuationReport(BaseModel):
    """The complete output of a valuation run."""

    valuation_id: UUID = Field(default_factory=uuid4)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    vehicle_summary: VehicleSummary
    condition_assessment: ConditionAssessment
    market_analysis: MarketAnalysis
    landed_cost: LandedCostBreakdown
    margin_analysis: MarginAnalysis
    risk_assessment: RiskAssessment
    recommendation: Recommendation
    comparable_listings: list[ComparableListing] = Field(default_factory=list)
    reasoning: str = ""
    processing_time_seconds: float = 0.0
