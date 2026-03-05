from abc import ABC, abstractmethod
from typing import Dict, Any, List

class IngestionAdapter(ABC):
    """
    Abstract base class defining the interface for data ingestion into the VROOM Orchestrator.
    This abstraction allows the mock CSV/JSON layer to be easily swapped for a real DB or REST API later.
    """

    @abstractmethod
    def get_jobs(self) -> List[Dict[str, Any]]:
        """
        Retrieve a list of jobs formatted for the VROOM Solver.
        Each job must contain `location` as `[Longitude, Latitude]`, `skills`, 
        and strict time windows as Unix Timestamps.
        """
        ...

    @abstractmethod
    def get_engineers(self) -> List[Dict[str, Any]]:
        """
        Retrieve a list of engineers (vehicles) formatted for the VROOM Solver.
        Each engineer must contain a start/end `location` (`[Longitude, Latitude]`), 
        dynamic `skills`, and working hours as Unix Timestamps.
        """
        ...
    
    @abstractmethod
    def get_skills_mapping(self) -> Dict[str, Any]:
        """
        Retrieve the dynamic JSON/Dict mapping of skills to use for hard constraint matching.
        Discards the hardcoded 1-8 skill maps.
        """
        ...
