"""
HERE Matrix Routing API v8 Client — Drop-in alternative to TomTomTemporalWeighter.

Computes N×N travel time matrices using HERE's Matrix Routing v8 endpoint.
Supports sync (≤2500 cells) and async (>2500 cells) modes.

Key differences from TomTom Matrix v2:
  - POST body uses {"lat": ..., "lng": ...} objects (not {"point": {"latitude": ..., "longitude": ...}})
  - Response is a flat 1D array: travelTimes[i * n + j]
  - Async: uses statusUrl from response (not reconstructed URLs)
  - regionDefinition required for traffic-aware matrices
  - transportMode=truck (not travelMode=van)
"""
import os
import math
import time
import logging
import requests
import urllib3
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)


class HereMatrixClient:
    """
    Queries the HERE Matrix Routing API v8 using a single POST request
    to compute an N×N travel duration matrix that accounts for time-of-day
    traffic conditions via the departureTime parameter.
    """

    MATRIX_URL = "https://matrix.router.hereapi.com/v8/matrix"

    # Sync limit: origins × destinations ≤ 2500 for sync mode
    SYNC_CELL_LIMIT = 2500

    # Vehicle configuration for 3.5t service van
    TRUCK_PARAMS = {
        "grossWeight": 3500,   # kg
        "height": 270,         # cm
        "width": 200,          # cm
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("HERE_API_KEY")
        if not self.api_key:
            logger.warning(
                "No HERE_API_KEY found. Falling back to Haversine mock durations. "
                "Set the environment variable or pass api_key to constructor."
            )

        # Setup session with retry adapter
        self.session = requests.Session()
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry
        retry_strategy = Retry(
            total=5,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST", "GET"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def compute_matrix(
        self,
        locations: List[List[float]],
        depart_at: str = "now",
        traffic: str = "historical",
        travel_mode: str = "truck"
    ) -> List[List[int]]:
        """
        Compute the full N×N duration matrix for the given locations.

        Args:
            locations: List of [longitude, latitude] coordinate pairs.
            depart_at: Departure time — Unix timestamp (int), ISO string, or "now".
            traffic: "historical", "live", or "none".
            travel_mode: "truck", "car", etc.

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

        # Geographic clustering for large matrices (N >= 20)
        if n >= 20:
            return self._compute_clustered_matrix(locations, depart_at, traffic, travel_mode)

        # Build HERE points from [lon, lat] pairs
        points = [{"lat": loc[1], "lng": loc[0]} for loc in locations]

        # Determine departureTime based on traffic mode
        departure_time = self._resolve_departure_time(depart_at, traffic)

        payload = {
            "origins": points,
            "destinations": points,
            "regionDefinition": {"type": "autoCircle"},
            "transportMode": travel_mode,
            "matrixAttributes": ["travelTimes"],
        }

        # Add vehicle params for truck mode
        if travel_mode == "truck":
            payload["truck"] = self.TRUCK_PARAMS

        # Set departureTime based on traffic mode
        if departure_time == "any":
            payload["departureTime"] = "any"
        elif departure_time is not None:
            payload["departureTime"] = departure_time

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
        """Splits locations into 4 overlapping zones to reduce matrix size."""
        n = len(locations)
        matrix = [[999999] * n for _ in range(n)]
        for i in range(n):
            matrix[i][i] = 0

        # Trafalgar Square approx
        center_lon, center_lat = -0.1281, 51.5080
        # ~5km overlap margin
        overlap_lon, overlap_lat = 0.08, 0.05

        quadrants = {"NW": set(), "NE": set(), "SW": set(), "SE": set()}

        for i, loc in enumerate(locations):
            lon, lat = loc[0], loc[1]
            if lon <= center_lon + overlap_lon:
                if lat >= center_lat - overlap_lat:
                    quadrants["NW"].add(i)
                if lat <= center_lat + overlap_lat:
                    quadrants["SW"].add(i)
            if lon >= center_lon - overlap_lon:
                if lat >= center_lat - overlap_lat:
                    quadrants["NE"].add(i)
                if lat <= center_lat + overlap_lat:
                    quadrants["SE"].add(i)

        total_cells_billed = 0
        for q_name, indices_set in quadrants.items():
            indices = list(indices_set)
            k = len(indices)
            if k < 2:
                continue

            points = [{"lat": locations[i][1], "lng": locations[i][0]} for i in indices]

            departure_time = self._resolve_departure_time(depart_at, traffic)
            payload = {
                "origins": points,
                "destinations": points,
                "regionDefinition": {"type": "autoCircle"},
                "transportMode": "truck",
                "matrixAttributes": ["travelTimes"],
            }
            if travel_mode == "truck":
                payload["truck"] = self.TRUCK_PARAMS
            if departure_time == "any":
                payload["departureTime"] = "any"
            elif departure_time is not None:
                payload["departureTime"] = departure_time

            # HERE billing: 5 × MAX(S,D) when both ≥ 5
            total_cells_billed += (5 * max(k, k) if k >= 5 else k * k)
            logger.info(f"HERE Matrix v8 CLUSTER ({q_name}): {k}x{k}")

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

        logger.info(
            f"Sparse clustering complete: ~{total_cells_billed} HERE transactions "
            f"instead of {n*n} cells"
        )

        # Apply penalized Haversine for cross-city pairs outside all overlaps
        fallback = self._mock_haversine_matrix(locations)
        for i in range(n):
            for j in range(n):
                if matrix[i][j] == 999999:
                    matrix[i][j] = fallback[i][j] * 3  # 3x penalty

        return matrix

    # ──────────────────────────────────────────────
    # Synchronous path (≤2500 cells)
    # ──────────────────────────────────────────────
    def _sync_request(self, payload: Dict[str, Any], n: int) -> List[List[int]]:
        params = {"apiKey": self.api_key, "async": "false"}

        logger.info(f"HERE Matrix v8 SYNC: {n}×{n} = {n*n} cells")
        try:
            resp = self.session.post(
                self.MATRIX_URL,
                json=payload,
                params=params,
                verify=False,
                timeout=120
            )

            if resp.status_code == 200:
                return self._parse_response(resp.json(), n)
            elif resp.status_code == 202:
                # Server decided to process async
                data = resp.json()
                status_url = data.get("statusUrl")
                if status_url:
                    logger.info(f"Server redirected to async. Status URL: {status_url[:80]}...")
                    return self._poll_async_result(status_url, n)
                else:
                    logger.error(f"202 response but no statusUrl: {data}")
                    return self._mock_haversine_matrix_from_payload(payload, n)
            else:
                logger.error(f"HERE Matrix v8 error {resp.status_code}: {resp.text[:500]}")
                return self._mock_haversine_matrix_from_payload(payload, n)

        except requests.exceptions.RequestException as e:
            logger.error(f"HERE Matrix v8 request failed: {e}")
            return self._mock_haversine_matrix_from_payload(payload, n)

    # ──────────────────────────────────────────────
    # Asynchronous path (>2500 cells)
    # ──────────────────────────────────────────────
    def _async_request(self, payload: Dict[str, Any], n: int) -> List[List[int]]:
        params = {"apiKey": self.api_key}  # async=true is the default

        logger.info(f"HERE Matrix v8 ASYNC: {n}×{n} = {n*n} cells")
        try:
            resp = self.session.post(
                self.MATRIX_URL,
                json=payload,
                params=params,
                verify=False,
                timeout=30
            )

            if resp.status_code == 202:
                data = resp.json()
                status_url = data.get("statusUrl")
                if not status_url:
                    logger.error(f"Async submit returned 202 but no statusUrl: {data}")
                    return self._mock_haversine_matrix_from_payload(payload, n)
                return self._poll_async_result(status_url, n)
            else:
                logger.error(f"Async submit failed {resp.status_code}: {resp.text[:500]}")
                return self._mock_haversine_matrix_from_payload(payload, n)

        except requests.exceptions.RequestException as e:
            logger.error(f"Async submit request failed: {e}")
            return self._mock_haversine_matrix_from_payload(payload, n)

    def _poll_async_result(
        self, status_url: str, n: int, max_wait: int = 300, poll_interval: int = 5
    ) -> List[List[int]]:
        """
        Poll the async status endpoint until complete, then download result.

        CRITICAL: Use the EXACT statusUrl returned by HERE — do not reconstruct it.
        The URL includes load-balancer routing hints.
        """
        elapsed = 0
        while elapsed < max_wait:
            try:
                # Must re-attach apiKey on each poll
                resp = self.session.get(
                    status_url,
                    params={"apiKey": self.api_key},
                    verify=False,
                    timeout=15,
                    allow_redirects=False
                )

                if resp.status_code == 200:
                    # Still processing — check response for status
                    data = resp.json()
                    status = data.get("status", "").lower()
                    logger.debug(f"Async poll: status={status} ({elapsed}s elapsed)")

                    if status == "completed":
                        # Result is inline
                        return self._parse_response(data, n)
                    elif status in ("failed", "error"):
                        logger.error(f"Async job failed: {data}")
                        return self._fallback_matrix(n)

                elif resp.status_code == 303:
                    # Complete — follow redirect to download result
                    result_url = resp.headers.get("Location")
                    if result_url:
                        dl_resp = self.session.get(
                            result_url,
                            params={"apiKey": self.api_key},
                            verify=False,
                            timeout=60
                        )
                        if dl_resp.status_code == 200:
                            return self._parse_response(dl_resp.json(), n)
                        else:
                            logger.error(f"Async download failed: {dl_resp.status_code}")
                            return self._fallback_matrix(n)
                    else:
                        logger.error("303 redirect but no Location header")
                        return self._fallback_matrix(n)

            except requests.exceptions.RequestException as e:
                logger.warning(f"Poll error: {e}")

            time.sleep(poll_interval)
            elapsed += poll_interval

        logger.error(f"Async job timed out after {max_wait}s")
        return self._fallback_matrix(n)

    # ──────────────────────────────────────────────
    # Response parsing
    # ──────────────────────────────────────────────
    def _parse_response(self, response_data: Dict[str, Any], n: int) -> List[List[int]]:
        """
        Parse the HERE Matrix v8 response into an N×N durations matrix.

        HERE returns flat 1D arrays:
          matrix.travelTimes[k] where k = origin_idx * numDestinations + dest_idx

        Values:
          - Travel time in seconds
          - 0 for origin == destination
          - -1 for unreachable pairs (we convert to Haversine fallback × 3)
        """
        matrix_data = response_data.get("matrix", {})
        travel_times = matrix_data.get("travelTimes", [])
        num_origins = matrix_data.get("numOrigins", n)
        num_destinations = matrix_data.get("numDestinations", n)

        if not travel_times:
            logger.warning("HERE response has no travelTimes. Using fallback.")
            return self._fallback_matrix(n)

        matrix = [[0] * n for _ in range(n)]
        parsed_count = 0

        for i in range(min(num_origins, n)):
            for j in range(min(num_destinations, n)):
                k = i * num_destinations + j
                if k < len(travel_times):
                    val = travel_times[k]
                    if val == -1:
                        # Unreachable — will be filled by fallback
                        matrix[i][j] = 999999
                    else:
                        matrix[i][j] = int(val)
                        parsed_count += 1

        expected = n * n - n  # diagonal is 0
        logger.info(f"Parsed {parsed_count} travel times (expected ~{expected} non-diagonal)")

        # Replace unreachable (-1) markers with large fallback
        for i in range(n):
            for j in range(n):
                if matrix[i][j] == 999999 and i != j:
                    matrix[i][j] = 7200  # 2-hour fallback for unreachable

        return matrix

    # ──────────────────────────────────────────────
    # Departure time resolution
    # ──────────────────────────────────────────────
    def _resolve_departure_time(
        self, depart_at: str, traffic: str
    ) -> Optional[str]:
        """
        Convert depart_at + traffic mode into HERE's departureTime parameter.

        HERE Matrix v8 requires RFC 3339 (ISO 8601 with timezone).
        Departure times must be in the future; past times are rejected.

        Returns:
          - RFC 3339 string for historical traffic
          - None for live traffic (HERE uses current time by default)
          - "any" for no traffic
        """
        if traffic == "none":
            return "any"

        if traffic == "live":
            # Omit departureTime — HERE defaults to current time with live traffic
            return None

        # Historical traffic — need a specific departure time
        if depart_at == "now":
            return None  # Use current time

        # Check if depart_at is a Unix timestamp (int or numeric string)
        try:
            ts = int(depart_at)
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            
            # HERE requires future departure times for traffic prediction
            now = datetime.now(tz=timezone.utc)
            if dt < now:
                # Shift to same time tomorrow (or next valid date)
                from datetime import timedelta
                days_ahead = (now - dt).days + 1
                dt = dt + timedelta(days=days_ahead)
                logger.info(f"HERE: shifted past departure time {days_ahead} days forward to {dt.isoformat()}")
            
            # HERE requires RFC 3339 format with timezone
            return dt.strftime("%Y-%m-%dT%H:%M:%S+00:00")
        except (ValueError, TypeError):
            pass

        # Already an ISO string — ensure it has timezone suffix
        if isinstance(depart_at, str) and "T" in depart_at:
            # Add UTC timezone if missing
            if "+" not in depart_at and "Z" not in depart_at:
                return depart_at + "+00:00"
            return depart_at.replace("Z", "+00:00")

        return None

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
        locations = [[p["lng"], p["lat"]] for p in origins]
        return self._mock_haversine_matrix(locations)

    def _fallback_matrix(self, n: int) -> List[List[int]]:
        """Last-resort zero matrix."""
        logger.warning(f"Using zero-fallback {n}×{n} matrix")
        return [[0] * n for _ in range(n)]

    @staticmethod
    def _haversine(coord1: List[float], coord2: List[float]) -> float:
        """Calculate great-circle distance in meters between two [lon, lat] points."""
        lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
        lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        return 6371000 * c  # Earth radius in meters
