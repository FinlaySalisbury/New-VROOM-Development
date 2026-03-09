import logging
from typing import List, Dict, Any
from .tomtom_client import TomTomClient

logger = logging.getLogger(__name__)

class TrafficMatrixWeighter:
    """
    Transforms baseline distance/duration matrices using real-time traffic data from TomTom.
    Ensures that the VROOM solver receives accurate travel times based on the precise
    departure schedules.
    """
    
    def __init__(self, tomtom_client: TomTomClient):
        self.tt_client = tomtom_client

    def apply_traffic_weights(self, 
                              base_matrix: List[List[int]], 
                              locations: List[List[float]], 
                              departure_time: int,
                              api_limit: int = 50) -> List[List[int]]:
        """
        Takes a base routing matrix (usually computed by OSRM showing free flow durations in seconds)
        and applies the TomTom traffic multipliers for the specific departure time.
        
        Args:
            base_matrix: 2D array of free-flow durations between N locations.
            locations: List of coordinates [longitude, latitude] corresponding to matrix indices.
            departure_time: Unix timestamp marking when the shift/travel begins.
            api_limit: The maximum number of real API calls to make to TomTom.
            
        Returns:
            A weighted 2D array reflecting expected actual travel durations.
        """
        size = len(base_matrix)
        weighted_matrix: List[List[int]] = [[0 for _ in range(size)] for _ in range(size)]
        
        api_calls_made = 0
        multiplier_cache: Dict[str, float] = {}
        
        for i in range(size):
            for j in range(size):
                origin = locations[i]
                destination = locations[j]
                if origin == destination:
                    weighted_matrix[i][j] = 0
                    continue
                    
                # Create a rounded cache key to prevent floating point discrepancies
                cache_key_ab = f"{round(origin[0],5)},{round(origin[1],5)}:{round(destination[0],5)},{round(destination[1],5)}"
                cache_key_ba = f"{round(destination[0],5)},{round(destination[1],5)}:{round(origin[0],5)},{round(origin[1],5)}"
                
                multiplier = 1.0
                if cache_key_ab in multiplier_cache:
                    multiplier = multiplier_cache[cache_key_ab]
                elif api_calls_made < api_limit:
                    # Cache miss and we still have API quota, query TomTom
                    multiplier = self.tt_client.get_traffic_multiplier(origin, destination, departure_time)
                    multiplier_cache[cache_key_ab] = multiplier
                    api_calls_made += 1
                else:
                    # Fallback to simulated multiplier to save API quota
                    if api_calls_made == api_limit:
                        logger.warning(f"TomTom API limit of {api_limit} reached. Falling back to simulated traffic for remaining matrix cells. Consider increasing limit or relying on base matrix.")
                        api_calls_made += 1 # increment just so we don't spam the warning
                    multiplier = self.tt_client._simulate_multiplier(departure_time)
                    multiplier_cache[cache_key_ab] = multiplier
                
                # Apply multiplier to the base free-flow matrix duration
                weighted_duration = int(base_matrix[i][j] * multiplier)
                weighted_matrix[i][j] = weighted_duration
                
        return weighted_matrix
