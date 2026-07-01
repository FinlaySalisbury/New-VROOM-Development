"""
Database — Supabase connection manager and CRUD operations.
"""
import os
import json
import logging
from typing import Optional, Any
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from supabase import create_client, Client

from app.config import get_settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

def get_supabase_client(credentials: HTTPAuthorizationCredentials = Security(security)) -> Client:
    """
    FastAPI dependency that extracts the JWT, validates it,
    and returns a Supabase client authenticated as that user.
    """
    settings = get_settings()
    token = credentials.credentials

    # We do a basic unverified decode to check expiration early.
    # The actual signature verification is enforced by the Supabase backend.
    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
            audience="authenticated"
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Initialize Supabase client
    supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    
    # Set the auth header so requests run under the user's RLS policies
    supabase.options.headers["Authorization"] = f"Bearer {token}"
    
    return supabase

async def get_next_test_number(supabase: Client, project_id: str) -> int:
    """Get the next test number for a given project."""
    # Supabase doesn't have a direct max() without RPC. We can order by test_number desc limit 1.
    res = supabase.table("test_runs").select("test_number").eq("project_id", project_id).order("test_number", desc=True).limit(1).execute()
    if res.data and len(res.data) > 0:
        return (res.data[0].get("test_number") or 0) + 1
    return 1

async def save_test_run(
    supabase: Client,
    project_id: str,
    run_id: str,
    test_number: int,
    name: Optional[str],
    strategy: str,
    num_engineers: int,
    num_jobs: int,
    scenario_state: dict,
    vroom_solution: Optional[dict],
    routes_data: Optional[list],
    trips_geojson: dict[str, Any],
    faults_geojson: dict[str, Any],
    routes_geojson: dict[str, Any],
    combined_geojson: dict[str, Any],
    total_duration_s: Optional[int],
    total_distance_m: Optional[int],
    unassigned_jobs: Optional[int],
    api_cost_estimate: Optional[float],
    dispatch_ledger: Optional[dict] = None,
    is_remix: bool = False,
    parent_run_id: Optional[str] = None,
):
    """Persist a completed test run to Supabase."""
    data = {
        "id": run_id,
        "project_id": project_id,
        "test_number": test_number,
        "name": name,
        "strategy": strategy,
        "num_engineers": num_engineers,
        "num_jobs": num_jobs,
        "scenario_state": scenario_state,
        "vroom_solution": vroom_solution,
        "routes_data": routes_data,
        "total_duration_s": total_duration_s,
        "total_distance_m": total_distance_m,
        "unassigned_jobs": unassigned_jobs,
        "api_cost_estimate": api_cost_estimate,
        "dispatch_ledger": dispatch_ledger,
        "is_remix": is_remix,
        "parent_run_id": parent_run_id,
    }
    res = supabase.table("test_runs").insert(data).execute()
    logger.info(f"Saved test run #{test_number} ({run_id}) to Supabase")

async def get_test_runs(supabase: Client, project_id: str, limit: int = 50, remix_only: bool = False):
    """Retrieve recent test run summaries, newest first."""
    query = supabase.table("test_runs").select(
        "id, test_number, created_at, name, strategy, num_engineers, num_jobs, total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate, is_remix, parent_run_id"
    ).eq("project_id", project_id)
    
    if remix_only:
        query = query.eq("is_remix", True)
    else:
        query = query.eq("is_remix", False)

    res = query.order("created_at", desc=True).limit(limit).execute()
    return res.data

async def get_test_run_by_id(supabase: Client, project_id: str, run_id: str):
    """Retrieve a single test run with full scenario state for replay."""
    res = supabase.table("test_runs").select("*").eq("project_id", project_id).eq("id", run_id).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None

async def delete_test_run_by_id(supabase: Client, project_id: str, run_id: str):
    """Delete a specific test run."""
    supabase.table("test_runs").delete().eq("project_id", project_id).eq("id", run_id).execute()
