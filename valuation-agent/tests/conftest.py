"""Shared test fixtures."""

import pytest
from decimal import Decimal

from valuation_agent.schemas import (
    ComparableListing,
    DriveSide,
    ServiceHistory,
    ValuationInput,
)


@pytest.fixture
def ferrari_488_input() -> ValuationInput:
    """High-margin test case: Ferrari 488 GTB → expected BUY."""
    return ValuationInput(
        make="Ferrari",
        model="488 GTB",
        year=2017,
        mileage_km=18000,
        drive_side=DriveSide.LHD,
        asking_price_jpy=16_500_000,
        exterior_color="Rosso Corsa",
        interior_color="Nero",
        service_history=ServiceHistory.FULL_DEALER,
        accident_history=False,
        auction_grade=4.5,
    )


@pytest.fixture
def amg_gt_input() -> ValuationInput:
    """Medium-margin test case: AMG GT R → expected REVIEW."""
    return ValuationInput(
        make="Mercedes-AMG",
        model="GT R",
        year=2019,
        mileage_km=25000,
        drive_side=DriveSide.LHD,
        asking_price_jpy=9_800_000,
        exterior_color="Selenite Grey",
        interior_color="Black Nappa",
        service_history=ServiceHistory.PARTIAL_DEALER,
        accident_history=False,
        auction_grade=4.0,
    )


@pytest.fixture
def porsche_911_input() -> ValuationInput:
    """Low-margin test case: Porsche 911 → expected PASS."""
    return ValuationInput(
        make="Porsche",
        model="911 Carrera S",
        year=2020,
        mileage_km=35000,
        drive_side=DriveSide.RHD,
        asking_price_jpy=14_000_000,
        exterior_color="Black",
        service_history=ServiceHistory.UNKNOWN,
        accident_history=True,
        auction_grade=3.5,
    )


@pytest.fixture
def sample_comparables() -> list[ComparableListing]:
    """Sample comparable listings for a Ferrari 488 on mobile.de."""
    return [
        ComparableListing(
            title="Ferrari 488 GTB 2017 LHD",
            price_eur=Decimal("165000"),
            mileage_km=15000,
            year=2017,
            color="Rosso Corsa",
            url="https://www.mobile.de/listing/1",
            dealer="Exotic Cars München",
        ),
        ComparableListing(
            title="Ferrari 488 GTB 2016",
            price_eur=Decimal("155000"),
            mileage_km=22000,
            year=2016,
            color="Nero",
            url="https://www.mobile.de/listing/2",
            dealer="AutoSport Berlin",
        ),
        ComparableListing(
            title="Ferrari 488 Spider 2018",
            price_eur=Decimal("185000"),
            mileage_km=12000,
            year=2018,
            color="Bianco Avus",
            url="https://www.mobile.de/listing/3",
            dealer="Ferrari Frankfurt",
        ),
        ComparableListing(
            title="Ferrari 488 GTB 2017",
            price_eur=Decimal("170000"),
            mileage_km=20000,
            year=2017,
            color="Grigio Silverstone",
            url="https://www.mobile.de/listing/4",
        ),
        ComparableListing(
            title="Ferrari 488 GTB 2015",
            price_eur=Decimal("148000"),
            mileage_km=30000,
            year=2015,
            color="Rosso Corsa",
            url="https://www.mobile.de/listing/5",
            dealer="Saker GmbH",
        ),
        ComparableListing(
            title="Ferrari 488 GTB 2018 LHD Full Options",
            price_eur=Decimal("192000"),
            mileage_km=8000,
            year=2018,
            color="Blu Pozzi",
            url="https://www.mobile.de/listing/6",
            dealer="Hollmann International",
        ),
    ]
