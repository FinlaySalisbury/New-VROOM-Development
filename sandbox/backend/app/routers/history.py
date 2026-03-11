"""
History Router — GET endpoints for test run history.
"""
import logging

from fastapi import APIRouter, HTTPException
from app.models import TestRunSummary, HistoryDetailResponse
from app.database import get_test_runs, get_test_run_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=list[TestRunSummary])
async def list_test_runs(limit: int = 50):
    """List recent test runs, newest first."""
    rows = await get_test_runs(limit=limit)
    return [TestRunSummary(**row) for row in rows]


@router.get("/history/{run_id}", response_model=HistoryDetailResponse)
async def get_test_run_detail(run_id: str):
    """Get full detail of a test run including scenario state for replay."""
    result = await get_test_run_by_id(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Test run not found")
    return HistoryDetailResponse(**result)
