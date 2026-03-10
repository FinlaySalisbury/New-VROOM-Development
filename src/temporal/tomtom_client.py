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
            # During local DEV/testing, return simulated multipliers based on time
            return self._simulate_multiplier(departure_time)

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
            
    def _simulate_multiplier(self, departure_time: int) -> float:
        """Fallback simulator for local testing without an API key."""
        dt = datetime.fromtimestamp(departure_time)
        hour = dt.hour
        
        # Simulate Rush Hour (07:00-09:00 and 16:00-18:00)
        if (7 <= hour <= 9) or (16 <= hour <= 18):
            return 1.8 # Journey takes 80% longer
        
        # Simulate Midday Traffic (10:00-15:00)
        if 10 <= hour <= 15:
            return 1.3 # Journey takes 30% longer
            
        # Night/Free Flow (19:00-06:00)
        return 1.0 # Optimal speed

    def get_route_duration(self, origin: List[float], destination: List[float], 
                           departure_time: int) -> int:
        """
        Returns the absolute travel time in seconds for a single leg at the exact
        departure time. Used by the convergence loop for leg verification.
        
        Args:
            origin: [longitude, latitude]
            destination: [longitude, latitude]
            departure_time: Unix timestamp of departure
            
        Returns:
            int: Travel time in seconds.
        """
        if not self.api_key or self.api_key == "MOCK_KEY":
            # Mock mode: Haversine distance / speed adjusted by time-of-day
            import math
            dist = self._haversine(origin, destination)
            multiplier = self._simulate_multiplier(departure_time)
            base_speed = 8.3  # ~30 km/h London average in m/s
            return int((dist / base_speed) * multiplier)
        
        # Live mode: Query TomTom Routing v1 for travelTimeInSeconds
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
            # Fallback to mock
            import math
            dist = self._haversine(origin, destination)
            multiplier = self._simulate_multiplier(departure_time)
            return int((dist / 8.3) * multiplier)

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

