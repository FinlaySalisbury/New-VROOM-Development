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
            depart_at: ISO 8601 timestamp or "now" for live traffic.
            traffic: "historical", "live", or "none".
            travel_mode: "van", "car", "truck", etc.

        Returns:
            N×N matrix of travel durations in seconds.
        """
        n = len(locations)
        if n < 2:
            return [[0]]

        # No API key → mock mode
        if not self.api_key:
            logger.info("Using Haversine mock matrix (no API key)")
            return self._mock_haversine_matrix(locations)

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
