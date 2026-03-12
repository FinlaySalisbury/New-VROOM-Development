"""
Pydantic Models — Request/Response schemas for the Simulation Sandbox API.
"""
from pydantic import BaseModel, Field
from typing import Optional, Any
from enum import Enum


class RoutingStrategy(str, Enum):
    NAIVE = "naive"
    INHOUSE = "inhouse"
    TOMTOM_PREMIUM = "tomtom_premium"


class SimulationRequest(BaseModel):
    """Request body for POST /api/simulate."""
    num_engineers: int = Field(ge=1, le=50, default=5)
    num_jobs: int = Field(ge=1, le=500, default=20)
    strategy: RoutingStrategy = RoutingStrategy.INHOUSE
    name: Optional[str] = None
    # Optional: replay a previous scenario exactly
    replay_scenario: Optional[dict[str, Any]] = None


class RemixRequest(BaseModel):
    """Request body for POST /api/remix."""
    parent_run_id: str
    strategy: RoutingStrategy


class CostEstimate(BaseModel):
    """Real-time cost estimate for TomTom Premium strategy."""
    total_waypoints: int
    matrix_elements: int
    estimated_cost_eur: float
    cost_per_element: float = 0.00042


class TestRunSummary(BaseModel):
    """Summary of a completed test run for the history panel."""
    id: str
    test_number: Optional[int] = None
    created_at: str
    name: Optional[str] = None
    strategy: str
    num_engineers: int
    num_jobs: int
    total_duration_s: Optional[int] = None
    total_distance_m: Optional[int] = None
    unassigned_jobs: Optional[int] = None
    api_cost_estimate: Optional[float] = None
    is_remix: Optional[int] = 0
    parent_run_id: Optional[str] = None


class SimulationResponse(BaseModel):
    """Response body for POST /api/simulate and /api/remix."""
    id: str
    test_number: int
    strategy: str
    num_engineers: int
    num_jobs: int
    trips_geojson: dict[str, Any]
    faults_geojson: dict[str, Any]
    routes_geojson: dict[str, Any]
    combined_geojson: Optional[dict[str, Any]] = None
    routes_data: Optional[list[dict[str, Any]]] = None
    vroom_summary: Optional[dict[str, Any]] = None
    cost_estimate: Optional[CostEstimate] = None
    scenario_state: dict[str, Any]
    is_remix: bool = False
    parent_run_id: Optional[str] = None


class HistoryDetailResponse(BaseModel):
    """Full detail of a historical test run including scenario state for replay."""
    id: str
    test_number: Optional[int] = None
    created_at: str
    name: Optional[str] = None
    strategy: str
    num_engineers: int
    num_jobs: int
    scenario_state: dict[str, Any]
    routes_data: Optional[list[dict[str, Any]]] = None
    trips_geojson: dict[str, Any]
    faults_geojson: dict[str, Any]
    routes_geojson: dict[str, Any]
    combined_geojson: Optional[dict[str, Any]] = None
    vroom_solution: Optional[dict[str, Any]] = None
    total_duration_s: Optional[int] = None
    total_distance_m: Optional[int] = None
    unassigned_jobs: Optional[int] = None
    api_cost_estimate: Optional[float] = None
    is_remix: Optional[int] = 0
    parent_run_id: Optional[str] = None
