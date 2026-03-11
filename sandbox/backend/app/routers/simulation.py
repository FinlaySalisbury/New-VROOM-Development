"""
Simulation Router — POST /api/simulate endpoint.

Orchestrates the full pipeline: data generation → matrix → VROOM → formatting → persist.
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from app.models import SimulationRequest, SimulationResponse, CostEstimate
from app.config import get_settings
from app.database import save_test_run
from app.services.data_generator import generate_scenario
from app.services.execution_pipeline import run_simulation
from app.services.foursquare_formatter import compile_all

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["simulation"])


@router.post("/simulate", response_model=SimulationResponse)
async def run_test(request: SimulationRequest):
    """
    Execute a simulation test run.
    
    1. Generate or replay scenario data
    2. Compute matrix using selected strategy
    3. Solve with VROOM
    4. Compile Foursquare output
    5. Persist to history
    """
    settings = get_settings()
    run_id = str(uuid.uuid4())

    # Shift start: today at 07:00 UTC
    now = datetime.now(timezone.utc)
    shift_start = int(now.replace(hour=7, minute=0, second=0, microsecond=0).timestamp())

    try:
        # Step 1: Generate or replay scenario
        if request.replay_scenario:
            scenario = request.replay_scenario
            logger.info(f"Replaying scenario with strategy={request.strategy.value}")
        else:
            scenario = generate_scenario(
                num_engineers=request.num_engineers,
                num_jobs=request.num_jobs,
                shift_start_unix=shift_start,
            )
            logger.info(f"Generated scenario: {request.num_engineers} engineers, {request.num_jobs} jobs")

        vehicles = scenario["vehicles"]
        jobs = scenario["jobs"]
        locations = scenario["locations"]

        # Step 2-4: Run pipeline
        result = run_simulation(
            vehicles=vehicles,
            jobs=jobs,
            locations=locations,
            strategy=request.strategy.value,
            shift_start=scenario.get("shift_start", shift_start),
            api_key=settings.TOMTOM_API_KEY,
            vroom_endpoint=settings.VROOM_ENDPOINT,
        )

        # Step 5: Compile Foursquare outputs
        outputs = compile_all(
            routes_data=result["routes_data"],
            vehicles=vehicles,
            jobs=jobs,
            vroom_solution=result["vroom_solution"],
        )

        # Cost estimate (only meaningful for TomTom Premium)
        cost_estimate = None
        if request.strategy.value == "tomtom_premium":
            n = len(locations)
            matrix_elements = n * n
            cost_estimate = CostEstimate(
                total_waypoints=n,
                matrix_elements=matrix_elements,
                estimated_cost_eur=round(matrix_elements * 0.00042, 2),
            )

        # Metrics from VROOM
        summary = result.get("vroom_summary", {})
        total_duration = summary.get("duration", 0)
        total_distance = summary.get("distance", 0)
        unassigned_count = summary.get("unassigned", 0)

        # Persist
        await save_test_run(
            run_id=run_id,
            name=request.name,
            strategy=request.strategy.value,
            num_engineers=request.num_engineers,
            num_jobs=request.num_jobs,
            scenario_state=scenario,
            vroom_solution=result["vroom_solution"],
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            total_duration_s=total_duration,
            total_distance_m=total_distance,
            unassigned_jobs=unassigned_count,
            api_cost_estimate=cost_estimate.estimated_cost_eur if cost_estimate else None,
        )

        return SimulationResponse(
            id=run_id,
            strategy=request.strategy.value,
            num_engineers=request.num_engineers,
            num_jobs=request.num_jobs,
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            vroom_summary=summary,
            cost_estimate=cost_estimate,
            scenario_state=scenario,
        )

    except Exception as e:
        logger.exception(f"Simulation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
