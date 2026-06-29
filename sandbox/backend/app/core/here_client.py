"""
HERE Routing API v8 Client — Drop-in alternative to TomTomClient.

Provides the same interface (get_traffic_multiplier, get_route_duration,
get_route_with_geometry) but hits HERE's endpoints instead.

Key differences from TomTom:
  - Coordinates: HERE uses origin=lat,lng (query params), internally we use [lon, lat]
  - Transport: transportMode=truck with vehicle configuration
  - Polyline: HERE Flexible Polyline Encoding (decoded via flexpolyline library)
  - Traffic: always-on when departureTime is set; baseDuration = free-flow
  - Auth: ?apiKey=... instead of ?key=...
"""
import math
import requests
import urllib3
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

# Enforce corporate IT standards
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

# Optional: Flexible Polyline decoder for HERE route geometries
try:
    import flexpolyline
    HAS_FLEXPOLYLINE = True
except ImportError:
    HAS_FLEXPOLYLINE = False
    logger.warning(
        "flexpolyline not installed — HERE route geometries will use straight-line fallback. "
        "Install with: pip install flexpolyline"
    )


class HereClient:
    """
    Client for interacting with the HERE Routing API v8 to retrieve traffic intelligence.
    Provides the same interface as TomTomClient for seamless strategy switching.
    """

    BASE_URL = "https://router.hereapi.com/v8/routes"

    # Vehicle configuration for 3.5t service van
    VEHICLE_PARAMS = {
        "vehicle[grossWeight]": "3500",   # kg
        "vehicle[height]": "270",          # cm
        "vehicle[width]": "200",           # cm
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._route_cache: Dict[str, Dict[str, Any]] = {}

        # Setup session with automatic retries for rate limiting (429) and server errors
        self.session = requests.Session()
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry
        retry_strategy = Retry(
            total=5,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def get_traffic_multiplier(
        self, origin: List[float], destination: List[float], departure_time: int
    ) -> float:
        """
        Queries HERE for a route and calculates the traffic multiplier
        (duration / baseDuration). A value > 1.0 means traffic is slower than free-flow.

        Args:
            origin: [longitude, latitude]
            destination: [longitude, latitude]
            departure_time: Unix timestamp of departure

        Returns:
            float: Traffic multiplier. Returns 1.0 on failure.
        """
        if not self.api_key or self.api_key == "MOCK_KEY":
            return self._simulate_multiplier(departure_time, origin, destination)

        params = self._build_route_params(origin, destination, departure_time)
        params["return"] = "summary"

        try:
            response = self.session.get(
                self.BASE_URL, params=params, verify=False, timeout=10
            )
            response.raise_for_status()

            data = response.json()
            routes = data.get("routes", [])
            if routes and routes[0].get("sections"):
                summary = routes[0]["sections"][0]["summary"]
                duration = summary.get("duration", 0)
                base_duration = summary.get("baseDuration", 0)

                if duration and base_duration and base_duration > 0:
                    multiplier = duration / base_duration
                    logger.debug(
                        f"HERE: duration={duration}s, baseDuration={base_duration}s, "
                        f"multiplier={multiplier:.2f}"
                    )
                    return multiplier
                else:
                    logger.warning(f"Missing baseDuration. Summary: {summary}")

            logger.warning(
                f"HERE API returned unexpected format. Data snippet: {str(data)[:200]}"
            )
            return 1.0

        except requests.exceptions.HTTPError as e:
            logger.error(f"HERE API request failed: {e}. Response: {e.response.text}")
            return 1.0
        except requests.exceptions.RequestException as e:
            logger.error(f"HERE API request failed: {e}")
            return 1.0

    def get_route_duration(
        self, origin: List[float], destination: List[float], departure_time: int
    ) -> int:
        """
        Returns the absolute travel time in seconds for a single leg at the exact
        departure time. Delegates to get_route_with_geometry to share the cache.
        """
        route_data = self.get_route_with_geometry(origin, destination, departure_time)
        return route_data["traffic_duration_s"]

    def get_route_with_geometry(
        self, origin: List[float], destination: List[float], departure_time: int
    ) -> Dict[str, Any]:
        """
        Fetch road-following polyline + both free-flow and traffic-aware durations
        from HERE Routing v8.

        Returns a dict with:
          - geometry: [[lon, lat], ...] road-following coordinates
          - free_flow_duration_s: travel time ignoring traffic (baseDuration)
          - traffic_duration_s: travel time with traffic prediction (duration)
          - distance_m: route distance in meters
        """
        cache_key = (
            f"route:{round(origin[0],5)},{round(origin[1],5)}:"
            f"{round(destination[0],5)},{round(destination[1],5)}:"
            f"{departure_time // 300}"
        )
        if cache_key in self._route_cache:
            return self._route_cache[cache_key]

        if not self.api_key or self.api_key == "MOCK_KEY":
            result = self._mock_route(origin, destination, departure_time)
            self._route_cache[cache_key] = result
            return result

        params = self._build_route_params(origin, destination, departure_time)
        params["return"] = "summary,polyline"

        try:
            response = self.session.get(
                self.BASE_URL, params=params, verify=False, timeout=15
            )
            response.raise_for_status()
            data = response.json()

            routes = data.get("routes", [])
            if not routes or not routes[0].get("sections"):
                logger.warning("HERE returned no routes for geometry query")
                raise ValueError("No routes returned")

            section = routes[0]["sections"][0]
            summary = section["summary"]
            traffic_duration = summary.get("duration", 0)
            free_flow_duration = summary.get("baseDuration", traffic_duration)
            distance_m = summary.get("length", 0)

            # Decode HERE Flexible Polyline
            polyline = self._decode_polyline(
                section.get("polyline", ""), origin, destination
            )

            logger.debug(
                f"HERE route: {len(polyline)} pts, ff={free_flow_duration}s, "
                f"traffic={traffic_duration}s"
            )
            result = {
                "geometry": polyline,
                "free_flow_duration_s": free_flow_duration,
                "traffic_duration_s": traffic_duration,
                "distance_m": distance_m,
            }
            self._route_cache[cache_key] = result
            return result

        except Exception as e:
            logger.warning(f"HERE geometry query failed: {e}. Using mock geometry.")
            result = self._mock_route(origin, destination, departure_time)
            self._route_cache[cache_key] = result
            return result

    # ──────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────

    def _build_route_params(
        self, origin: List[float], destination: List[float], departure_time: int
    ) -> Dict[str, str]:
        """Build the query parameters for a HERE Routing v8 request."""
        dt = datetime.fromtimestamp(departure_time, tz=timezone.utc)
        departure_iso = dt.strftime("%Y-%m-%dT%H:%M:%S")

        params = {
            "apiKey": self.api_key,
            "origin": f"{origin[1]},{origin[0]}",       # lat,lng
            "destination": f"{destination[1]},{destination[0]}",  # lat,lng
            "transportMode": "truck",
            "departureTime": departure_iso,
        }
        # Add vehicle configuration
        params.update(self.VEHICLE_PARAMS)
        return params

    def _decode_polyline(
        self, encoded: str, origin: List[float], destination: List[float]
    ) -> List[List[float]]:
        """
        Decode HERE's Flexible Polyline Encoding into [[lon, lat], ...].
        Falls back to straight-line if flexpolyline library is unavailable.
        """
        if encoded and HAS_FLEXPOLYLINE:
            try:
                # flexpolyline.decode returns [(lat, lng, [alt]), ...]
                decoded = flexpolyline.decode(encoded)
                polyline = [
                    [round(point[1], 6), round(point[0], 6)]
                    for point in decoded
                ]
                if len(polyline) >= 2:
                    return polyline
            except Exception as e:
                logger.warning(f"Flexible polyline decode failed: {e}")

        # Fallback: straight line
        return [
            [round(origin[0], 6), round(origin[1], 6)],
            [round(destination[0], 6), round(destination[1], 6)],
        ]

    def _mock_route(
        self, origin: List[float], destination: List[float], departure_time: int
    ) -> Dict[str, Any]:
        """Generate a mock route with simulated traffic for local testing."""
        dist = self._haversine(origin, destination)
        free_flow = max(int(dist / 8.3), 60)  # ~30 km/h London average
        multiplier = self._simulate_multiplier(departure_time, origin, destination)
        traffic = int(free_flow * multiplier)

        # Generate interpolated straight-line geometry
        coords = []
        n = 8
        for i in range(n):
            t = i / max(n - 1, 1)
            lon = origin[0] + t * (destination[0] - origin[0])
            lat = origin[1] + t * (destination[1] - origin[1])
            coords.append([round(lon, 6), round(lat, 6)])

        return {
            "geometry": coords,
            "free_flow_duration_s": free_flow,
            "traffic_duration_s": traffic,
            "distance_m": int(dist),
        }

    def _simulate_multiplier(
        self, departure_time: int,
        origin: List[float] = None,
        destination: List[float] = None
    ) -> float:
        """Fallback simulator for local testing without an API key. Applies location-aware traffic factors."""
        dt = datetime.fromtimestamp(departure_time)
        hour = dt.hour

        # 1. Determine Zone (Central, Inner, Outer)
        # Using Trafalgar Square (-0.1281, 51.5080) as the center
        def _get_zone(lon, lat):
            center_lon, center_lat = -0.1281, 51.5080
            dist_sq = ((lon - center_lon) * 69) ** 2 + ((lat - center_lat) * 69) ** 2
            if dist_sq < 2.25:
                return "central"
            elif dist_sq < 16.0:
                return "inner"
            else:
                return "outer"

        zone = "outer"
        if origin and destination:
            z_orig = _get_zone(origin[0], origin[1])
            z_dest = _get_zone(destination[0], destination[1])
            if "central" in (z_orig, z_dest):
                zone = "central"
            elif "inner" in (z_orig, z_dest):
                zone = "inner"

        # 2. Time slots and Multiplier Matrix
        matrix = {
            "morning_rush": {"hours": (7, 9), "central": 2.8, "inner": 2.2, "outer": 1.6},
            "midday":       {"hours": (10, 14), "central": 1.9, "inner": 1.6, "outer": 1.2},
            "school_run":   {"hours": (14, 16), "central": 2.2, "inner": 1.9, "outer": 1.5},
            "evening_rush": {"hours": (16, 18), "central": 3.0, "inner": 2.4, "outer": 1.8},
            "evening":      {"hours": (19, 23), "central": 1.4, "inner": 1.2, "outer": 1.0},
            "night":        {"hours": (0, 6), "central": 1.0, "inner": 1.0, "outer": 1.0},
        }

        # 3. Apply Multiplier
        for slot, data in matrix.items():
            start_h, end_h = data["hours"]
            if start_h <= end_h:
                if start_h <= hour <= end_h:
                    return data[zone]
            else:
                if hour >= start_h or hour <= end_h:
                    return data[zone]

        return 1.0

    @staticmethod
    def _haversine(coord1: List[float], coord2: List[float]) -> float:
        """Great-circle distance in meters between two [lon, lat] points."""
        lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
        lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        return 6371000 * c
