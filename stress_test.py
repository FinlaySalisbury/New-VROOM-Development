"""
VROOM Orchestrator Stress Tester — TDVRP Edition

Uses the TomTom Matrix Routing API v2 for time-dependent N×N duration computation.
Supports Plan Mode (-c) for mid-shift urgent fault injection with live traffic.
"""
import os
import logging
import random
import time
import json
import argparse
from datetime import datetime, timezone
from src.temporal.matrix_weighter import TrafficMatrixWeighter
from src.solver.vroom_interface import VroomSolverInterface
from src.output.geojson_formatter import GeoJsonFormatter

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# London Engineering Job Scenarios
# ──────────────────────────────────────────────
LONDON_SCENARIO = {
    "vehicle": {
        "id": 1,
        "start": [-0.0886, 51.5131],   # Aldgate (depot)
        "end": [-0.0886, 51.5131],      # Return to depot
        "skills": [1, 2, 3],
        "time_window": [1741600800, 1741630800]  # 08:00–16:20 UTC
    },
    "jobs": [
        {
            "id": 101,
            "location": [-0.1278, 51.5074],  # Westminster
            "skills": [1],
            "service": 1800,  # 30 min service time
        },
        {
            "id": 102,
            "location": [0.0010, 51.5450],   # Stratford
            "skills": [2],
            "service": 2700,  # 45 min service time
        },
        {
            "id": 103,
            "location": [-0.1960, 51.5015],  # Earl's Court
            "skills": [1],
            "service": 1200,  # 20 min service time
        },
        {
            "id": 104,
            "location": [-0.0754, 51.4613],  # Deptford
            "skills": [3],
            "service": 3600,  # 60 min service time
        },
        {
            "id": 105,
            "location": [-0.0553, 51.5384],  # Mile End
            "skills": [2],
            "service": 900,   # 15 min service time
        },
    ]
}


def generate_mock_data(num_locations: int):
    """Generates massive scale mock data for stress testing the engine."""
    logger.info(f"Generating mock data for {num_locations} location pairs...")
    
    # Bounding box roughly representing London
    min_lon, max_lon = -0.3, 0.1
    min_lat, max_lat = 51.3, 51.7
    
    locations = []
    for _ in range(num_locations):
        lon = round(random.uniform(min_lon, max_lon), 6)
        lat = round(random.uniform(min_lat, max_lat), 6)
        locations.append([lon, lat])
        
    # Generate a few vehicles (e.g., 50) and assign them the first 50 locations
    num_vehicles = min(50, num_locations // 10)
    if num_vehicles < 1:
        num_vehicles = 1
        
    vehicles = []
    for i in range(num_vehicles):
        vehicles.append({
            "id": i + 1,
            "start": locations[i],
            "end": locations[i],
            "skills": [random.randint(1, 4)]
        })
        
    # Generate Jobs from the remaining locations
    jobs = []
    offset = num_vehicles
    num_jobs = num_locations - num_vehicles
    for i in range(num_jobs):
        jobs.append({
            "id": i + 101,
            "location": locations[offset + i],
            "skills": [random.randint(1, 4)],
            "service": random.choice([900, 1200, 1800, 2700, 3600])
        })
        
    return locations, vehicles, jobs


def run_london_scenario(plan_mode: bool = False, departure_time: int | None = None):
    """
    Run the 5-job London engineering scenario using TomTom Matrix v2.
    This is the primary TDVRP validation test.
    """
    logger.info("=" * 60)
    logger.info("LONDON TRAFFIC CYLINDER — 5-Job Scenario")
    logger.info(f"Plan Mode: {'ENABLED (live traffic)' if plan_mode else 'DISABLED (historical)'}")
    logger.info("=" * 60)

    # Initialize with env var API key (never hardcoded)
    matrix_weighter = TrafficMatrixWeighter(api_key=os.environ.get("TOMTOM_API_KEY"))
    solver = VroomSolverInterface()
    formatter = GeoJsonFormatter()

    vehicle = LONDON_SCENARIO["vehicle"]
    jobs = LONDON_SCENARIO["jobs"]

    # Build the unified location list: [vehicle_start, job1, job2, ..., job5]
    all_locations = [vehicle["start"]]
    for j in jobs:
        all_locations.append(j["location"])

    if departure_time is None:
        departure_time = int(datetime.now(timezone.utc).timestamp())

    # ── Compute Time-Dependent Matrix via TomTom v2 ──
    logger.info(f"Computing {len(all_locations)}×{len(all_locations)} time-dependent matrix...")
    start = time.time()
    duration_matrix = matrix_weighter.compute_time_dependent_matrix(
        locations=all_locations,
        departure_time=departure_time,
        plan_mode=plan_mode
    )
    matrix_time = time.time() - start
    logger.info(f"Matrix computation completed in {matrix_time:.2f}s")

    # Log the matrix for inspection
    logger.info("Duration matrix (seconds):")
    labels = ["Depot"] + [f"Job {j['id']}" for j in jobs]
    for i, row in enumerate(duration_matrix):
        logger.info(f"  {labels[i]:>10}: {row}")

    # ── Solve with VROOM ──
    logger.info("Submitting to VROOM solver...")
    start = time.time()
    vroom_response = solver.solve([vehicle], jobs, duration_matrix)
    solve_time = time.time() - start

    if "error" in vroom_response:
        logger.warning(f"VROOM solver returned error: {vroom_response['error']}")
        logger.info("Saving raw payload for inspection...")
        
        # Save the payload that would have been sent
        payload_debug = solver._build_payload([vehicle], jobs, duration_matrix)
        with open("stress_test_output.json", "w") as f:
            json.dump({
                "status": "solver_error",
                "error": vroom_response["error"],
                "matrix_computation_seconds": matrix_time,
                "plan_mode": plan_mode,
                "departure_time_utc": datetime.fromtimestamp(departure_time, tz=timezone.utc).isoformat(),
                "duration_matrix": duration_matrix,
                "vroom_payload": payload_debug
            }, f, indent=2)
        logger.info("Debug payload saved to stress_test_output.json")
    else:
        logger.info(f"VROOM solved in {solve_time:.2f}s")
        
        # Format output
        geojson_output = formatter.to_geojson(vroom_response)
        
        output = {
            "status": "success",
            "matrix_computation_seconds": matrix_time,
            "solver_seconds": solve_time,
            "plan_mode": plan_mode,
            "departure_time_utc": datetime.fromtimestamp(departure_time, tz=timezone.utc).isoformat(),
            "duration_matrix": duration_matrix,
            "vroom_solution": vroom_response,
            "geojson": geojson_output
        }
        
        with open("stress_test_output.json", "w") as f:
            json.dump(output, f, indent=2)
        logger.info("Results saved to stress_test_output.json")

    logger.info("=== London Scenario Complete ===")


def run_stress_test(num_locations: int = 100, plan_mode: bool = False, 
                    departure_time: int | None = None):
    """Large-scale random stress test using TomTom Matrix v2."""
    logger.info(f"Initializing TDVRP Stress Test — {num_locations} locations...")

    matrix_weighter = TrafficMatrixWeighter(api_key=os.environ.get("TOMTOM_API_KEY"))
    solver = VroomSolverInterface()
    formatter = GeoJsonFormatter()

    locations, vehicles, jobs = generate_mock_data(num_locations)

    if departure_time is None:
        departure_time = int(datetime.now(timezone.utc).timestamp())

    logger.info(f"Computing {num_locations}×{num_locations} time-dependent matrix...")
    start = time.time()
    duration_matrix = matrix_weighter.compute_time_dependent_matrix(
        locations=locations,
        departure_time=departure_time,
        plan_mode=plan_mode
    )
    matrix_time = time.time() - start
    logger.info(f"Matrix computation completed in {matrix_time:.2f}s")

    logger.info("Submitting to VROOM solver...")
    start = time.time()
    vroom_response = solver.solve(vehicles, jobs, duration_matrix)
    solve_time = time.time() - start

    if "error" in vroom_response:
        logger.warning(f"Solver error: {vroom_response['error']}")
    else:
        logger.info(f"VROOM solved in {solve_time:.2f}s")
        geojson_output = formatter.to_geojson(vroom_response)
        with open("stress_test_output.json", "w") as f:
            json.dump(geojson_output, f, indent=2)
        logger.info("Results saved to stress_test_output.json")

    logger.info("=== Stress Test Complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VROOM TDVRP Stress Tester")
    parser.add_argument("--locations", type=int, default=6,
                        help="Number of locations (default: 6 for London scenario)")
    parser.add_argument("--time", type=int, 
                        help="Unix timestamp for departure (default: now)")
    parser.add_argument("-c", "--plan-mode", action="store_true",
                        help="Plan Mode: use departAt=now with LIVE traffic for urgent fault injection")
    parser.add_argument("--london", action="store_true", default=True,
                        help="Run the 5-job London engineering scenario (default)")
    parser.add_argument("--random", action="store_true",
                        help="Run random stress test instead of London scenario")
    
    args = parser.parse_args()
    
    if args.random:
        run_stress_test(
            num_locations=args.locations,
            plan_mode=args.plan_mode,
            departure_time=args.time
        )
    else:
        run_london_scenario(
            plan_mode=args.plan_mode,
            departure_time=args.time
        )
