import json
import subprocess
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class VroomSolverInterface:
    """
    Python interface to the locally installed VROOM executable.
    Formats the constraints (skills, time windows) and the weighted matrix 
    into a JSON payload, sends it to the VROOM binary via STDIN, and parses STDOUT.
    """
    
    def __init__(self, vroom_executable_path: str = "vroom"):
        self.vroom_path = vroom_executable_path

    def solve(self, vehicles: List[Dict[str, Any]], 
              jobs: List[Dict[str, Any]], 
              matrix: List[List[int]]) -> Dict[str, Any]:
        """
        Constructs the VRP JSON specific to VROOM's expected format and solves the matrix.
        """
        payload = self._build_payload(vehicles, jobs, matrix)
        
        try:
            # Execute the local VROOM binary according to IT constraints (no docker)
            process = subprocess.Popen(
                [self.vroom_path, "-i", "stdin"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            payload_str = json.dumps(payload)
            stdout, stderr = process.communicate(input=payload_str)
            
            if process.returncode != 0:
                logger.error(f"VROOM Solver Failed: {stderr}")
                return {"error": stderr}
                
            return json.loads(stdout)
            
        except FileNotFoundError:
            logger.critical(f"VROOM executable not found at '{self.vroom_path}'. " 
                            "Ensure the native binary is installed and mapped to path per local IT constraints.")
            return {"error": "executable_not_found"}
        except Exception as e:
            logger.error(f"Error communicating with VROOM: {e}")
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
                "profile": "car"
            }
            if "time_window" in v and v["time_window"]:
                vroom_vehicle["time_window"] = v["time_window"] # Hard Constraint: Shift Hours
            
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
                vroom_job["time_windows"] = j["time_windows"] # Hard Constraint: Site Accces
                
            vroom_jobs.append(vroom_job)

        return {
            "vehicles": vroom_vehicles,
            "jobs": vroom_jobs,
            "matrices": {
                "car": {
                    "durations": matrix
                }
            }
        }
