"""Database session helpers."""

from contextlib import contextmanager

from valuation_agent.db.models import SessionLocal


@contextmanager
def get_db():
    """Yield a database session, auto-closing on exit."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
