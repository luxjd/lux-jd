"""CLI entry point for running valuations from the command line."""

import asyncio
import json
import logging
import sys
from pathlib import Path

import typer

from valuation_agent.pipeline import run_valuation
from valuation_agent.schemas import DriveSide, ServiceHistory, ValuationInput

app = typer.Typer(help="Valuation Agent CLI — Upload Vehicle → Get German Market Price")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@app.command()
def valuate(
    make: str = typer.Option(..., help="Brand name (e.g. Ferrari, Mercedes-AMG)"),
    model: str = typer.Option(..., help="Model name (e.g. 488 GTB)"),
    year: int = typer.Option(..., help="Model year"),
    mileage: int = typer.Option(..., help="Mileage in km"),
    drive_side: str = typer.Option("LHD", help="LHD or RHD"),
    price_jpy: int = typer.Option(..., help="Asking price in JPY"),
    color_ext: str = typer.Option(..., help="Exterior color"),
    color_int: str = typer.Option("", help="Interior color"),
    service_history: str = typer.Option("UNKNOWN", help="FULL_DEALER/PARTIAL_DEALER/INDEPENDENT/UNKNOWN"),
    accident: bool = typer.Option(False, help="Known accident history"),
    auction_grade: float = typer.Option(None, help="Auction grade 1.0–6.5"),
    spec_notes: str = typer.Option("", help="Specification notes"),
    photos: str = typer.Option("", help="Path to photos directory"),
    auction_sheet: str = typer.Option("", help="Path to auction sheet image"),
    output: str = typer.Option("", help="Output file path (default: stdout)"),
):
    """Run a full vehicle valuation."""
    # Collect photo paths
    photo_paths = []
    if photos:
        photos_dir = Path(photos)
        if photos_dir.is_dir():
            photo_paths = [
                str(p) for p in photos_dir.iterdir()
                if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")
            ]

    input_data = ValuationInput(
        make=make,
        model=model,
        year=year,
        mileage_km=mileage,
        drive_side=DriveSide(drive_side),
        asking_price_jpy=price_jpy,
        exterior_color=color_ext,
        interior_color=color_int or None,
        service_history=ServiceHistory(service_history),
        accident_history=accident,
        auction_grade=auction_grade,
        specification_notes=spec_notes or None,
        photo_paths=photo_paths,
        auction_sheet_path=auction_sheet or None,
    )

    report = asyncio.run(run_valuation(input_data))
    report_json = report.model_dump_json(indent=2)

    if output:
        Path(output).write_text(report_json, encoding="utf-8")
        typer.echo(f"Report saved to {output}")
    else:
        typer.echo(report_json)


@app.command()
def serve(
    host: str = typer.Option("0.0.0.0", help="Host to bind"),
    port: int = typer.Option(8000, help="Port to bind"),
):
    """Start the web UI server."""
    import uvicorn

    uvicorn.run("valuation_agent.main:app", host=host, port=port, reload=True)


if __name__ == "__main__":
    app()
