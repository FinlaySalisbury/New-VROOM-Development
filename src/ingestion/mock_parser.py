import json
from typing import Dict, Any, List
from datetime import datetime, timezone
from .adapter import IngestionAdapter

class MockIngestionAdapter(IngestionAdapter):
    """
    Mock implementation of IngestionAdapter that loads data from designated JSON/CSV files.
    This simulates the real VROOM payloads we'll eventually get from a live service.
    """
    
    def __init__(self, jobs_file: str, engineers_file: str, skills_file: str):
        self.jobs_file = jobs_file
        self.engineers_file = engineers_file
        self.skills_file = skills_file
        self._skills_map = self._load_json(self.skills_file)
        
    def _load_json(self, filepath: str) -> Dict[str, Any]:
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
            return {}

    def get_skills_mapping(self) -> Dict[str, Any]:
        return self._skills_map

    def get_jobs(self) -> List[Dict[str, Any]]:
        raw_jobs = self._load_json(self.jobs_file)
        formatted_jobs = []
        
        for job in raw_jobs.get('jobs', []):
            formatted_job = {
                "id": job["id"],
                "description": job.get("description", ""),
                # Extract exactly [Longitude, Latitude]
                "location": [job["longitude"], job["latitude"]],
                "skills": self._map_skills(job.get("required_skills", [])),
                "time_windows": self._parse_time_windows(job.get("time_windows", []))
            }
            formatted_jobs.append(formatted_job)
            
        return formatted_jobs

    def get_engineers(self) -> List[Dict[str, Any]]:
        raw_engineers = self._load_json(self.engineers_file)
        formatted_engineers = []
        
        for eng in raw_engineers.get('engineers', []):
            formatted_eng = {
                "id": eng["id"],
                "name": eng.get("name", f"Engineer_{eng['id']}"),
                # Extract exactly [Longitude, Latitude]
                "start": [eng["start_longitude"], eng["start_latitude"]],
                "end": [eng["end_longitude"], eng["end_latitude"]],
                "skills": self._map_skills(eng.get("skills", [])),
                "time_window": self._parse_time_window(eng.get("working_hours", {}))
            }
            formatted_engineers.append(formatted_eng)
            
        return formatted_engineers

    def _map_skills(self, skill_names: List[str]) -> List[int]:
        """
        Dynamically maps string skill names to integer IDs required by VROOM, based on the skills config.
        """
        mapped = []
        for name in skill_names:
            if name in self._skills_map:
                mapped.append(self._skills_map[name])
            else:
                print(f"Warning: Skill '{name}' not found in skills mapping.")
        return mapped

    def _parse_time_windows(self, windows: List[Dict[str, str]]) -> List[List[int]]:
        """Convert list of start/end ISO strings to list of [start_unix, end_unix]"""
        return [self._parse_time_window(w) for w in windows if w]
        
    def _parse_time_window(self, window: Dict[str, str]) -> List[int]:
        """Convert start/end ISO strings to [start_unix, end_unix]"""
        if not window or 'start' not in window or 'end' not in window:
            return []
            
        try:
            start_dt = datetime.fromisoformat(window['start'].replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(window['end'].replace('Z', '+00:00'))
            return [int(start_dt.timestamp()), int(end_dt.timestamp())]
        except Exception as e:
            print(f"Error parsing time window {window}: {e}")
            return []
