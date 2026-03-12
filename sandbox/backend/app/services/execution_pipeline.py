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
from app.services.convergence_solver import ConvergenceSolver

logger = logging.getLogger(__name__)


def _unix_to_time_of_day(unix_ts: int) -> str:
    """Convert unix timestamp to HH:MM time-of-day string."""
    dt = datetime.fromtimestamp(unix_ts, tz=timezone.utc)
    return dt.strftime("%H:%M")


def _simulate_timeline(
    route: dict[str, Any], shift_start: int
) -> list[dict[str, Any]]:
    """
    Walk through VROOM's steps array and extract arrival/departure
    Unix timestamps for each stop.
    
    NOTE: VROOM's time_windows use absolute Unix timestamps, so
    step.arrival values are already absolute — we use them directly.
    """
    timeline = []
    for step in route.get("steps", []):
        arrival = step.get("arrival", 0)
        service_time = step.get("service", 0)
        departure = arrival + service_time

        entry = {
            "type": step.get("type", "unknown"),
            "location": step.get("location"),
            "location_index": step.get("location_index", step.get("job", -1)),
            "job_id": step.get("job"),
            "arrival_unix": arrival,
            "departure_unix": departure,
            "service_s": service_time,
            "arrival_offset": arrival - shift_start,  # Keep for reference
        }
        timeline.append(entry)
    return timeline


def _build_mock_route_geometry(
    origin: list[float],
    destination: list[float],
    num_points: int = 8,
) -> list[list[float]]:
    """
    Generate a clean interpolated line between two points.
    No jitter — produces straight lines connecting waypoints.
    """
    coords = []
    for i in range(num_points):
        t = i / max(num_points - 1, 1)
        lon = origin[0] + t * (destination[0] - origin[0])
        lat = origin[1] + t * (destination[1] - origin[1])
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
    """
    total_duration = arrive_unix - depart_unix
    n = len(polyline_coords)

    if n == 0:
        return []
    if n == 1:
        return [[polyline_coords[0][0], polyline_coords[0][1], 0, depart_unix]]

    # Cumulative distances
    cum_distances = [0.0]
    for i in range(1, n):
        d = _haversine(polyline_coords[i - 1], polyline_coords[i])
        cum_distances.append(cum_distances[-1] + d)

    total_distance = cum_distances[-1]
    if total_distance == 0:
        return [[c[0], c[1], 0, depart_unix] for c in polyline_coords]

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
    client: TomTomClient,
) -> tuple[list[list[float]], int, int, int]:
    """
    Fetch road-following geometry and real-world traffic-aware duration
    from TomTom Routing v1.
    
    The strategy only affects the OPTIMIZATION matrix (step 1).
    The FINAL OUTPUT always uses real traffic-aware durations to show
    what would actually happen if the optimized routes were driven.
    
    Returns:
        (geometry, traffic_duration, free_flow_duration, distance_m)
    """
    route_data = client.get_route_with_geometry(origin, destination, depart_at)
    
    geometry = route_data["geometry"]
    free_flow = route_data["free_flow_duration_s"]
    traffic = route_data["traffic_duration_s"]
    distance_m = route_data["distance_m"]
    
    # Always return the traffic-aware duration as the effective duration.
    # This shows the REALITY of each route regardless of how it was optimized.
    return geometry, traffic, free_flow, distance_m


def _compute_traffic_multiplier(
    naive_duration: int, actual_duration: int
) -> float:
    """Compute the traffic multiplier for a leg (powers RAG styling)."""
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
          - routes_data: per-vehicle route data with geometries, timestamps, and activity logs
          - vroom_summary: VROOM summary stats
    """
    # Instantiate a single shared TomTomClient to maximize Time-Bucket Cache hit rate
    # between Matrix/Convergence solving and Route Geometry fetching
    tt_client = TomTomClient(api_key=api_key or "MOCK_KEY")
    
    if strategy == "tomtom_premium":
        logger.info("Executing TomTom Iterative Convergence Pipeline...")
        solver = ConvergenceSolver(
            api_key=api_key, 
            vroom_endpoint=vroom_endpoint,
            tt_client=tt_client,
            max_iterations=3
        )
        result = solver.solve(vehicles, jobs, locations, shift_start)
        solution = result["vroom_solution"]
        matrix = result["final_matrix"]
        
    else:
        # Step 1: Compute matrix
        matrix = get_matrix(strategy, locations, shift_start, api_key)
        logger.info(f"Matrix computed ({strategy}): {len(locations)}×{len(locations)}")
    
        # Step 2: Solve with VROOM
        solver = VroomSolverInterface(endpoint_url=vroom_endpoint)
        solution = solver.solve(vehicles, jobs, matrix)
    
        if "error" in solution:
            logger.warning(f"VROOM solver error: {solution['error']}. Using mock solver.")
            solution = _mock_vroom_solve(vehicles, jobs, matrix, shift_start)

    # Build a job lookup for enriching logs
    job_lookup = {j["id"]: j for j in jobs}

    # Step 3-4: Process each route
    routes_data = []
    if "routes" in solution:
        for route in solution["routes"]:
            vehicle_id = route.get("vehicle")
            timeline = _simulate_timeline(route, shift_start)

            # Find the vehicle definition
            vehicle_def = None
            for v in vehicles:
                if v["id"] == vehicle_id:
                    vehicle_def = v
                    break

            # Build activity log (chronological day)
            activity_log = []
            legs = []

            for k in range(len(timeline)):
                step = timeline[k]
                
                # Log the arrival at this step
                if step["type"] == "start":
                    # Compute availability window for the log
                    avail_desc = ""
                    if vehicle_def and vehicle_def.get("time_window"):
                        tw = vehicle_def["time_window"]
                        avail_start = _unix_to_time_of_day(shift_start + tw[0])
                        avail_end = _unix_to_time_of_day(shift_start + tw[1])
                        avail_desc = f" (available {avail_start}–{avail_end})"
                    activity_log.append({
                        "order": len(activity_log) + 1,
                        "action": "shift_start",
                        "description": f"Engineer #{vehicle_id} begins shift{avail_desc}",
                        "location": step["location"],
                        "timestamp_unix": step["arrival_unix"],
                        "time_of_day": _unix_to_time_of_day(step["arrival_unix"]),
                        "duration_s": 0,
                        "traffic_multiplier": None,
                    })
                elif step["type"] == "job":
                    job_info = job_lookup.get(step["job_id"], {})
                    activity_log.append({
                        "order": len(activity_log) + 1,
                        "action": "service",
                        "description": job_info.get("description", f"Job #{step['job_id']}"),
                        "job_id": step["job_id"],
                        "location": step["location"],
                        "timestamp_unix": step["arrival_unix"],
                        "time_of_day": _unix_to_time_of_day(step["arrival_unix"]),
                        "duration_s": step["service_s"],
                        "traffic_multiplier": None,
                    })
                elif step["type"] == "end":
                    activity_log.append({
                        "order": len(activity_log) + 1,
                        "action": "shift_end",
                        "description": f"Engineer #{vehicle_id} returns to depot",
                        "location": step["location"],
                        "timestamp_unix": step["arrival_unix"],
                        "time_of_day": _unix_to_time_of_day(step["arrival_unix"]),
                        "duration_s": 0,
                        "traffic_multiplier": None,
                    })

                # Build leg geometry between this step and the next
                if k < len(timeline) - 1:
                    origin_loc = step["location"]
                    dest_loc = timeline[k + 1]["location"]
                    depart_unix = step["departure_unix"]
                    arrive_unix = timeline[k + 1]["arrival_unix"]

                    if not origin_loc or not dest_loc:
                        continue

                    geometry, actual_duration, ff_duration, leg_distance = _get_leg_geometry_and_duration(
                        origin_loc, dest_loc, depart_unix, tt_client
                    )

                    actual_arrive = depart_unix + actual_duration

                    timestamped_coords = _interpolate_timestamps(
                        geometry, depart_unix, actual_arrive
                    )

                    # Traffic multiplier: compare strategy duration to free-flow
                    traffic_mult = _compute_traffic_multiplier(ff_duration, actual_duration)

                    leg_data = {
                        "leg_id": f"v{vehicle_id}_leg{k}",
                        "origin": origin_loc,
                        "destination": dest_loc,
                        "depart_unix": depart_unix,
                        "arrive_unix": actual_arrive,
                        "duration_s": actual_duration,
                        "free_flow_duration_s": ff_duration,
                        "distance_m": leg_distance,
                        "geometry": geometry,
                        "timestamped_coords": timestamped_coords,
                        "traffic_multiplier": traffic_mult,
                    }
                    legs.append(leg_data)

                    # Add travel to the activity log
                    from_desc = "depot" if step["type"] == "start" else f"Job #{step.get('job_id', '?')}"
                    next_step = timeline[k + 1]
                    to_desc = "depot" if next_step["type"] == "end" else f"Job #{next_step.get('job_id', '?')}"
                    
                    activity_log.append({
                        "order": len(activity_log) + 1,
                        "action": "travel",
                        "description": f"Drive {from_desc} → {to_desc}",
                        "location": origin_loc,
                        "timestamp_unix": depart_unix,
                        "time_of_day": _unix_to_time_of_day(depart_unix),
                        "duration_s": actual_duration,
                        "traffic_multiplier": traffic_mult,
                    })

            # Compute human-readable availability window
            avail_start_str = None
            avail_end_str = None
            if vehicle_def and vehicle_def.get("time_window"):
                tw = vehicle_def["time_window"]
                avail_start_str = _unix_to_time_of_day(shift_start + tw[0])
                avail_end_str = _unix_to_time_of_day(shift_start + tw[1])

            routes_data.append({
                "vehicle_id": vehicle_id,
                "vehicle_name": vehicle_def.get("name", f"Engineer_{vehicle_id}") if vehicle_def else f"Engineer_{vehicle_id}",
                "vehicle_skills": vehicle_def.get("skills", []) if vehicle_def else [],
                "vehicle_start": vehicle_def["start"] if vehicle_def else None,
                "vehicle_end": vehicle_def["end"] if vehicle_def else None,
                "vehicle_time_window": vehicle_def.get("time_window") if vehicle_def else None,
                "availability_start": avail_start_str,
                "availability_end": avail_end_str,
                "num_jobs_assigned": sum(1 for s in timeline if s["type"] == "job"),
                "timeline": timeline,
                "legs": legs,
                "activity_log": sorted(activity_log, key=lambda x: x.get("timestamp_unix", 0)),
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
    shift_start: int = 0,
) -> dict[str, Any]:
    """
    Skill-aware nearest-neighbor mock VROOM solver.
    
    1. Filters jobs by skill compatibility with each vehicle
    2. Assigns each job to the nearest compatible vehicle
    3. Sequences each vehicle's jobs using nearest-neighbor from depot
    """
    num_vehicles = len(vehicles)
    vehicle_jobs: dict[int, list] = {i: [] for i in range(num_vehicles)}
    assigned_job_ids: set = set()
    unassigned = []

    # Build skill sets per vehicle
    vehicle_skills = {}
    for i, v in enumerate(vehicles):
        vehicle_skills[i] = set(v.get("skills", []))

    # Assign each job to the nearest compatible vehicle (greedy)
    for job in jobs:
        required_skills = set(job.get("skills", []))
        best_vehicle = None
        best_cost = float("inf")

        for v_idx in range(num_vehicles):
            # Check skill compatibility: vehicle must have ALL required skills
            if not required_skills.issubset(vehicle_skills[v_idx]):
                continue

            # Cost = matrix distance from vehicle start to job
            job_idx = num_vehicles + jobs.index(job)
            cost = matrix[v_idx][job_idx]

            if cost < best_cost:
                best_cost = cost
                best_vehicle = v_idx

        if best_vehicle is not None:
            vehicle_jobs[best_vehicle].append(job)
            assigned_job_ids.add(job["id"])
        else:
            unassigned.append({"id": job["id"], "type": "job"})

    # Sequence each vehicle's jobs using nearest-neighbor
    routes = []
    for v_idx, vehicle in enumerate(vehicles):
        assigned = vehicle_jobs[v_idx]
        if not assigned:
            continue

        # Nearest-neighbor sequencing from depot
        ordered_jobs = []
        remaining = list(assigned)
        current_idx = v_idx  # Start at vehicle depot

        while remaining:
            best_job = None
            best_cost = float("inf")
            for job in remaining:
                job_idx = num_vehicles + jobs.index(job)
                cost = matrix[current_idx][job_idx]
                if cost < best_cost:
                    best_cost = cost
                    best_job = job
            
            ordered_jobs.append(best_job)
            current_idx = num_vehicles + jobs.index(best_job)
            remaining.remove(best_job)

        # Build steps
        steps = []
        steps.append({
            "type": "start",
            "location": vehicle["start"],
            "arrival": shift_start,
            "service": 0,
        })

        cumulative_time = shift_start
        prev_loc_index = v_idx

        for job in ordered_jobs:
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

        # Return to depot
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
