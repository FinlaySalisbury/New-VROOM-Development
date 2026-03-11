"""
Data Generator — Creates randomized but realistic engineer/job payloads
for VROOM simulation within the Greater London bounding box.
"""
import random
import math
from typing import Any


# Greater London bounding box
LONDON_BBOX = {
    "min_lon": -0.5100,
    "max_lon": 0.3340,
    "min_lat": 51.2868,
    "max_lat": 51.6919,
}

# Central London zone (tighter box for higher job density)
CENTRAL_BBOX = {
    "min_lon": -0.1800,
    "max_lon": 0.0200,
    "min_lat": 51.4800,
    "max_lat": 51.5400,
}

# Skill definitions matching existing skills.json
SKILLS_MAP: dict[str, int] = {
    "traffic_light_repair": 1,
    "cctv_maintenance": 2,
    "fiber_splicing": 3,
    "high_voltage": 4,
    "sign_installation": 5,
    "road_marking": 6,
}

SKILL_NAMES = list(SKILLS_MAP.keys())

# Job description templates
JOB_DESCRIPTIONS = [
    "Fix traffic light at {location}",
    "Routine CCTV check at {location}",
    "Replace signal controller at {location}",
    "Fibre splice at {location} junction",
    "CCTV column replacement at {location}",
    "Road marking renewal at {location}",
    "Sign installation at {location}",
    "High voltage switchgear inspection at {location}",
    "Emergency traffic light fault at {location}",
    "Pedestrian crossing repair at {location}",
]

# London location names for descriptions
LONDON_LOCATIONS = [
    "Westminster", "Covent Garden", "Stratford", "Deptford", "Finsbury Park",
    "Camden", "Brixton", "Hackney", "Greenwich", "Ealing", "Croydon",
    "Islington", "Lewisham", "Barking", "Hammersmith", "Wembley", "Harrow",
    "Enfield", "Wimbledon", "Bromley", "Southwark", "Tower Hamlets",
    "Shoreditch", "Dalston", "Peckham", "Balham", "Clapham", "Putney",
    "Richmond", "Kingston", "Hounslow", "Brentford", "Acton", "Chiswick",
    "Fulham", "Chelsea", "Kensington", "Notting Hill", "Paddington",
    "Marylebone", "Euston", "Kings Cross", "Angel", "Bethnal Green",
    "Mile End", "Bow", "Poplar", "Canary Wharf", "Woolwich", "Eltham",
]


def _random_coord_in_bbox(bbox: dict[str, float]) -> list[float]:
    """Generate a random [lon, lat] within a bounding box."""
    lon = random.uniform(bbox["min_lon"], bbox["max_lon"])
    lat = random.uniform(bbox["min_lat"], bbox["max_lat"])
    return [round(lon, 6), round(lat, 6)]


def _random_central_biased_coord() -> list[float]:
    """70% chance of Central London, 30% Greater London — realistic job density."""
    if random.random() < 0.7:
        return _random_coord_in_bbox(CENTRAL_BBOX)
    return _random_coord_in_bbox(LONDON_BBOX)


def generate_engineers(count: int, shift_start_unix: int) -> list[dict[str, Any]]:
    """
    Generate randomized engineer (vehicle) definitions.
    
    Args:
        count: Number of engineers to generate.
        shift_start_unix: Unix timestamp for the shift start (e.g., 07:00 UTC).
        
    Returns:
        List of VROOM-compatible vehicle dicts.
    """
    engineers = []
    shift_duration = random.choice([8 * 3600, 9 * 3600, 10 * 3600])  # 8-10 hour shifts

    for i in range(count):
        # Engineers start from various depots around London
        start_coord = _random_coord_in_bbox(LONDON_BBOX)
        
        # Random subset of 2-4 skills per engineer
        num_skills = random.randint(2, min(4, len(SKILL_NAMES)))
        skill_names = random.sample(SKILL_NAMES, num_skills)
        skill_ids = [SKILLS_MAP[s] for s in skill_names]

        # Stagger start times slightly (±30 min)
        offset = random.randint(-1800, 1800)
        eng_start = shift_start_unix + offset

        engineers.append({
            "id": i + 1,
            "name": f"Engineer_{i + 1}",
            "start": start_coord,
            "end": start_coord,  # Return to depot
            "skills": skill_ids,
            "time_window": [eng_start, eng_start + shift_duration],
        })

    return engineers


def generate_jobs(
    count: int, shift_start_unix: int
) -> list[dict[str, Any]]:
    """
    Generate randomized job definitions.
    
    Args:
        count: Number of jobs to generate.
        shift_start_unix: Unix timestamp for the shift start.
        
    Returns:
        List of VROOM-compatible job dicts.
    """
    jobs = []
    shift_end_unix = shift_start_unix + 10 * 3600  # 10-hour service window

    for i in range(count):
        location = _random_central_biased_coord()

        # 1-3 required skills per job
        num_skills = random.randint(1, 3)
        skill_names = random.sample(SKILL_NAMES, num_skills)
        skill_ids = [SKILLS_MAP[s] for s in skill_names]

        # Service time: 15 min to 2 hours
        service_time = random.choice([900, 1200, 1800, 2700, 3600, 5400, 7200])

        # Priority: 1 (highest) to 100 (lowest)
        priority = random.randint(1, 100)

        # Urgency for Foursquare visualization (derived from priority)
        if priority <= 20:
            urgency = "critical"
        elif priority <= 50:
            urgency = "high"
        elif priority <= 80:
            urgency = "medium"
        else:
            urgency = "low"

        # Time window: full shift or restricted based on urgency
        if urgency == "critical":
            tw_start = shift_start_unix
            tw_end = shift_start_unix + 4 * 3600  # Must be done within 4 hours
        else:
            tw_start = shift_start_unix
            tw_end = shift_end_unix

        # Description
        loc_name = random.choice(LONDON_LOCATIONS)
        desc_template = random.choice(JOB_DESCRIPTIONS)
        description = desc_template.format(location=loc_name)

        jobs.append({
            "id": 1000 + i,
            "description": description,
            "location": location,
            "skills": skill_ids,
            "service": service_time,
            "time_windows": [[tw_start, tw_end]],
            "priority": priority,
            "urgency_level": urgency,
        })

    return jobs


def generate_locations(
    engineers: list[dict[str, Any]], jobs: list[dict[str, Any]]
) -> list[list[float]]:
    """
    Build the unified locations list for the VROOM matrix.
    Order: [vehicle_start_0, ..., vehicle_start_N, job_loc_0, ..., job_loc_M]
    
    This matches the indexing expected by VroomSolverInterface._build_payload.
    """
    locations = [eng["start"] for eng in engineers]
    locations.extend(job["location"] for job in jobs)
    return locations


def generate_scenario(
    num_engineers: int, num_jobs: int, shift_start_unix: int
) -> dict[str, Any]:
    """
    Generate a complete simulation scenario.
    
    Returns:
        Dict with keys: vehicles, jobs, locations, skills_map, shift_start
    """
    engineers = generate_engineers(num_engineers, shift_start_unix)
    jobs = generate_jobs(num_jobs, shift_start_unix)
    locations = generate_locations(engineers, jobs)

    return {
        "vehicles": engineers,
        "jobs": jobs,
        "locations": locations,
        "skills_map": SKILLS_MAP,
        "shift_start": shift_start_unix,
    }
