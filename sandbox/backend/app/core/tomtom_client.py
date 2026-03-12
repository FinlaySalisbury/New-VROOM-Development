import requests
import urllib3
import logging
from typing import Dict, Any, Tuple, List
from datetime import datetime

# Enforce corporate IT standards
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

class TomTomClient:
    """
    Client for interacting with the TomTom Routing API to retrieve traffic intelligence.
    Extracts time-dependent speed multipliers (currentSpeed / freeFlowSpeed) to 
    weight the VROOM routing matrix dynamically based on the exact departure time.
    """
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Using the TomTom Routing API endpoint
        self.base_url = "https://api.tomtom.com/routing/1/calculateRoute"
        
        # Strategy 2: 10-Minute Time-Bucket Caching for Full Routes
        self._route_cache: Dict[str, Dict[str, Any]] = {}

    def get_traffic_multiplier(self, origin: List[float], destination: List[float], departure_time: int) -> float:
        """
        Queries TomTom for a route between origin and destination at a specific departure time.
        Calculates the multiplier based on the expected travel time vs free-flow travel time.
        
        Args:
            origin: [longitude, latitude]
            destination: [longitude, latitude]
            departure_time: Unix timestamp of departure
            
        Returns:
            float: Speed multiplier (currentSpeed / freeFlowSpeed). 
                   A value > 1.0 means traffic is slower than free-flow.
                   Returns 1.0 on failure or if no traffic data available.
        """
        if not self.api_key or self.api_key == "MOCK_KEY":
            # During local DEV/testing, return simulated multipliers based on time and location
            return self._simulate_multiplier(departure_time, origin, destination)

        # TomTom expects coordinates as "latitude,longitude"
        locations = f"{origin[1]},{origin[0]}:{destination[1]},{destination[0]}"
        
        # Convert unix timestamp to ISO format required by TomTom
        dt = datetime.fromtimestamp(departure_time)
        depart_at = dt.strftime('%Y-%m-%dT%H:%M:%S')

        url = f"{self.base_url}/{locations}/json"
        
        params = {
            "key": self.api_key,
            "departAt": depart_at,
            "computeTravelTimeFor": "all",
            "traffic": "true" # Request traffic-aware routing
        }

        try:
            # Enforce corporate environment rule: verify=False
            response = requests.get(url, params=params, verify=False, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if "routes" in data and len(data["routes"]) > 0:
                summary = data["routes"][0]["summary"]
                
                # TomTom returns travelTimeInSeconds (with traffic) and noTrafficTravelTimeInSeconds
                travel_time = summary.get("travelTimeInSeconds")
                free_flow_time = summary.get("noTrafficTravelTimeInSeconds")
                
                if travel_time and free_flow_time and free_flow_time > 0:
                    # Multiplier > 1 means it takes longer due to traffic
                    multiplier = travel_time / free_flow_time
                    logger.debug(f"TomTom: TT={travel_time}s, FF={free_flow_time}s, Multiplier={multiplier:.2f}")
                    return multiplier
                else:
                    logger.warning(f"Missing free_flow_time. Summary payload: {summary}")
                    
            logger.warning(f"TomTom API returned unexpected format or no routes. Data snippet: {str(data)[:200]}")
            return 1.0
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"TomTom API request failed: {e}. Response: {e.response.text}")
            return 1.0
        except requests.exceptions.RequestException as e:
            logger.error(f"TomTom API request failed: {e}")
            return 1.0
            
    def _simulate_multiplier(self, departure_time: int, origin: List[float] = None, destination: List[float] = None) -> float:
        """Fallback simulator for local testing without an API key. Applies location-aware traffic factors."""
        dt = datetime.fromtimestamp(departure_time)
        hour = dt.hour
        
        # 1. Determine Zone (Central, Inner, Outer)
        # Using Trafalgar Square (-0.1281, 51.5080) as the center
        # Inner London = roughly < 6km radius
        # Central London = roughly < 2.5km radius
        # Note: using a simple rough bounding box for speed, but layered
        def _get_zone(lon, lat):
            # Trafalgar Square coords
            center_lon, center_lat = -0.1281, 51.5080
            # Rough distance squared approximation (not true haversine, but fast enough for mock zoning)
            dist_sq = ((lon - center_lon) * 69) ** 2 + ((lat - center_lat) * 69) ** 2
            
            if dist_sq < 2.25: # ~1.5 miles
                return "central"
            elif dist_sq < 16.0: # ~4 miles
                return "inner"
            else:
                return "outer"
                
        zone = "outer"
        if origin and destination:
            z_orig = _get_zone(origin[0], origin[1])
            z_dest = _get_zone(destination[0], destination[1])
            # If any part touches Central, treat as Central. Else if Inner, treat as Inner.
            if "central" in (z_orig, z_dest):
                zone = "central"
            elif "inner" in (z_orig, z_dest):
                zone = "inner"
                
        # 2. Time slots and Multiplier Matrix
        # Multipliers represent (Current Travel Time / Free Flow Travel Time)
        matrix = {
            "morning_rush": {"hours": (7, 9), "central": 2.8, "inner": 2.2, "outer": 1.6},
            "midday":       {"hours": (10, 14), "central": 1.9, "inner": 1.6, "outer": 1.2},
            "school_run":   {"hours": (14, 16), "central": 2.2, "inner": 1.9, "outer": 1.5},
            "evening_rush": {"hours": (16, 18), "central": 3.0, "inner": 2.4, "outer": 1.8},
            "evening":      {"hours": (19, 23), "central": 1.4, "inner": 1.2, "outer": 1.0},
            "night":        {"hours": (0, 6), "central": 1.0, "inner": 1.0, "outer": 1.0}
        }
        
        # 3. Apply Multiplier
        for slot, data in matrix.items():
            start_h, end_h = data["hours"]
            # Handle overnight wrap-around just in case
            if start_h <= end_h:
                if start_h <= hour <= end_h:
                    return data[zone]
            else:
                if hour >= start_h or hour <= end_h:
                    return data[zone]
                    
        return 1.0 # Fallback free flow

    def get_route_duration(self, origin: List[float], destination: List[float], departure_time: int) -> int:
        """
        Returns the absolute travel time in seconds for a single leg at the exact
        departure time. Used by the convergence loop for leg verification.
        Hits the same shared time-bucket cache as get_route_with_geometry.
        """
        route_data = self.get_route_with_geometry(origin, destination, departure_time)
        return route_data["traffic_duration_s"]

    def get_route_duration(self, origin: List[float], destination: List[float], 
                           departure_time: int) -> int:
        """
        Returns the absolute travel time in seconds for a single leg at the exact
        departure time. Used by the convergence loop for leg verification.
        """
        if not self.api_key or self.api_key == "MOCK_KEY":
            import math
            dist = self._haversine(origin, destination)
            multiplier = self._simulate_multiplier(departure_time, origin, destination)
            base_speed = 8.3  # ~30 km/h London average in m/s
            return int((dist / base_speed) * multiplier)
        
        locations = f"{origin[1]},{origin[0]}:{destination[1]},{destination[0]}"
        dt = datetime.fromtimestamp(departure_time)
        depart_at = dt.strftime('%Y-%m-%dT%H:%M:%S')
        
        url = f"{self.base_url}/{locations}/json"
        params = {
            "key": self.api_key,
            "departAt": depart_at,
            "computeTravelTimeFor": "all",
            "traffic": "true"
        }
        
        try:
            response = requests.get(url, params=params, verify=False, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if "routes" in data and len(data["routes"]) > 0:
                return data["routes"][0]["summary"].get("travelTimeInSeconds", 0)
            
            logger.warning("TomTom returned no routes for duration query")
            return 0
            
        except requests.exceptions.RequestException as e:
            logger.error(f"TomTom duration query failed: {e}")
            import math
            dist = self._haversine(origin, destination)
            multiplier = self._simulate_multiplier(departure_time, origin, destination)
            return int((dist / 8.3) * multiplier)

    def get_route_with_geometry(self, origin: List[float], destination: List[float],
                                departure_time: int) -> Dict[str, Any]:
        """
        Fetch road-following polyline + both free-flow and traffic-aware durations
        from TomTom Routing v1.
        
        Returns a dict with:
          - geometry: [[lon, lat], ...] road-following coordinates
          - free_flow_duration_s: travel time ignoring traffic
          - traffic_duration_s: travel time with TomTom's traffic prediction
          - distance_m: route distance in meters
        """
        if not self.api_key or self.api_key == "MOCK_KEY":
            import math
            dist = self._haversine(origin, destination)
            # Free-flow: 30 km/h London average
            free_flow = max(int(dist / 8.3), 60)
            # Traffic: apply simulated multiplier
            multiplier = self._simulate_multiplier(departure_time, origin, destination)
            traffic = int(free_flow * multiplier)
            coords = []
            n = 8
            for i in range(n):
                t = i / max(n - 1, 1)
                lon = origin[0] + t * (destination[0] - origin[0])
                lat = origin[1] + t * (destination[1] - origin[1])
                coords.append([round(lon, 6), round(lat, 6)])
            result = {
                "geometry": coords,
                "free_flow_duration_s": free_flow,
                "traffic_duration_s": traffic,
                "distance_m": int(dist),
            }
            self._route_cache[cache_key] = result
            return result

        locations = f"{origin[1]},{origin[0]}:{destination[1]},{destination[0]}"
        dt = datetime.fromtimestamp(departure_time)
        depart_at = dt.strftime('%Y-%m-%dT%H:%M:%S')

        url = f"{self.base_url}/{locations}/json"
        params = {
            "key": self.api_key,
            "departAt": depart_at,
            "computeTravelTimeFor": "all",
            "traffic": "true",
        }

        try:
            response = requests.get(url, params=params, verify=False, timeout=15)
            response.raise_for_status()
            data = response.json()

            if "routes" not in data or len(data["routes"]) == 0:
                logger.warning("TomTom returned no routes for geometry query")
                raise ValueError("No routes returned")

            route = data["routes"][0]
            summary = route["summary"]
            traffic_duration = summary.get("travelTimeInSeconds", 0)
            free_flow_duration = summary.get("noTrafficTravelTimeInSeconds", traffic_duration)
            distance_m = summary.get("lengthInMeters", 0)

            # Extract polyline from all legs
            polyline = []
            for leg in route.get("legs", []):
                points = leg.get("points", [])
                for pt in points:
                    polyline.append([round(pt["longitude"], 6), round(pt["latitude"], 6)])

            if len(polyline) < 2:
                polyline = [
                    [round(origin[0], 6), round(origin[1], 6)],
                    [round(destination[0], 6), round(destination[1], 6)],
                ]

            logger.debug(f"TomTom route: {len(polyline)} pts, ff={free_flow_duration}s, traffic={traffic_duration}s")
            result = {
                "geometry": polyline,
                "free_flow_duration_s": free_flow_duration,
                "traffic_duration_s": traffic_duration,
                "distance_m": distance_m,
            }
            self._route_cache[cache_key] = result
            return result

        except Exception as e:
            logger.warning(f"TomTom geometry query failed: {e}. Using mock geometry.")
            import math
            dist = self._haversine(origin, destination)
            free_flow = max(int(dist / 8.3), 60)
            multiplier = self._simulate_multiplier(departure_time, origin, destination)
            traffic = int(free_flow * multiplier)
            coords = []
            n = 8
            for i in range(n):
                t = i / max(n - 1, 1)
                lon = origin[0] + t * (destination[0] - origin[0])
                lat = origin[1] + t * (destination[1] - origin[1])
                coords.append([round(lon, 6), round(lat, 6)])
            result = {
                "geometry": coords,
                "free_flow_duration_s": free_flow,
                "traffic_duration_s": traffic,
                "distance_m": int(dist),
            }
            self._route_cache[cache_key] = result
            return result

    @staticmethod
    def _haversine(coord1: List[float], coord2: List[float]) -> float:
        """Great-circle distance in meters between two [lon, lat] points."""
        import math
        lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
        lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        return 6371000 * c

