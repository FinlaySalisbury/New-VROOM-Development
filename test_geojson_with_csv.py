import csv
import json
import logging
import math
import time
from datetime import datetime, timezone

from src.temporal.tomtom_client import TomTomClient
from src.temporal.matrix_weighter import TrafficMatrixWeighter
from src.solver.vroom_interface import VroomSolverInterface
from src.output.geojson_formatter import GeoJsonFormatter

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def parse_csv_data(eng_csv_path: str, job_csv_path: str):
    # 7 locations total: 1 vehicle, 6 geographically dispersed jobs across Greater London
    # API calls: 7 * 6 = 42 calls.
    locations = [
        [0.001, 51.545],  # 0: Stratford (Vehicle 1 Start/End)
        [-0.098, 51.371], # 1: Croydon (Job 1)
        [-0.450, 51.470], # 2: Heathrow (Job 2)
        [-0.080, 51.650], # 3: Enfield (Job 3)
        [0.220, 51.440],  # 4: Dartford (Job 4)
        [-0.127, 51.507], # 5: London Center (Job 5)
        [0.180, 51.580]   # 6: Romford (Job 6)
    ]
    
    # 4.1 hour maximum driving shift (15000 seconds)
    # Huge shift to ensure all 6 jobs are allocated for straight comparison
    vehicles = [
        {"id": 101, "start": locations[0], "end": locations[0], "max_travel_time": 50000, "skills": []}
    ]
    
    # 30 minute service time per job
    jobs = [
        {"id": 501, "location": locations[1], "service": 1800, "skills": []},
        {"id": 502, "location": locations[2], "service": 1800, "skills": []},
        {"id": 503, "location": locations[3], "service": 1800, "skills": []},
        {"id": 504, "location": locations[4], "service": 1800, "skills": []},
        {"id": 505, "location": locations[5], "service": 1800, "skills": []},
        {"id": 506, "location": locations[6], "service": 1800, "skills": []}
    ]

    return locations, vehicles, jobs

def calculate_base_matrix(locations):
    """Generate a mock duration matrix based on Euclidean distance for testing."""
    size = len(locations)
    matrix = [[0 for _ in range(size)] for _ in range(size)]
    for i in range(size):
        for j in range(size):
            if i != j:
                # Roughly 1 degree lat/lon = 111km
                # Assumed average speed ~ 50km/h = ~13.8 m/s = ~8000 seconds per degree
                dx = (locations[i][0] - locations[j][0]) * 8000
                dy = (locations[i][1] - locations[j][1]) * 8000
                distance_sec = int(math.sqrt(dx*dx + dy*dy))
                matrix[i][j] = distance_sec
    return matrix

def summarize_solution(response, name):
    if "error" in response:
        return f"{name:20} | Error: {response['error']}"
    
    summary = response.get("summary", {})
    routes = response.get("routes", [])
    
    result = f"--- {name.upper()} RESULTS ---\n"
    result += f"Total Routes: {summary.get('routes', 0)}\n"
    result += f"Unassigned Jobs: {summary.get('unassigned', 0)}\n"
    result += f"Total Travel Duration: {summary.get('duration', 0)}s\n\n"
    
    for route in routes:
        vehicle_id = route.get("vehicle")
        steps = route.get("steps", [])
        
        job_sequence = []
        for step in steps:
            if step["type"] == "job":
                job_sequence.append(str(step.get("id")))
                
        result += f"Vehicle {vehicle_id} Route: Start -> " + " -> ".join(job_sequence) + " -> End\n"
        result += f"  Total ETA: {route.get('duration', 0)}s, Travel Distance: {route.get('distance', 0)}m\n"
        
    return result

def run_test():
    eng_csv_path = r"legacy_reference\Mock Data\Engineer List.csv"
    job_csv_path = r"legacy_reference\Mock Data\Job List.csv"
    
    logger.info("Setting up Mock Dataset (2 Vehicles, 5 Jobs, 7 Locations)...")
    locations, vehicles, jobs = parse_csv_data(eng_csv_path, job_csv_path)
    
    logger.info("Computing Euclidean Base Matrix (No Traffic)...")
    base_matrix = calculate_base_matrix(locations)
    
    solver = VroomSolverInterface()
    
    # Run 1: Without TomTom
    logger.info("=== RUN 1: VROOM WITHOUT TOMTOM ===")
    base_response = solver.solve(vehicles, jobs, base_matrix)
    base_summary = summarize_solution(base_response, "No Traffic Euclidean")
    
    # Run 2: With TomTom
    logger.info("=== RUN 2: VROOM WITH TOMTOM TRAFFIC ===")
    tt_client = TomTomClient(api_key="Hd7rWKWhXYo1rIGRXkmNDWE0kXeRUrLA")
    matrix_weighter = TrafficMatrixWeighter(tomtom_client=tt_client)
    
    departure_time = int(datetime.now(timezone.utc).timestamp())
    logger.info("Applying TomTom Traffic Multipliers...")
    weighted_matrix = matrix_weighter.apply_traffic_weights(base_matrix, locations, departure_time)
    
    logger.info("Solving Weighted Traffic Matrix...")
    traffic_response = solver.solve(vehicles, jobs, weighted_matrix)
    traffic_summary = summarize_solution(traffic_response, "Live Traffic")
    
    comparison_text = "\n\n" + "="*50 + "\n"
    comparison_text += "      SIDE BY SIDE COMPARISON       \n"
    comparison_text += "="*50 + "\n"
    comparison_text += base_summary + "\n"
    comparison_text += "-"*50 + "\n"
    comparison_text += traffic_summary + "\n"
    comparison_text += "="*50 + "\n"
    
    print(comparison_text)
    with open("comparison_results.txt", "w", encoding="utf-8") as f:
        f.write(comparison_text)
    
    if "error" in traffic_response and traffic_response["error"] != "executable_not_found":
         logger.error(f"Solver Error: {traffic_response['error']}")
    elif "error" in traffic_response:
         logger.warning("VROOM executable not found. Formatter will process the error payload.")
    else:
         logger.info("VROOM Solver generated a successful response.")
         
    with open("base_vroom.json", "w") as f:
        json.dump(base_response, f, indent=2)
    with open("traffic_vroom.json", "w") as f:
        json.dump(traffic_response, f, indent=2)
        
    logger.info("Running GeoJsonFormatter to generate FeatureCollections...")
    formatter = GeoJsonFormatter()
    
    base_geojson = formatter.to_geojson(base_response)
    traffic_geojson = formatter.to_geojson(traffic_response)
    
    with open("base_geojson.json", "w") as f:
        json.dump(base_geojson, f, indent=2)
        
    with open("traffic_geojson.json", "w") as f:
        json.dump(traffic_geojson, f, indent=2)
        
    logger.info("Test Complete! GeoJSON outputs saved.")

if __name__ == "__main__":
    run_test()
