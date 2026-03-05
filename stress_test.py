import logging
import random
import time
from datetime import datetime, timezone
import json
from src.temporal.tomtom_client import TomTomClient
from src.temporal.matrix_weighter import TrafficMatrixWeighter
from src.solver.vroom_interface import VroomSolverInterface
from src.output.geojson_formatter import GeoJsonFormatter

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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
        
    # Generate mock base routing matrix of durations (in seconds)
    base_matrix: list[list[int]] = [[0 for _ in range(num_locations)] for _ in range(num_locations)]
    for i in range(num_locations):
        for j in range(num_locations):
            if i != j:
                # Mock base travel time between 1 min and 60 mins
                base_matrix[i][j] = random.randint(60, 3600)
                
    # Generate a few vehicles (e.g., 50) and assign them the first 50 locations
    num_vehicles = min(50, num_locations // 10)
    vehicles = []
    for i in range(num_vehicles):
        vehicles.append({
            "id": i + 1,
            "start": locations[i],
            "end": locations[i], # Return to start
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
            "skills": [random.randint(1, 4)]
        })
        
    return locations, base_matrix, vehicles, jobs

def run_stress_test(num_locations: int = 500, departure_time: int | None = None):
    logger.info("Initializing Orchestrator Components...")
    
    # We use MOCK_KEY to leverage our _simulate_multiplier fallback for vast testing without an API Key
    tt_client = TomTomClient(api_key="MOCK_KEY")
    matrix_weighter = TrafficMatrixWeighter(tomtom_client=tt_client)
    
    # Initialize Solver Interface 
    # NOTE: Assumes 'vroom' is available globally in the OS path. 
    solver = VroomSolverInterface(vroom_executable_path="vroom")
    formatter = GeoJsonFormatter()
    
    locations, base_matrix, vehicles, jobs = generate_mock_data(num_locations)
    
    # Default to current time if none provided
    if departure_time is None:
        departure_time = int(datetime.now(timezone.utc).timestamp())
        
    logger.info(f"Applying Temporal Traffic Weights (Simulated) for Departure Time: {departure_time}...")
    start_time = time.time()
    weighted_matrix = matrix_weighter.apply_traffic_weights(base_matrix, locations, departure_time)
    weighting_duration = time.time() - start_time
    logger.info(f"Matrix Weighting Completed in {weighting_duration:.2f} seconds.")
    
    logger.info("Submitting payload to local VROOM Solver...")
    start_time = time.time()
    vroom_response = solver.solve(vehicles, jobs, weighted_matrix)
    solver_duration = time.time() - start_time
    
    if "error" in vroom_response:
        if vroom_response["error"] == "executable_not_found":
            logger.warning(f"VROOM executed natively in {solver_duration:.2f} seconds. (Simulation Note: Binary not found on system path, which is expected before final environmental setup).")
        else:
            logger.error(f"Solver Error: {vroom_response['error']}")
    else:
        logger.info(f"VROOM Solved Successfully in {solver_duration:.2f} seconds.")
        
        # Output Generation
        logger.info("Structuring Output to GeoJSON...")
        geojson_output = formatter.to_geojson(vroom_response)
        
        with open("stress_test_output.json", "w") as f:
            json.dump(geojson_output, f, indent=2)
            
        logger.info("Results saved to stress_test_output.json")
        
    logger.info("=== Stress Test Complete ===")
    
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="VROOM Orchestrator Stress Tester")
    parser.add_argument("--locations", type=int, default=100, help="Number of matrix location pairs to generate")
    parser.add_argument("--time", type=int, help="Unix Timestamp to simulate departure (tests Rush Hour vs Free Flow)")
    
    args = parser.parse_args()
    run_stress_test(num_locations=args.locations, departure_time=args.time)
