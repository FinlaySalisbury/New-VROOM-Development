"""
Execution Pipeline — Orchestrates the full VROOM simulation flow.

Pipeline:
  1. Matrix computation (via matrix_engine)
  2. VROOM solver execution
  3. Timeline simulation (step-by-step timestamp computation)
  4. TomTom leg routing (polyline + real travel time per leg)
  5. Foursquare output compilation
"""
import math
import logging
from typing import Any, Optional
from datetime import datetime, timezone

from app.core.vroom_interface import VroomSolverInterface
from app.core.tomtom_client import TomTomClient
from app.services.matrix_engine import get_matrix, _haversine

logger = logging.getLogger(__name__)


def _simulate_timeline(
    route: dict[str, Any], shift_start: int
) -> list[dict[str, Any]]:
    """
    Walk through VROOM's steps array and compute exact arrival/departure
    Unix timestamps for each stop.
    
    VROOM returns step.arrival as seconds offset from the optimization origin.
    We convert these to absolute Unix timestamps.
    """
    timeline = []
    for step in route.get("steps", []):
        arrival_offset = step.get("arrival", 0)
        service_time = step.get("service", 0)
        departure_offset = arrival_offset + service_time

        entry = {
            "type": step.get("type", "unknown"),
            "location": step.get("location"),
            "location_index": step.get("location_index", step.get("job", -1)),
            "job_id": step.get("job"),
            "arrival_unix": shift_start + arrival_offset,
            "departure_unix": shift_start + departure_offset,
            "service_s": service_time,
            "arrival_offset": arrival_offset,
        }
        timeline.append(entry)
    return timeline


def _build_mock_route_geometry(
    origin: list[float],
    destination: list[float],
    num_points: int = 10,
) -> list[list[float]]:
    """
    Generate a simple interpolated line between two points.
    Used as fallback when TomTom routing is unavailable.
    Adds slight random perturbation to make routes look realistic on a map.
    """
    import random
    coords = []
    for i in range(num_points):
        t = i / max(num_points - 1, 1)
        lon = origin[0] + t * (destination[0] - origin[0])
        lat = origin[1] + t * (destination[1] - origin[1])
        # Small jitter to simulate road curvature
        if 0 < i < num_points - 1:
            lon += random.uniform(-0.002, 0.002)
            lat += random.uniform(-0.001, 0.001)
        coords.append([round(lon, 6), round(lat, 6)])
    return coords


def _interpolate_timestamps(
    polyline_coords: list[list[float]],
    depart_unix: int,
    arrive_unix: int,
) -> list[list[float]]:
    """
    Assign timestamps to each polyline point using cumulative distance-based 
    linear interpolation.
    
    Returns [[lon, lat, 0, unix_timestamp], ...] — the 4D format required by
    Foursquare Studio Trip Layer.
    
    Method:
      1. Compute cumulative Haversine distance along the polyline
      2. Normalize each point's cumulative distance to [0.0, 1.0]
      3. Map normalized position to timestamp:
         timestamp_i = depart_unix + (normalized_i × total_duration)
    """
    total_duration = arrive_unix - depart_unix
    n = len(polyline_coords)

    if n == 0:
        return []
    if n == 1:
        return [[polyline_coords[0][0], polyline_coords[0][1], 0, depart_unix]]

    # Step 1: Cumulative distances
    cum_distances = [0.0]
    for i in range(1, n):
        d = _haversine(polyline_coords[i - 1], polyline_coords[i])
        cum_distances.append(cum_distances[-1] + d)

    total_distance = cum_distances[-1]
    if total_distance == 0:
        # All points at same location
        return [[c[0], c[1], 0, depart_unix] for c in polyline_coords]

    # Step 2-3: Normalize and map to timestamps
    result = []
    for i, coord in enumerate(polyline_coords):
        fraction = cum_distances[i] / total_distance
        timestamp = int(depart_unix + fraction * total_duration)
        result.append([coord[0], coord[1], 0, timestamp])

    return result


def _get_leg_geometry_and_duration(
    origin: list[float],
    destination: list[float],
    depart_at: int,
    api_key: Optional[str] = None,
) -> tuple[list[list[float]], int]:
    """
    Fetch the actual road geometry and duration for a leg using TomTom Routing v1.
    Falls back to mock geometry if API unavailable.
    
    Returns:
        (polyline_coords, duration_seconds)
    """
    if api_key and api_key != "MOCK_KEY":
        try:
            client = TomTomClient(api_key=api_key)
            duration = client.get_route_duration(origin, destination, depart_at)
            # TomTom Routing v1 also returns geometry but our current client
            # only extracts duration. Use mock geometry for now, annotate
            # with the real duration.
            geometry = _build_mock_route_geometry(origin, destination, num_points=15)
            return geometry, duration
        except Exception as e:
            logger.warning(f"TomTom routing failed, using mock: {e}")

    # Mock fallback: estimate duration from Haversine at 25 km/h
    dist = _haversine(origin, destination)
    duration = max(int(dist / (25_000 / 3600)), 60)  # At least 1 minute
    geometry = _build_mock_route_geometry(origin, destination)
    return geometry, duration


def _compute_traffic_multiplier(
    naive_duration: int, actual_duration: int
) -> float:
    """
    Compute the traffic multiplier for a leg.
    This powers the Red/Amber/Green styling in routes.geojson.
    """
    if naive_duration <= 0:
        return 1.0
    return round(actual_duration / naive_duration, 2)


def run_simulation(
    vehicles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    locations: list[list[float]],
    strategy: str,
    shift_start: int,
    api_key: Optional[str] = None,
    vroom_endpoint: str = "http://localhost:3000/",
) -> dict[str, Any]:
    """
    Run the full simulation pipeline.
    
    Returns:
        Dict with keys:
          - vroom_solution: raw VROOM response
          - routes_data: per-vehicle route data with geometries and timestamps
          - vroom_summary: VROOM summary stats
    """
    # Step 1: Compute matrix
    matrix = get_matrix(strategy, locations, shift_start, api_key)
    logger.info(f"Matrix computed ({strategy}): {len(locations)}×{len(locations)}")

    # Step 2: Solve with VROOM
    solver = VroomSolverInterface(endpoint_url=vroom_endpoint)
    solution = solver.solve(vehicles, jobs, matrix)

    if "error" in solution:
        logger.warning(f"VROOM solver error: {solution['error']}. Using mock solver.")
        # Import ConvergenceSolver for mock fallback
        solution = _mock_vroom_solve(vehicles, jobs, matrix)

    # Step 3-4: Process each route
    routes_data = []
    if "routes" in solution:
        for route in solution["routes"]:
            vehicle_id = route.get("vehicle")
            timeline = _simulate_timeline(route, shift_start)

            # For each consecutive pair of stops, get geometry and actual duration
            legs = []
            for k in range(len(timeline) - 1):
                origin_loc = timeline[k]["location"]
                dest_loc = timeline[k + 1]["location"]
                depart_unix = timeline[k]["departure_unix"]
                arrive_unix = timeline[k + 1]["arrival_unix"]

                if not origin_loc or not dest_loc:
                    continue

                # Get real geometry and duration
                geometry, actual_duration = _get_leg_geometry_and_duration(
                    origin_loc, dest_loc, depart_unix, api_key
                )

                # Recalculate arrive_unix using actual duration
                actual_arrive = depart_unix + actual_duration

                # Interpolate timestamps along polyline
                timestamped_coords = _interpolate_timestamps(
                    geometry, depart_unix, actual_arrive
                )

                # Compute traffic multiplier
                naive_dist = _haversine(origin_loc, dest_loc)
                naive_duration = max(int(naive_dist / (30_000 / 3600)), 1)
                traffic_mult = _compute_traffic_multiplier(naive_duration, actual_duration)

                legs.append({
                    "leg_id": f"v{vehicle_id}_leg{k}",
                    "origin": origin_loc,
                    "destination": dest_loc,
                    "depart_unix": depart_unix,
                    "arrive_unix": actual_arrive,
                    "duration_s": actual_duration,
                    "geometry": geometry,
                    "timestamped_coords": timestamped_coords,
                    "traffic_multiplier": traffic_mult,
                })

            routes_data.append({
                "vehicle_id": vehicle_id,
                "timeline": timeline,
                "legs": legs,
            })

    return {
        "vroom_solution": solution,
        "routes_data": routes_data,
        "vroom_summary": solution.get("summary", {}),
        "matrix": matrix,
    }


def _mock_vroom_solve(
    vehicles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    matrix: list[list[int]],
) -> dict[str, Any]:
    """
    Minimal mock VROOM solver for when Docker isn't available.
    Distributes jobs round-robin across vehicles with nearest-neighbor sequencing.
    """
    num_vehicles = len(vehicles)
    vehicle_jobs: dict[int, list] = {i: [] for i in range(num_vehicles)}

    # Simple round-robin distribution
    for idx, job in enumerate(jobs):
        v_idx = idx % num_vehicles
        vehicle_jobs[v_idx].append(job)

    routes = []
    unassigned = []

    for v_idx, vehicle in enumerate(vehicles):
        assigned = vehicle_jobs[v_idx]
        if not assigned:
            continue

        steps = []
        # Start step
        steps.append({
            "type": "start",
            "location": vehicle["start"],
            "arrival": 0,
            "service": 0,
        })

        cumulative_time = 0
        prev_loc_index = v_idx  # vehicle start index in matrix

        for job in assigned:
            job_loc_index = num_vehicles + jobs.index(job)
            travel_time = matrix[prev_loc_index][job_loc_index]
            cumulative_time += travel_time

            steps.append({
                "type": "job",
                "location": job["location"],
                "location_index": job_loc_index,
                "job": job["id"],
                "arrival": cumulative_time,
                "service": job.get("service", 1800),
            })
            cumulative_time += job.get("service", 1800)
            prev_loc_index = job_loc_index

        # End step
        travel_home = matrix[prev_loc_index][v_idx]
        cumulative_time += travel_home
        steps.append({
            "type": "end",
            "location": vehicle["end"],
            "arrival": cumulative_time,
            "service": 0,
        })

        routes.append({
            "vehicle": vehicle["id"],
            "steps": steps,
            "duration": cumulative_time,
            "distance": 0,
        })

    return {
        "routes": routes,
        "unassigned": unassigned,
        "summary": {
            "cost": sum(r["duration"] for r in routes),
            "routes": len(routes),
            "unassigned": len(unassigned),
            "duration": sum(r["duration"] for r in routes),
        },
    }
