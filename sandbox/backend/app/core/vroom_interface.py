import json
import logging
import requests
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class VroomSolverInterface:
    """
    Python interface to the VROOM HTTP API (vroom-express) running in Docker.
    Formats the constraints (skills, time windows) and the weighted matrix 
    into a JSON payload, sends it to the VROOM API, and parses the response.
    """
    
    def __init__(self, endpoint_url: str = "http://localhost:3000/"):
        self.endpoint_url = endpoint_url

    def solve(self, vehicles: List[Dict[str, Any]], 
              jobs: List[Dict[str, Any]], 
              matrix: List[List[int]]) -> Dict[str, Any]:
        """
        Constructs the VRP JSON specific to VROOM's expected format and solves via HTTP API.
        """
        payload = self._build_payload(vehicles, jobs, matrix)
        
        try:
            logger.info(f"Sending payload to VROOM API at {self.endpoint_url}")
            response = requests.post(self.endpoint_url, json=payload, timeout=600)
            
            if response.status_code != 200:
                logger.error(f"VROOM API Failed with status {response.status_code}: {response.text}")
                return {"error": response.text}
                
            return response.json()
            
        except requests.exceptions.ConnectionError:
            logger.critical(f"Could not connect to VROOM API at {self.endpoint_url}. " 
                            "Ensure the Docker container is running and the port is exposed.")
            return {"error": "connection_error"}
        except requests.exceptions.Timeout:
            logger.critical("VROOM API request timed out.")
            return {"error": "timeout"}
        except Exception as e:
            logger.error(f"Error communicating with VROOM API: {e}")
            return {"error": str(e)}

    def _build_payload(self, vehicles: List[Dict[str, Any]], 
                       jobs: List[Dict[str, Any]], 
                       matrix: List[List[int]]) -> Dict[str, Any]:
        """
        Transforms our generic orchestrator format into VROOM JSON syntax.
        """
        vroom_vehicles = []
        for i, v in enumerate(vehicles):
            vroom_vehicle = {
                "id": v["id"],
                "start": v["start"],
                "end": v["end"],
                "start_index": i,  # References the matrix index corresponding to start loc
                "end_index": i,
                "skills": v.get("skills", []), # Hard constraint
                "profile": "van"  # Aligns with TomTom travelMode=van for London LTN compliance
            }
            if "time_window" in v and v["time_window"]:
                vroom_vehicle["time_window"] = v["time_window"] # Hard Constraint: Shift Hours
            if "max_travel_time" in v:
                vroom_vehicle["max_travel_time"] = v["max_travel_time"]
            if "max_tasks" in v:
                vroom_vehicle["max_tasks"] = v["max_tasks"]
            
            vroom_vehicles.append(vroom_vehicle)
            
        vroom_jobs = []
        # Offset index by the number of vehicles (vehicles are the first N locations in matrix)
        offset = len(vehicles)
        
        for i, j in enumerate(jobs):
            vroom_job = {
                "id": j["id"],
                "location": j["location"],
                "location_index": offset + i,
                "skills": j.get("skills", []) # Hard constraint
            }
            if "time_windows" in j and j["time_windows"]:
                vroom_job["time_windows"] = j["time_windows"] # Hard Constraint: Site Access
            if "service" in j:
                vroom_job["service"] = j["service"]  # Service time in seconds at site
                
            vroom_jobs.append(vroom_job)

        return {
            "vehicles": vroom_vehicles,
            "jobs": vroom_jobs,
            "matrices": {
                "van": {
                    "durations": matrix
                }
            }
        }
