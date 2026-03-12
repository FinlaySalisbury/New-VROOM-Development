"""
Foursquare Formatter — Compiles pipeline output into Foursquare Studio-compliant
GeoJSON files with per-engineer color-coded layers.

Outputs:
  1. trips.json      — Trip Layer (4D LineStrings with timestamps)
  2. faults.geojson  — Point Layer (job sites with status/urgency)
  3. routes.geojson  — Line Layer (static routes with traffic multiplier)
  4. combined.geojson — All layers merged (routes + depots + jobs)
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Engineer route colors — same as frontend ROUTE_COLORS
ENGINEER_COLORS = [
    "#4285f4", "#ea4335", "#34a853", "#fbbc04", "#9c27b0",
    "#00acc1", "#ff7043", "#8bc34a", "#e91e63", "#3f51b5",
]


def _get_engineer_color(vehicle_id: int) -> str:
    """Get the color for an engineer based on their ID (1-indexed)."""
    idx = ((vehicle_id - 1) % len(ENGINEER_COLORS) + len(ENGINEER_COLORS)) % len(ENGINEER_COLORS)
    return ENGINEER_COLORS[idx]


def _build_vehicle_lookup(vehicles: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Build a lookup dict from vehicle list."""
    return {v["id"]: v for v in vehicles}


def compile_trips_geojson(
    routes_data: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build trips.json — a GeoJSON FeatureCollection of LineStrings.
    
    CRITICAL: Every coordinate is [lon, lat, altitude, unix_timestamp].
    Each feature represents one engineer's full day of travel.
    """
    vehicle_lookup = _build_vehicle_lookup(vehicles)
    features = []

    for route in routes_data:
        vehicle_id = route["vehicle_id"]
        vehicle = vehicle_lookup.get(vehicle_id, {})
        color = _get_engineer_color(vehicle_id)
        vehicle_name = vehicle.get("name", f"Engineer_{vehicle_id}")
        skills = vehicle.get("skills", [])

        # Concatenate all leg coordinates into one continuous LineString
        all_coords = []
        for leg in route.get("legs", []):
            timestamped = leg.get("timestamped_coords", [])
            if all_coords and timestamped:
                if (all_coords[-1][0] == timestamped[0][0] and 
                    all_coords[-1][1] == timestamped[0][1]):
                    timestamped = timestamped[1:]
            all_coords.extend(timestamped)

        if len(all_coords) < 2:
            continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": all_coords,
            },
            "properties": {
                "layer": "trips",
                "engineer_id": vehicle_id,
                "engineer_name": vehicle_name,
                "engineer_color": color,
                "engineer_skills": skills,
                "availability_start": route.get("availability_start"),
                "availability_end": route.get("availability_end"),
                "num_legs": len(route.get("legs", [])),
                "num_jobs": route.get("num_jobs_assigned", 0),
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def compile_faults_geojson(
    jobs: list[dict[str, Any]],
    vroom_solution: dict[str, Any],
) -> dict[str, Any]:
    """
    Build faults.geojson — a GeoJSON FeatureCollection of Points.
    
    Properties: job_id, urgency_level, status, engineer_color for assigned jobs.
    """
    assigned_jobs: dict[int, dict] = {}
    for route in vroom_solution.get("routes", []):
        for step in route.get("steps", []):
            if step.get("type") == "job" and step.get("job"):
                assigned_jobs[step["job"]] = {
                    "vehicle_id": route.get("vehicle"),
                    "arrival": step.get("arrival", 0),
                }

    unassigned_ids = set()
    for unassigned in vroom_solution.get("unassigned", []):
        unassigned_ids.add(unassigned.get("id", unassigned))

    features = []
    for job in jobs:
        job_id = job["id"]
        is_assigned = job_id in assigned_jobs
        eta = None
        assigned_vehicle_id = None
        engineer_color = None

        if is_assigned:
            assigned_vehicle_id = assigned_jobs[job_id].get("vehicle_id")
            eta = assigned_jobs[job_id].get("arrival")
            if assigned_vehicle_id:
                engineer_color = _get_engineer_color(assigned_vehicle_id)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": job["location"],
            },
            "properties": {
                "layer": "jobs",
                "job_id": job_id,
                "description": job.get("description", ""),
                "urgency_level": job.get("urgency_level", "medium"),
                "required_skills": job.get("skills", []),
                "status": "Assigned" if is_assigned else "Unassigned",
                "assigned_engineer_id": assigned_vehicle_id,
                "engineer_color": engineer_color,
                "eta": eta,
                "service_time_s": job.get("service", 0),
                "priority": job.get("priority", 50),
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def compile_routes_geojson(
    routes_data: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build routes.geojson — a GeoJSON FeatureCollection of LineStrings.
    
    Each leg includes engineer metadata and color for external tool rendering.
    """
    features = []

    for route in routes_data:
        vehicle_id = route["vehicle_id"]
        color = _get_engineer_color(vehicle_id)
        vehicle_name = route.get("vehicle_name", f"Engineer_{vehicle_id}")
        skills = route.get("vehicle_skills", [])

        for leg in route.get("legs", []):
            geometry = leg.get("geometry", [])
            if len(geometry) < 2:
                continue

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": geometry,
                },
                "properties": {
                    "layer": "routes",
                    "leg_id": leg["leg_id"],
                    "engineer_id": vehicle_id,
                    "engineer_name": vehicle_name,
                    "engineer_color": color,
                    "engineer_skills": skills,
                    "traffic_multiplier": leg.get("traffic_multiplier", 1.0),
                    "duration_s": leg.get("duration_s", 0),
                    "free_flow_duration_s": leg.get("free_flow_duration_s"),
                    "distance_m": leg.get("distance_m"),
                    "depart_unix": leg.get("depart_unix"),
                    "arrive_unix": leg.get("arrive_unix"),
                },
            })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def compile_combined_geojson(
    routes_data: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    vroom_solution: dict[str, Any],
) -> dict[str, Any]:
    """
    Build combined.geojson — merges routes, depots, and jobs into one
    FeatureCollection with a `layer` property for filtering.
    """
    features = []

    # --- Route legs ---
    routes_fc = compile_routes_geojson(routes_data)
    features.extend(routes_fc["features"])

    # --- Depot markers ---
    for route in routes_data:
        vehicle_id = route["vehicle_id"]
        color = _get_engineer_color(vehicle_id)
        vehicle_name = route.get("vehicle_name", f"Engineer_{vehicle_id}")

        if route.get("vehicle_start"):
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": route["vehicle_start"],
                },
                "properties": {
                    "layer": "depots",
                    "engineer_id": vehicle_id,
                    "engineer_name": vehicle_name,
                    "engineer_color": color,
                    "engineer_skills": route.get("vehicle_skills", []),
                    "availability_start": route.get("availability_start"),
                    "availability_end": route.get("availability_end"),
                    "num_jobs_assigned": route.get("num_jobs_assigned", 0),
                    "marker_type": "depot",
                },
            })

    # --- Job points ---
    faults_fc = compile_faults_geojson(jobs, vroom_solution)
    features.extend(faults_fc["features"])

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def compile_all(
    routes_data: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    vroom_solution: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """
    Compile all output files including the combined layer.
    """
    return {
        "trips_geojson": compile_trips_geojson(routes_data, vehicles),
        "faults_geojson": compile_faults_geojson(jobs, vroom_solution),
        "routes_geojson": compile_routes_geojson(routes_data),
        "combined_geojson": compile_combined_geojson(routes_data, vehicles, jobs, vroom_solution),
    }
