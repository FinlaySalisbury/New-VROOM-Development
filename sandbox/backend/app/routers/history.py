"""
History Router — GET endpoints for test run history.
"""
import logging

from fastapi import APIRouter, HTTPException, Query
from app.models import TestRunSummary, HistoryDetailResponse
from app.database import get_test_runs, get_test_run_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=list[TestRunSummary])
async def list_test_runs(limit: int = 50, remix: bool = Query(False)):
    """List recent test runs, newest first. Use remix=true for remix history."""
    rows = await get_test_runs(limit=limit, remix_only=remix)
    return [TestRunSummary(**row) for row in rows]


@router.get("/history/{run_id}", response_model=HistoryDetailResponse)
async def get_test_run_detail(run_id: str):
    """Get full detail of a test run including scenario state for replay."""
    result = await get_test_run_by_id(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Test run not found")
    return HistoryDetailResponse(**result)
