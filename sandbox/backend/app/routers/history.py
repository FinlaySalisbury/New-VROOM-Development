"""
History Router — GET endpoints for test run history.
"""
import logging

from fastapi import APIRouter, HTTPException, Query, Depends
from app.models import TestRunSummary, HistoryDetailResponse
from app.database import get_test_runs, get_test_run_by_id, get_supabase_client
from supabase import Client
from app.services.foursquare_formatter import compile_all

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history", response_model=list[TestRunSummary])
async def list_test_runs(project_id: str, limit: int = 50, remix: bool = Query(False), supabase: Client = Depends(get_supabase_client)):
    """List recent test runs, newest first. Use remix=true for remix history."""
    rows = await get_test_runs(supabase, project_id, limit=limit, remix_only=remix)
    return [TestRunSummary(**row) for row in rows]


@router.get("/history/{run_id}", response_model=HistoryDetailResponse)
async def get_test_run_detail(project_id: str, run_id: str, supabase: Client = Depends(get_supabase_client)):
    """Get full detail of a test run including scenario state for replay."""
    result = await get_test_run_by_id(supabase, project_id, run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Test run not found")
        
    # Dynamically regenerate the GeoJSON strings from route matrices to save local storage
    if result.get("routes_data") and result.get("scenario_state"):
        try:
            scenario = result["scenario_state"]
            vehicles = scenario.get("vehicles", [])
            jobs = scenario.get("jobs", [])
            vroom_solution = result.get("vroom_solution", {})
            
            outputs = compile_all(
                routes_data=result["routes_data"],
                vehicles=vehicles,
                jobs=jobs,
                vroom_solution=vroom_solution
            )
            
            result["trips_geojson"] = outputs["trips_geojson"]
            result["faults_geojson"] = outputs["faults_geojson"]
            result["routes_geojson"] = outputs["routes_geojson"]
            result["combined_geojson"] = outputs["combined_geojson"]
        except Exception as e:
            logger.exception(f"Failed to dynamically compile GeoJSONs for history {run_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to compile history visualisations")

    return HistoryDetailResponse(**result)
