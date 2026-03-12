"""
Matrix Engine — 3-strategy matrix orchestrator for the Simulation Sandbox.

Routes matrix generation through one of three strategies:
  1. Naive     — Haversine at flat 30 km/h, no traffic awareness
  2. In-House  — Haversine × zone/timeslot multipliers (TomTomClient mock)
  3. TomTom    — Live N×N matrix via TomTom Matrix Routing API v2
"""
import math
import logging
from typing import Optional
from datetime import datetime, timezone

from app.core.tomtom_client import TomTomClient
from app.services.matrix_weighter import TrafficMatrixWeighter

logger = logging.getLogger(__name__)

# Average speed for naive Haversine matrix (meters per second)
NAIVE_SPEED_MPS = 30_000 / 3600  # 30 km/h ≈ 8.33 m/s


def _haversine(coord1: list[float], coord2: list[float]) -> float:
    """Great-circle distance in meters between two [lon, lat] points."""
    lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
    lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def compute_naive_matrix(locations: list[list[float]]) -> list[list[int]]:
    """
    Strategy 1: Pure Haversine distance / flat speed.
    No traffic awareness at all.
    """
    n = len(locations)
    matrix = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                dist = _haversine(locations[i], locations[j])
                matrix[i][j] = int(dist / NAIVE_SPEED_MPS)
    logger.info(f"Naive matrix computed: {n}×{n}")
    return matrix


def compute_inhouse_matrix(
    locations: list[list[float]], shift_start: int
) -> list[list[int]]:
    """
    Strategy 2: Haversine base × in-house zone/timeslot multipliers.
    Uses TomTomClient's _simulate_multiplier (3-zone / 6-timeslot model).
    """
    # Create a TomTomClient with mock key to trigger simulator path
    client = TomTomClient(api_key="MOCK_KEY")
    
    n = len(locations)
    base_matrix = compute_naive_matrix(locations)
    weighted = [[0] * n for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i != j:
                multiplier = client._simulate_multiplier(
                    shift_start, 
                    origin=locations[i], 
                    destination=locations[j]
                )
                weighted[i][j] = int(base_matrix[i][j] * multiplier)
    
    logger.info(f"In-house matrix computed: {n}×{n} with traffic multipliers")
    return weighted


def compute_tomtom_matrix(
    locations: list[list[float]], shift_start: int, api_key: str
) -> list[list[int]]:
    """
    Strategy 3: Live TomTom Matrix Routing API v2.
    Single POST request returning N×N matrix with predictive traffic.
    """
    weighter = TrafficMatrixWeighter(api_key=api_key)
    matrix = weighter.compute_time_dependent_matrix(
        locations=locations,
        departure_time=shift_start,
        traffic="historical",
        travel_mode="van",
    )
    logger.info(f"TomTom premium matrix computed: {len(locations)}×{len(locations)}")
    return matrix


def get_matrix(
    strategy: str,
    locations: list[list[float]],
    shift_start: int,
    api_key: Optional[str] = None,
) -> list[list[int]]:
    """
    Route to the appropriate matrix computation strategy.
    
    Args:
        strategy: 'naive', 'inhouse', or 'tomtom_premium'
        locations: List of [lon, lat] coordinates
        shift_start: Unix timestamp of shift start
        api_key: TomTom API key (required for tomtom_premium)
    
    Returns:
        N×N duration matrix in seconds
    """
    if strategy == "naive":
        return compute_naive_matrix(locations)
    elif strategy == "inhouse":
        return compute_inhouse_matrix(locations, shift_start)
    elif strategy == "tomtom_premium":
        if not api_key or api_key == "MOCK_KEY":
            logger.warning("TomTom Premium requested but no valid API key; falling back to in-house")
            return compute_inhouse_matrix(locations, shift_start)
        return compute_tomtom_matrix(locations, shift_start, api_key)
    else:
        raise ValueError(f"Unknown strategy: {strategy}")
