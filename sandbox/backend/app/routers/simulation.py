"""
Simulation Router — POST /api/simulate and /api/remix endpoints.

Orchestrates the full pipeline: data generation → matrix → VROOM → formatting → persist.
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from app.models import SimulationRequest, SimulationResponse, CostEstimate, RemixRequest
from app.config import get_settings
from app.database import save_test_run, get_next_test_number, get_test_run_by_id
from app.services.data_generator import generate_scenario
from app.services.execution_pipeline import run_simulation
from app.services.foursquare_formatter import compile_all

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["simulation"])


@router.post("/simulate", response_model=SimulationResponse)
async def run_test(request: SimulationRequest):
    """
    Execute a simulation test run.
    """
    settings = get_settings()
    run_id = str(uuid.uuid4())
    test_number = await get_next_test_number()

    # Shift start: today at 07:00 UTC
    now = datetime.now(timezone.utc)
    shift_start = int(now.replace(hour=7, minute=0, second=0, microsecond=0).timestamp())

    try:
        # Step 1: Generate or replay scenario
        if request.replay_scenario:
            scenario = request.replay_scenario
            logger.info(f"Test #{test_number}: Replaying scenario with strategy={request.strategy.value}")
        else:
            scenario = generate_scenario(
                num_engineers=request.num_engineers,
                num_jobs=request.num_jobs,
                shift_start_unix=shift_start,
            )
            logger.info(f"Test #{test_number}: Generated {request.num_engineers} engineers, {request.num_jobs} jobs")

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
            test_number=test_number,
            name=request.name,
            strategy=request.strategy.value,
            num_engineers=request.num_engineers,
            num_jobs=request.num_jobs,
            scenario_state=scenario,
            vroom_solution=result["vroom_solution"],
            routes_data=result["routes_data"],
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            combined_geojson=outputs["combined_geojson"],
            total_duration_s=total_duration,
            total_distance_m=total_distance,
            unassigned_jobs=unassigned_count,
            api_cost_estimate=cost_estimate.estimated_cost_eur if cost_estimate else None,
        )

        return SimulationResponse(
            id=run_id,
            test_number=test_number,
            strategy=request.strategy.value,
            num_engineers=request.num_engineers,
            num_jobs=request.num_jobs,
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            combined_geojson=outputs["combined_geojson"],
            routes_data=result["routes_data"],
            vroom_summary=summary,
            cost_estimate=cost_estimate,
            scenario_state=scenario,
        )

    except Exception as e:
        logger.exception(f"Simulation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remix", response_model=SimulationResponse)
async def remix_test(request: RemixRequest):
    """
    Remix a previous test run: keep the same job↔engineer assignments
    but re-run with a different routing strategy.
    
    This allows like-for-like comparison of the same day under different
    traffic conditions.
    """
    settings = get_settings()
    
    # Fetch the parent run
    parent = await get_test_run_by_id(request.parent_run_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Parent test run not found")

    run_id = str(uuid.uuid4())
    test_number = await get_next_test_number()
    
    scenario = parent["scenario_state"]
    vehicles = scenario["vehicles"]
    jobs = scenario["jobs"]
    locations = scenario["locations"]
    shift_start = scenario.get("shift_start", 0)

    # Get the parent's VROOM solution to extract job→vehicle assignments
    parent_solution = parent.get("vroom_solution", {})
    
    # Build per-vehicle constrained job lists from the parent solution
    vehicle_job_assignments = {}  # vehicle_id -> [job_ids]
    if parent_solution and "routes" in parent_solution:
        for route in parent_solution["routes"]:
            vid = route.get("vehicle")
            assigned_jobs = []
            for step in route.get("steps", []):
                if step.get("type") == "job" and step.get("job") is not None:
                    assigned_jobs.append(step["job"])
            vehicle_job_assignments[vid] = assigned_jobs

    # Build constrained vehicles and jobs: each vehicle gets ONLY the same jobs
    # We modify jobs so each job's skills match only its assigned vehicle
    constrained_vehicles = []
    constrained_jobs = []
    job_lookup = {j["id"]: j for j in jobs}

    for vehicle in vehicles:
        vid = vehicle["id"]
        assigned_job_ids = vehicle_job_assignments.get(vid, [])
        
        if not assigned_job_ids:
            continue

        # Create constrained vehicle with unique skill tag
        remix_skill = f"_remix_v{vid}"
        constrained_vehicle = dict(vehicle)
        existing_skills = list(vehicle.get("skills", []))
        existing_skills.append(remix_skill)
        constrained_vehicle["skills"] = existing_skills
        constrained_vehicles.append(constrained_vehicle)

        # Create constrained jobs with matching skill requirement
        for jid in assigned_job_ids:
            if jid in job_lookup:
                constrained_job = dict(job_lookup[jid])
                existing_req = list(constrained_job.get("skills", []))
                existing_req.append(remix_skill)
                constrained_job["skills"] = existing_req
                constrained_jobs.append(constrained_job)

    # Build the location list: constrained vehicles first, then constrained jobs
    remix_locations = [v["start"] for v in constrained_vehicles] + [j["location"] for j in constrained_jobs]

    try:
        logger.info(f"Remix #{test_number}: Re-running parent {request.parent_run_id[:8]}... with strategy={request.strategy.value}")

        result = run_simulation(
            vehicles=constrained_vehicles,
            jobs=constrained_jobs,
            locations=remix_locations,
            strategy=request.strategy.value,
            shift_start=shift_start,
            api_key=settings.TOMTOM_API_KEY,
            vroom_endpoint=settings.VROOM_ENDPOINT,
        )

        outputs = compile_all(
            routes_data=result["routes_data"],
            vehicles=constrained_vehicles,
            jobs=constrained_jobs,
            vroom_solution=result["vroom_solution"],
        )

        cost_estimate = None
        if request.strategy.value == "tomtom_premium":
            n = len(remix_locations)
            matrix_elements = n * n
            cost_estimate = CostEstimate(
                total_waypoints=n,
                matrix_elements=matrix_elements,
                estimated_cost_eur=round(matrix_elements * 0.00042, 2),
            )

        summary = result.get("vroom_summary", {})

        await save_test_run(
            run_id=run_id,
            test_number=test_number,
            name=f"Remix of #{parent.get('test_number', '?')}",
            strategy=request.strategy.value,
            num_engineers=len(constrained_vehicles),
            num_jobs=len(constrained_jobs),
            scenario_state=scenario,
            vroom_solution=result["vroom_solution"],
            routes_data=result["routes_data"],
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            combined_geojson=outputs["combined_geojson"],
            total_duration_s=summary.get("duration", 0),
            total_distance_m=summary.get("distance", 0),
            unassigned_jobs=summary.get("unassigned", 0),
            api_cost_estimate=cost_estimate.estimated_cost_eur if cost_estimate else None,
            is_remix=True,
            parent_run_id=request.parent_run_id,
        )

        return SimulationResponse(
            id=run_id,
            test_number=test_number,
            strategy=request.strategy.value,
            num_engineers=len(constrained_vehicles),
            num_jobs=len(constrained_jobs),
            trips_geojson=outputs["trips_geojson"],
            faults_geojson=outputs["faults_geojson"],
            routes_geojson=outputs["routes_geojson"],
            combined_geojson=outputs["combined_geojson"],
            routes_data=result["routes_data"],
            vroom_summary=summary,
            cost_estimate=cost_estimate,
            scenario_state=scenario,
            is_remix=True,
            parent_run_id=request.parent_run_id,
        )

    except Exception as e:
        logger.exception(f"Remix failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
