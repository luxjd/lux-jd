"""SQLAlchemy models for valuation storage."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from valuation_agent.config import settings


class Base(DeclarativeBase):
    pass


class ValuationRecord(Base):
    """Stores completed valuations for historical reference and accuracy tracking."""

    __tablename__ = "valuations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    make = Column(String(50), nullable=False, index=True)
    model = Column(String(100), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    mileage_km = Column(Integer)
    asking_price_jpy = Column(Integer)
    estimated_sale_price_eur = Column(Float)
    total_landed_cost_eur = Column(Float)
    gross_margin_eur = Column(Float)
    gross_margin_pct = Column(Float)
    verdict = Column(String(10))
    max_bid_jpy = Column(Integer, nullable=True)
    confidence = Column(Float)
    report_json = Column(Text)  # Full ValuationReport as JSON
    created_at = Column(DateTime, default=datetime.utcnow)


engine = create_engine(settings.database_url, echo=False)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)
