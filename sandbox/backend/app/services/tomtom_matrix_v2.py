"""
TomTom Matrix Routing API v2 Client — The London Traffic Cylinder

Replaces the O(N²) per-pair Routing v1 approach with a single POST
that returns an N×N durations matrix with time-dependent traffic data.

Supports both synchronous (≤100 locations) and asynchronous (>100) modes.
"""
import os
import json
import time
import math
import logging
import requests
import urllib3
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)


class TomTomTemporalWeighter:
    """
    Queries the TomTom Matrix Routing API v2 using a single POST request
    to compute an N×N travel duration matrix that accounts for time-of-day
    traffic conditions via the departAt parameter.
    """

    SYNC_URL = "https://api.tomtom.com/routing/matrix/2"
    ASYNC_SUBMIT_URL = "https://api.tomtom.com/routing/matrix/2"
    ASYNC_STATUS_URL = "https://api.tomtom.com/routing/matrix/2/{job_id}"
    ASYNC_DOWNLOAD_URL = "https://api.tomtom.com/routing/matrix/2/{job_id}/result"

    # TomTom sync limit: origins × destinations ≤ 2500 for sync
    SYNC_CELL_LIMIT = 2500

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("TOMTOM_API_KEY")
        if not self.api_key:
            logger.warning(
                "No TOMTOM_API_KEY found. Falling back to Haversine mock durations. "
                "Set the environment variable or pass api_key to constructor."
            )

    def compute_matrix(
        self,
        locations: List[List[float]],
        depart_at: str = "now",
        traffic: str = "historical",
        travel_mode: str = "van"
    ) -> List[List[int]]:
        """
        Compute the full N×N duration matrix for the given locations.

        Args:
            locations: List of [longitude, latitude] coordinate pairs.
            traffic: "historical", "live", or "none".
            travel_mode: "van", "car", "truck", etc.
            use_clustering: If True, uses 4 overlapping geospatial zones to shrink the matrix (default: True).

        Returns:
            N×N matrix of travel durations in seconds.
        """
        n = len(locations)
        if n < 2:
            return [[0]]

        # No API key → mock mode
        if not self.api_key or self.api_key == "MOCK_KEY":
            logger.info("Using Haversine mock matrix (no API key)")
            return self._mock_haversine_matrix(locations)
            
        # Strategy 1: Sparse Matrix via Overlapping Geographic Clustering
        # If N >= 20, the N^2 cost becomes significant. Cluster it.
        if "use_clustering" not in locals(): # handle signature change transparently
            use_clustering = True
        
        if n >= 20 and getattr(self, "use_clustering", True):
            return self._compute_clustered_matrix(locations, depart_at, traffic, travel_mode)

        # Build the TomTom point objects from [lon, lat] pairs
        points = [{"point": {"latitude": loc[1], "longitude": loc[0]}} for loc in locations]

        payload = {
            "origins": points,
            "destinations": points,
            "options": {
                "departAt": depart_at,
                "routeType": "fastest",
                "traffic": traffic,
                "travelMode": travel_mode
            }
        }

        cell_count = n * n
        if cell_count <= self.SYNC_CELL_LIMIT:
            return self._sync_request(payload, n)
        else:
            return self._async_request(payload, n)

    # ──────────────────────────────────────────────
    # Sparse Matrix Geographic Clustering
    # ──────────────────────────────────────────────
    def _compute_clustered_matrix(
        self,
        locations: List[List[float]],
        depart_at: str,
        traffic: str,
        travel_mode: str
    ) -> List[List[int]]:
        """Splits locations into 4 overlapping zones to avoid building an N^2 matrix of absurd cross-city pairs."""
        n = len(locations)
        matrix = [[999999] * n for _ in range(n)]
        for i in range(n): matrix[i][i] = 0
            
        # Trafalgar Square approx
        center_lon, center_lat = -0.1281, 51.5080
        # ~5km overlap margin
        overlap_lon, overlap_lat = 0.08, 0.05
        
        quadrants = {"NW": set(), "NE": set(), "SW": set(), "SE": set()}
        
        for i, loc in enumerate(locations):
            lon, lat = loc[0], loc[1]
            if lon <= center_lon + overlap_lon:
                if lat >= center_lat - overlap_lat: quadrants["NW"].add(i)
                if lat <= center_lat + overlap_lat: quadrants["SW"].add(i)
            if lon >= center_lon - overlap_lon:
                if lat >= center_lat - overlap_lat: quadrants["NE"].add(i)
                if lat <= center_lat + overlap_lat: quadrants["SE"].add(i)
                
        total_cells_billed = 0
        for q_name, indices_set in quadrants.items():
            indices = list(indices_set)
            k = len(indices)
            if k < 2: continue
            
            points = [{"point": {"latitude": locations[i][1], "longitude": locations[i][0]}} for i in indices]
            payload = {
                "origins": points, "destinations": points,
                "options": {"departAt": depart_at, "routeType": "fastest", "traffic": traffic, "travelMode": travel_mode}
            }
            
            total_cells_billed += (k * k)
            logger.info(f"TomTom Matrix v2 CLUSTER ({q_name}): {k}x{k} = {k*k} cells")
            
            if k * k <= self.SYNC_CELL_LIMIT:
                sub_matrix = self._sync_request(payload, k)
            else:
                sub_matrix = self._async_request(payload, k)
                
            # Stitch sub-matrix back into the master N^2 matrix
            for sq_i in range(k):
                for sq_j in range(k):
                    orig_i, orig_j = indices[sq_i], indices[sq_j]
                    if orig_i != orig_j:
                        val = sub_matrix[sq_i][sq_j]
                        if val > 0:
                            matrix[orig_i][orig_j] = min(matrix[orig_i][orig_j], val)
                            
        logger.info(f"Sparse clustering complete: billed {total_cells_billed} cells instead of {n*n} "
                    f"(saved {n*n - total_cells_billed} cells or {((n*n - total_cells_billed)/(n*n))*100:.1f}%)")
                    
        # Apply a highly penalized Haversine baseline for cross-city pairs that fell entirely out of overlaps
        fallback = self._mock_haversine_matrix(locations)
        for i in range(n):
            for j in range(n):
                if matrix[i][j] == 999999:
                    matrix[i][j] = fallback[i][j] * 3 # 3x penalty for uncomputed, very long cross-city diagonals
                    
        return matrix

    # ──────────────────────────────────────────────
    # Synchronous path (≤2500 cells)
    # ──────────────────────────────────────────────
    def _sync_request(self, payload: Dict[str, Any], n: int) -> List[List[int]]:
        params = {"key": self.api_key}

        logger.info(f"TomTom Matrix v2 SYNC: {n}×{n} = {n*n} cells")
        try:
            resp = requests.post(
                self.SYNC_URL,
                json=payload,
                params=params,
                verify=False,
                timeout=120
            )

            if resp.status_code == 200:
                return self._parse_response(resp.json(), n)
            elif resp.status_code == 202:
                # Server decided to process async even though we hit sync endpoint
                data = resp.json()
                job_id = data.get("jobId")
                if job_id:
                    logger.info(f"Server redirected to async. Job ID: {job_id}")
                    return self._poll_async_result(job_id, n)
                else:
                    logger.error(f"202 response but no jobId: {data}")
                    return self._mock_haversine_matrix_from_payload(payload, n)
            else:
                logger.error(f"TomTom Matrix v2 error {resp.status_code}: {resp.text[:500]}")
                return self._mock_haversine_matrix_from_payload(payload, n)

        except requests.exceptions.RequestException as e:
            logger.error(f"TomTom Matrix v2 request failed: {e}")
            return self._mock_haversine_matrix_from_payload(payload, n)

    # ──────────────────────────────────────────────
    # Asynchronous path (>2500 cells)
    # ──────────────────────────────────────────────
    def _async_request(self, payload: Dict[str, Any], n: int) -> List[List[int]]:
        params = {"key": self.api_key}

        logger.info(f"TomTom Matrix v2 ASYNC: {n}×{n} = {n*n} cells")
        try:
            resp = requests.post(
                self.ASYNC_SUBMIT_URL,
                json=payload,
                params=params,
                verify=False,
                timeout=30
            )

            if resp.status_code == 202:
                data = resp.json()
                job_id = data.get("jobId")
                if not job_id:
                    logger.error(f"Async submit returned 202 but no jobId: {data}")
                    return self._mock_haversine_matrix_from_payload(payload, n)
                return self._poll_async_result(job_id, n)
            else:
                logger.error(f"Async submit failed {resp.status_code}: {resp.text[:500]}")
                return self._mock_haversine_matrix_from_payload(payload, n)

        except requests.exceptions.RequestException as e:
            logger.error(f"Async submit request failed: {e}")
            return self._mock_haversine_matrix_from_payload(payload, n)

    def _poll_async_result(
        self, job_id: str, n: int, max_wait: int = 300, poll_interval: int = 5
    ) -> List[List[int]]:
        """Poll the async status endpoint until Completed, then download."""
        params = {"key": self.api_key}
        status_url = self.ASYNC_STATUS_URL.format(job_id=job_id)
        download_url = self.ASYNC_DOWNLOAD_URL.format(job_id=job_id)

        elapsed = 0
        while elapsed < max_wait:
            try:
                resp = requests.get(status_url, params=params, verify=False, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    state = data.get("state", "").lower()
                    logger.debug(f"Async job {job_id}: state={state} ({elapsed}s elapsed)")

                    if state == "completed":
                        # Download results
                        dl_resp = requests.get(
                            download_url, params=params, verify=False, timeout=60
                        )
                        if dl_resp.status_code == 200:
                            return self._parse_response(dl_resp.json(), n)
                        else:
                            logger.error(f"Async download failed: {dl_resp.status_code}")
                            return self._fallback_matrix(n)

                    elif state in ("failed", "error"):
                        logger.error(f"Async job {job_id} failed: {data}")
                        return self._fallback_matrix(n)

            except requests.exceptions.RequestException as e:
                logger.warning(f"Poll error for {job_id}: {e}")

            time.sleep(poll_interval)
            elapsed += poll_interval

        logger.error(f"Async job {job_id} timed out after {max_wait}s")
        return self._fallback_matrix(n)

    # ──────────────────────────────────────────────
    # Response parsing
    # ──────────────────────────────────────────────
    def _parse_response(self, response_data: Dict[str, Any], n: int) -> List[List[int]]:
        """
        Parse the TomTom Matrix v2 response into an N×N durations matrix.

        Expected response shape:
        {
            "data": [
                {
                    "originIndex": 0,
                    "destinationIndex": 1,
                    "routeSummary": {
                        "travelTimeInSeconds": 1234,
                        "lengthInMeters": 5678
                    }
                },
                ...
            ]
        }
        """
        matrix = [[0] * n for _ in range(n)]

        data_entries = response_data.get("data", [])
        if not data_entries:
            logger.warning("TomTom response has no 'data' entries. Using fallback.")
            return self._fallback_matrix(n)

        parsed_count = 0
        for entry in data_entries:
            oi = entry.get("originIndex", -1)
            di = entry.get("destinationIndex", -1)
            summary = entry.get("routeSummary", {})
            travel_time = summary.get("travelTimeInSeconds", 0)

            if 0 <= oi < n and 0 <= di < n:
                matrix[oi][di] = int(travel_time)
                parsed_count += 1

        expected = n * n - n  # diagonal is 0
        logger.info(f"Parsed {parsed_count} route entries (expected ~{expected} non-diagonal)")
        return matrix

    # ──────────────────────────────────────────────
    # Fallback / mock methods
    # ──────────────────────────────────────────────
    def _mock_haversine_matrix(self, locations: List[List[float]]) -> List[List[int]]:
        """Generate a mock duration matrix using Haversine distance / average speed."""
        n = len(locations)
        matrix = [[0] * n for _ in range(n)]
        avg_speed_mps = 8.3  # ~30 km/h London average

        for i in range(n):
            for j in range(n):
                if i != j:
                    dist = self._haversine(locations[i], locations[j])
                    matrix[i][j] = int(dist / avg_speed_mps)
        return matrix

    def _mock_haversine_matrix_from_payload(
        self, payload: Dict[str, Any], n: int
    ) -> List[List[int]]:
        """Extract locations from payload and build Haversine mock."""
        origins = payload.get("origins", [])
        locations = [
            [p["point"]["longitude"], p["point"]["latitude"]] for p in origins
        ]
        return self._mock_haversine_matrix(locations)

    def _fallback_matrix(self, n: int) -> List[List[int]]:
        """Last-resort zero matrix."""
        logger.warning(f"Using zero-fallback {n}×{n} matrix")
        return [[0] * n for _ in range(n)]

    @staticmethod
    def _haversine(coord1: List[float], coord2: List[float]) -> float:
        """
        Calculate great-circle distance in meters between two [lon, lat] points.
        """
        lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
        lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])

        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        return 6371000 * c  # Earth radius in meters
