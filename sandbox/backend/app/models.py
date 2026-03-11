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


class CostEstimate(BaseModel):
    """Real-time cost estimate for TomTom Premium strategy."""
    total_waypoints: int
    matrix_elements: int
    estimated_cost_eur: float
    cost_per_element: float = 0.00042


class TestRunSummary(BaseModel):
    """Summary of a completed test run for the history panel."""
    id: str
    created_at: str
    name: Optional[str]
    strategy: str
    num_engineers: int
    num_jobs: int
    total_duration_s: Optional[int]
    total_distance_m: Optional[int]
    unassigned_jobs: Optional[int]
    api_cost_estimate: Optional[float]


class SimulationResponse(BaseModel):
    """Response body for POST /api/simulate."""
    id: str
    strategy: str
    num_engineers: int
    num_jobs: int
    trips_geojson: dict[str, Any]
    faults_geojson: dict[str, Any]
    routes_geojson: dict[str, Any]
    vroom_summary: Optional[dict[str, Any]] = None
    cost_estimate: Optional[CostEstimate] = None
    scenario_state: dict[str, Any]


class HistoryDetailResponse(BaseModel):
    """Full detail of a historical test run including scenario state for replay."""
    id: str
    created_at: str
    name: Optional[str]
    strategy: str
    num_engineers: int
    num_jobs: int
    scenario_state: dict[str, Any]
    trips_geojson: dict[str, Any]
    faults_geojson: dict[str, Any]
    routes_geojson: dict[str, Any]
    vroom_summary: Optional[dict[str, Any]] = None
    total_duration_s: Optional[int]
    total_distance_m: Optional[int]
    unassigned_jobs: Optional[int]
    api_cost_estimate: Optional[float]
