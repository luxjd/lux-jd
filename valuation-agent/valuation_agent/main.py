"""FastAPI app entry point — Web UI and API."""

import logging
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from valuation_agent.config import settings
from valuation_agent.db.models import init_db
from valuation_agent.pipeline import run_valuation
from valuation_agent.schemas import DriveSide, ServiceHistory, ValuationInput

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Valuation Agent",
    description="Upload Vehicle → Get German Market Price",
    version="1.0.0",
)

# Static files & templates
WEB_DIR = Path(__file__).parent / "web"
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
templates = Jinja2Templates(directory=WEB_DIR / "templates")

# Upload directory
UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
async def startup():
    # Validate API keys
    errors = settings.validate_required()
    if errors:
        for err in errors:
            logger.error("CONFIG ERROR: %s", err)
        logger.error(
            "The valuation agent will NOT work correctly without required API keys. "
            "LLM-powered features (photo analysis, price adjustments, recommendations) "
            "will fail. Cost calculator and FX rate fetching will still work."
        )
    else:
        logger.info("All required API keys present")

    init_db()
    logger.info(
        "Valuation Agent started | LLM: %s | FX: frankfurter.app | DB: %s",
        settings.openrouter_model_reasoning,
        "PostgreSQL" if "postgresql" in settings.database_url else "SQLite",
    )


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the upload form."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/v1/valuate")
async def valuate(
    make: str = Form(...),
    model: str = Form(...),
    year: int = Form(...),
    mileage_km: int = Form(...),
    drive_side: str = Form(...),
    asking_price_jpy: int = Form(...),
    exterior_color: str = Form(...),
    interior_color: str = Form(""),
    service_history: str = Form("UNKNOWN"),
    accident_history: bool = Form(False),
    auction_grade: float | None = Form(None),
    specification_notes: str = Form(""),
    photos: list[UploadFile] = File(default=[]),
    auction_sheet: UploadFile | None = File(default=None),
):
    """Run a full valuation and return the report as JSON."""
    # Save uploaded files
    request_id = str(uuid.uuid4())[:8]
    upload_path = UPLOAD_DIR / request_id
    upload_path.mkdir(parents=True, exist_ok=True)

    photo_paths = []
    for photo in photos:
        if photo.filename:
            fpath = upload_path / photo.filename
            fpath.write_bytes(await photo.read())
            photo_paths.append(str(fpath))

    sheet_path = None
    if auction_sheet and auction_sheet.filename:
        sheet_fpath = upload_path / auction_sheet.filename
        sheet_fpath.write_bytes(await auction_sheet.read())
        sheet_path = str(sheet_fpath)

    # Build input
    input_data = ValuationInput(
        make=make,
        model=model,
        year=year,
        mileage_km=mileage_km,
        drive_side=DriveSide(drive_side),
        asking_price_jpy=asking_price_jpy,
        exterior_color=exterior_color,
        interior_color=interior_color or None,
        service_history=ServiceHistory(service_history),
        accident_history=accident_history,
        auction_grade=auction_grade,
        specification_notes=specification_notes or None,
        photo_paths=photo_paths,
        auction_sheet_path=sheet_path,
    )

    # Run pipeline
    report = await run_valuation(input_data)

    # Store in DB
    try:
        from valuation_agent.db.models import ValuationRecord
        from valuation_agent.db.session import get_db

        with get_db() as db:
            record = ValuationRecord(
                id=str(report.valuation_id),
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                asking_price_jpy=asking_price_jpy,
                estimated_sale_price_eur=float(report.margin_analysis.estimated_sale_price),
                total_landed_cost_eur=float(report.landed_cost.total_landed_cost_eur),
                gross_margin_eur=float(report.margin_analysis.gross_margin_eur),
                gross_margin_pct=float(report.margin_analysis.gross_margin_pct),
                verdict=report.recommendation.verdict.value,
                max_bid_jpy=report.recommendation.max_bid_jpy,
                confidence=float(report.margin_analysis.margin_confidence),
                report_json=report.model_dump_json(),
            )
            db.add(record)
    except Exception as e:
        logger.error("Failed to store valuation: %s", e)

    return JSONResponse(content=report.model_dump(mode="json"))


@app.get("/health")
async def health():
    """Health check with dependency status."""
    errors = settings.validate_required()
    return {
        "status": "ok" if not errors else "degraded",
        "llm_provider": "openrouter",
        "llm_model": settings.openrouter_model_reasoning,
        "fx_source": "frankfurter.app (free, no key)",
        "scrapers": ["mobile.de (Playwright)", "autoscout24.de (Playwright)"],
        "database": "PostgreSQL" if "postgresql" in settings.database_url else "SQLite",
        "config_errors": errors,
    }
