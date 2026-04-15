from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db

router = APIRouter()


@router.post("/trigger")
def trigger_pipeline(force: bool = False, db: Session = Depends(get_db)):
    """Kick off weekly data collection from all sources."""
    from services.data_aggregator import run_pipeline
    result = run_pipeline(db, force=force)
    return result
