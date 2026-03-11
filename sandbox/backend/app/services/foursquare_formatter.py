"""
Foursquare Formatter — Compiles pipeline output into three Foursquare Studio-compliant
GeoJSON files:

  1. trips.json      — Trip Layer (4D LineStrings with timestamps)
  2. faults.geojson  — Point Layer (job sites with status/urgency)
  3. routes.geojson  — Line Layer (static routes with traffic multiplier)
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


def compile_trips_geojson(
    routes_data: list[dict[str, Any]],
    vehicles: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build trips.json — a GeoJSON FeatureCollection of LineStrings.
    
    CRITICAL: Every coordinate is [lon, lat, altitude, unix_timestamp].
    Each feature represents one engineer's full day of travel.
    """
    features = []

    for route in routes_data:
        vehicle_id = route["vehicle_id"]
        
        # Find vehicle name
        vehicle_name = f"Engineer_{vehicle_id}"
        for v in vehicles:
            if v["id"] == vehicle_id:
                vehicle_name = v.get("name", vehicle_name)
                break

        # Concatenate all leg coordinates into one continuous LineString
        all_coords = []
        for leg in route.get("legs", []):
            timestamped = leg.get("timestamped_coords", [])
            if all_coords and timestamped:
                # Avoid duplicating the junction point
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
                "engineer_id": vehicle_id,
                "engineer_name": vehicle_name,
                "num_legs": len(route.get("legs", [])),
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
    
    Properties: job_id, urgency_level, status (Assigned/Unassigned), eta.
    """
    # Build a set of assigned job IDs and their ETAs from the VROOM solution
    assigned_jobs: dict[int, dict] = {}
    for route in vroom_solution.get("routes", []):
        for step in route.get("steps", []):
            if step.get("type") == "job" and step.get("job"):
                assigned_jobs[step["job"]] = {
                    "vehicle_id": route.get("vehicle"),
                    "arrival": step.get("arrival", 0),
                }

    # Also track unassigned jobs from VROOM
    unassigned_ids = set()
    for unassigned in vroom_solution.get("unassigned", []):
        unassigned_ids.add(unassigned.get("id", unassigned))

    features = []
    for job in jobs:
        job_id = job["id"]
        is_assigned = job_id in assigned_jobs

        eta = None
        if is_assigned:
            eta = assigned_jobs[job_id].get("arrival")

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": job["location"],
            },
            "properties": {
                "job_id": job_id,
                "description": job.get("description", ""),
                "urgency_level": job.get("urgency_level", "medium"),
                "status": "Assigned" if is_assigned else "Unassigned",
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
    
    Properties: leg_id, engineer_id, traffic_multiplier (powers RAG styling).
    """
    features = []

    for route in routes_data:
        vehicle_id = route["vehicle_id"]
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
                    "leg_id": leg["leg_id"],
                    "engineer_id": vehicle_id,
                    "traffic_multiplier": leg.get("traffic_multiplier", 1.0),
                    "duration_s": leg.get("duration_s", 0),
                    "depart_unix": leg.get("depart_unix"),
                    "arrive_unix": leg.get("arrive_unix"),
                },
            })

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
    Compile all three Foursquare output files.
    
    Returns dict with keys: trips_geojson, faults_geojson, routes_geojson
    """
    return {
        "trips_geojson": compile_trips_geojson(routes_data, vehicles),
        "faults_geojson": compile_faults_geojson(jobs, vroom_solution),
        "routes_geojson": compile_routes_geojson(routes_data),
    }
