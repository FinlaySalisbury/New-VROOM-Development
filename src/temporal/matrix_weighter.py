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
                              departure_time: int) -> List[List[int]]:
        """
        Takes a base routing matrix (usually computed by OSRM showing free flow durations in seconds)
        and applies the TomTom traffic multipliers for the specific departure time.
        
        Args:
            base_matrix: 2D array of free-flow durations between N locations.
            locations: List of coordinates [longitude, latitude] corresponding to matrix indices.
            departure_time: Unix timestamp marking when the shift/travel begins.
            
        Returns:
            A weighted 2D array reflecting expected actual travel durations.
        """
        size = len(base_matrix)
        weighted_matrix: List[List[int]] = [[0 for _ in range(size)] for _ in range(size)]
        
        for i in range(size):
            for j in range(size):
                if i == j:
                    weighted_matrix[i][j] = 0
                    continue
                    
                origin = locations[i]
                destination = locations[j]
                
                # Retrieve the time-based multiplier (Current_Time / Free_Flow_Time)
                multiplier = self.tt_client.get_traffic_multiplier(origin, destination, departure_time)
                
                # Apply multiplier to the base free-flow matrix duration
                weighted_duration = int(base_matrix[i][j] * multiplier)
                weighted_matrix[i][j] = weighted_duration
                
        return weighted_matrix
