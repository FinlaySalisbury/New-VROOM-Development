"""
Morning Planner — Iterative TDVRP Convergence Solver

Plans an engineer's full shift upfront by iteratively refining VROOM's static
matrix against TomTom's time-dependent traffic data.

Algorithm:
  1. Fetch baseline N×N matrix via TomTom Matrix v2 at shift start
  2. Solve with VROOM → initial route sequence
  3. Simulate forward through the route, computing exact departure timestamps
  4. Verify each leg via TomTom v1 at the exact departure time
  5. Penalize matrix cells where true_duration > baseline * threshold
  6. Re-solve until route stabilizes (max 3 iterations)
"""
import os
import json
import copy
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from src.temporal.tomtom_client import TomTomClient
from src.temporal.matrix_weighter import TrafficMatrixWeighter
from src.solver.vroom_interface import VroomSolverInterface

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ════════════════════════════════════════════════
# GeospatialFilter — Central London Ring Fence
# ════════════════════════════════════════════════

class GeospatialFilter:
    """
    Flags jobs inside a Central London bounding box and injects
    non-peak time_windows to avoid rush-hour congestion.
    
    Bounding box: roughly City of London / Westminster / Southwark
    """
    
    # Central London bounding box [min_lon, min_lat, max_lon, max_lat]
    CENTRAL_LONDON = (-0.16, 51.49, -0.07, 51.53)
    
    # Non-peak offsets from midnight (seconds)
    NON_PEAK_START_OFFSET = 36000   # 10:00
    NON_PEAK_END_OFFSET = 55800     # 15:30
    
    def __init__(self, bbox: Optional[Tuple[float, float, float, float]] = None):
        self.bbox = bbox or self.CENTRAL_LONDON
        try:
            from shapely.geometry import box, Point
            self.zone = box(self.bbox[0], self.bbox[1], self.bbox[2], self.bbox[3])
            self._Point = Point
            self.shapely_available = True
            logger.info(f"GeospatialFilter initialized with shapely: bbox={self.bbox}")
        except ImportError:
            logger.warning("shapely not installed — using manual bounding box check")
            self.zone = None
            self._Point = None
            self.shapely_available = False
    
    def is_central_london(self, lon: float, lat: float) -> bool:
        """Check if a coordinate falls within the Central London zone."""
        if self.shapely_available:
            return self.zone.contains(self._Point(lon, lat))
        else:
            # Manual fallback
            return (self.bbox[0] <= lon <= self.bbox[2] and 
                    self.bbox[1] <= lat <= self.bbox[3])
    
    def filter_jobs(self, jobs: List[Dict[str, Any]], 
                    shift_start_unix: int) -> List[Dict[str, Any]]:
        """
        Inspect each job's location. If inside Central London, inject
        time_windows restricting delivery to non-peak hours (10:00–15:30)
        using ABSOLUTE Unix timestamps derived from the shift date.
        
        Args:
            jobs: List of VROOM job dicts.
            shift_start_unix: Unix timestamp of the shift start.
            
        Returns the modified job list (original objects are mutated).
        """
        # Compute absolute midnight of the shift date in UTC
        shift_dt = datetime.fromtimestamp(shift_start_unix, tz=timezone.utc)
        midnight_utc = shift_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        midnight_unix = int(midnight_utc.timestamp())
        
        # Absolute non-peak window for this specific date
        absolute_non_peak = [
            midnight_unix + self.NON_PEAK_START_OFFSET,  # 10:00 UTC
            midnight_unix + self.NON_PEAK_END_OFFSET     # 15:30 UTC
        ]
        
        non_peak_start_str = datetime.fromtimestamp(absolute_non_peak[0], tz=timezone.utc).strftime("%H:%M")
        non_peak_end_str = datetime.fromtimestamp(absolute_non_peak[1], tz=timezone.utc).strftime("%H:%M")
        
        logger.info(
            f"Non-peak window (absolute): [{absolute_non_peak[0]}, {absolute_non_peak[1]}] "
            f"= {non_peak_start_str}–{non_peak_end_str} UTC on {shift_dt.strftime('%Y-%m-%d')}"
        )
        
        flagged_count = 0
        for job in jobs:
            loc = job.get("location", [0, 0])
            lon, lat = loc[0], loc[1]
            
            if self.is_central_london(lon, lat):
                logger.info(
                    f"  ⚠ Job {job['id']} at ({lon:.4f}, {lat:.4f}) is INSIDE Central London "
                    f"→ restricting to {non_peak_start_str}–{non_peak_end_str} UTC"
                )
                # Override time_windows with ABSOLUTE non-peak restriction
                job["time_windows"] = [absolute_non_peak]
                job["_central_london"] = True
                flagged_count += 1
            else:
                job["_central_london"] = False
        
        logger.info(f"GeospatialFilter: {flagged_count}/{len(jobs)} jobs flagged as Central London")
        return jobs


# ════════════════════════════════════════════════
# ConvergenceSolver — Iterative TDVRP Loop
# ════════════════════════════════════════════════

class ConvergenceSolver:
    """
    Iteratively solves a TDVRP by:
      1. Computing a baseline matrix at shift start
      2. Solving with VROOM
      3. Simulating exact timestamps
      4. Verifying legs against TomTom at actual departure times
      5. Penalizing matrix cells that diverge > threshold
      6. Re-solving until stable (max iterations)
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        vroom_endpoint: str = "http://localhost:3000/",
        max_iterations: int = 3,
        penalty_threshold: float = 1.25,
        penalty_weight: int = 120
    ):
        self.api_key = api_key or os.environ.get("TOMTOM_API_KEY")
        self.max_iterations = max_iterations
        self.penalty_threshold = penalty_threshold
        self.penalty_weight = penalty_weight
        
        # Initialize components
        self.tt_client = TomTomClient(api_key=self.api_key or "MOCK_KEY")
        self.weighter = TrafficMatrixWeighter(api_key=self.api_key)
        self.solver = VroomSolverInterface(endpoint_url=vroom_endpoint)
        self.geo_filter = GeospatialFilter()
    
    def solve(
        self,
        vehicles: List[Dict[str, Any]],
        jobs: List[Dict[str, Any]],
        locations: List[List[float]],
        shift_start: int
    ) -> Dict[str, Any]:
        """
        Run the convergence loop.
        
        Args:
            vehicles: VROOM vehicle definitions
            jobs: VROOM job definitions (will be filtered by GeospatialFilter)
            locations: All coordinates [lon, lat] — vehicles first, then jobs
            shift_start: Unix timestamp for the shift start
            
        Returns:
            Dict with solution, timeline, convergence_log, and matrix
        """
        logger.info("=" * 60)
        logger.info("MORNING CONVERGENCE LOOP — Iterative TDVRP Solver")
        logger.info(f"Shift start: {datetime.fromtimestamp(shift_start, tz=timezone.utc).isoformat()}")
        logger.info(f"Locations: {len(locations)}, Max iterations: {self.max_iterations}")
        logger.info(f"Penalty threshold: {self.penalty_threshold}x, Penalty weight: {self.penalty_weight}s")
        logger.info("=" * 60)
        
        # ── Step 0: Apply Central London ring fence ──
        logger.info("\n--- GeospatialFilter: Scanning jobs ---")
        jobs = self.geo_filter.filter_jobs(jobs, shift_start)
        
        # ── Step 1: Baseline matrix at shift start ──
        logger.info("\n--- Step 1: Computing baseline matrix via TomTom Matrix v2 ---")
        matrix = self.weighter.compute_time_dependent_matrix(
            locations=locations,
            departure_time=shift_start
        )
        baseline_matrix = copy.deepcopy(matrix)
        
        convergence_log = []
        final_solution = None
        final_timeline = None
        
        for iteration in range(self.max_iterations):
            logger.info(f"\n{'='*50}")
            logger.info(f"ITERATION {iteration + 1}/{self.max_iterations}")
            logger.info(f"{'='*50}")
            
            # ── Step 2: Solve with VROOM ──
            logger.info("--- Step 2: Solving with VROOM ---")
            solution = self.solver.solve(vehicles, jobs, matrix)
            
            if "error" in solution:
                logger.warning(f"VROOM error: {solution['error']} — using simulated solution")
                # Build a mock solution for testing when VROOM isn't available
                solution = self._mock_vroom_solution(vehicles, jobs, matrix)
            
            final_solution = solution
            
            # ── Step 3: Simulate timeline ──
            logger.info("--- Step 3: Simulating route timeline ---")
            if "routes" not in solution or not solution["routes"]:
                logger.error("No routes in VROOM solution")
                break
            
            route = solution["routes"][0]
            timeline = self._simulate_timeline(route, shift_start)
            final_timeline = timeline
            
            self._log_timeline(timeline, shift_start)
            
            # ── Step 4: Verify legs against TomTom ──
            logger.info("--- Step 4: Verifying legs via TomTom v1 ---")
            penalties = self._verify_legs(timeline, locations, matrix)
            
            iter_log = {
                "iteration": iteration + 1,
                "penalties_found": len(penalties),
                "penalty_details": [
                    {"from_idx": p[0], "to_idx": p[1], 
                     "baseline_s": matrix[p[0]][p[1]], "true_s": p[2]}
                    for p in penalties
                ]
            }
            convergence_log.append(iter_log)
            
            if not penalties:
                logger.info(f"✓ CONVERGED at iteration {iteration + 1} — no penalties triggered")
                break
            
            # ── Step 5: Apply penalties ──
            logger.info(f"--- Step 5: Applying {len(penalties)} penalties to matrix ---")
            for (oi, di, true_dur) in penalties:
                old_val = matrix[oi][di]
                new_val = true_dur + self.penalty_weight
                matrix[oi][di] = new_val
                logger.info(
                    f"  matrix[{oi}][{di}]: {old_val}s → {new_val}s "
                    f"(true={true_dur}s, penalty=+{self.penalty_weight}s)"
                )
        
        # ── Build final output ──
        return self._build_output(
            solution=final_solution,
            timeline=final_timeline,
            convergence_log=convergence_log,
            final_matrix=matrix,
            baseline_matrix=baseline_matrix,
            shift_start=shift_start
        )
    
    def _simulate_timeline(
        self, route: Dict[str, Any], shift_start: int
    ) -> List[Dict[str, Any]]:
        """
        Walk through VROOM's steps array, computing exact arrival/departure times.
        VROOM returns step.arrival as seconds offset from the optimization origin.
        """
        timeline = []
        
        for step in route.get("steps", []):
            step_type = step.get("type", "")
            
            if step_type == "job":
                arrival_offset = step.get("arrival", 0)
                service = step.get("service", 0)
                arrival_unix = shift_start + arrival_offset
                departure_unix = arrival_unix + service
                
                timeline.append({
                    "job_id": step.get("id"),
                    "location_index": step.get("location_index", -1),
                    "arrival_unix": arrival_unix,
                    "arrival_utc": datetime.fromtimestamp(arrival_unix, tz=timezone.utc).strftime("%H:%M:%S"),
                    "departure_unix": departure_unix,
                    "departure_utc": datetime.fromtimestamp(departure_unix, tz=timezone.utc).strftime("%H:%M:%S"),
                    "service_seconds": service,
                    "travel_to_seconds": step.get("duration", 0)
                })
            
            elif step_type == "start":
                arrival_offset = step.get("arrival", 0)
                timeline.insert(0, {
                    "type": "depot_start",
                    "location_index": step.get("location_index", 0),
                    "departure_unix": shift_start + arrival_offset,
                    "departure_utc": datetime.fromtimestamp(
                        shift_start + arrival_offset, tz=timezone.utc
                    ).strftime("%H:%M:%S")
                })
            
            elif step_type == "end":
                arrival_offset = step.get("arrival", 0)
                timeline.append({
                    "type": "depot_end",
                    "location_index": step.get("location_index", 0),
                    "arrival_unix": shift_start + arrival_offset,
                    "arrival_utc": datetime.fromtimestamp(
                        shift_start + arrival_offset, tz=timezone.utc
                    ).strftime("%H:%M:%S")
                })
        
        return timeline
    
    def _verify_legs(
        self,
        timeline: List[Dict[str, Any]],
        locations: List[List[float]],
        matrix: List[List[int]]
    ) -> List[Tuple[int, int, int]]:
        """
        For each consecutive pair of stops, query TomTom v1 at the exact
        departure time and compare against the baseline matrix value.
        
        Returns list of (origin_idx, dest_idx, true_duration) for legs
        exceeding the penalty threshold.
        """
        penalties = []
        
        # Extract only job entries (skip depot_start/depot_end for leg verification)
        job_steps = [s for s in timeline if s.get("job_id") is not None]
        
        # Also include the depot start as the first origin
        depot_start = next((s for s in timeline if s.get("type") == "depot_start"), None)
        
        if depot_start and job_steps:
            # Check depot → first job leg
            origin_idx = depot_start["location_index"]
            dest_idx = job_steps[0]["location_index"]
            depart_at = depot_start["departure_unix"]
            
            baseline = matrix[origin_idx][dest_idx]
            true_dur = self.tt_client.get_route_duration(
                locations[origin_idx], locations[dest_idx], depart_at
            )
            
            logger.info(
                f"  Leg depot→Job {job_steps[0]['job_id']}: "
                f"baseline={baseline}s, true={true_dur}s "
                f"(ratio={true_dur/max(baseline,1):.2f})"
            )
            
            if baseline > 0 and true_dur > baseline * self.penalty_threshold:
                penalties.append((origin_idx, dest_idx, true_dur))
        
        # Check job-to-job legs
        for k in range(len(job_steps) - 1):
            origin_idx = job_steps[k]["location_index"]
            dest_idx = job_steps[k + 1]["location_index"]
            depart_at = job_steps[k]["departure_unix"]
            
            baseline = matrix[origin_idx][dest_idx]
            true_dur = self.tt_client.get_route_duration(
                locations[origin_idx], locations[dest_idx], depart_at
            )
            
            logger.info(
                f"  Leg Job {job_steps[k]['job_id']}→Job {job_steps[k+1]['job_id']}: "
                f"baseline={baseline}s, true={true_dur}s "
                f"(ratio={true_dur/max(baseline,1):.2f})"
            )
            
            if baseline > 0 and true_dur > baseline * self.penalty_threshold:
                penalties.append((origin_idx, dest_idx, true_dur))
        
        logger.info(f"  → {len(penalties)} legs exceeded {self.penalty_threshold}x threshold")
        return penalties
    
    def _log_timeline(self, timeline: List[Dict[str, Any]], shift_start: int):
        """Pretty-print the simulated timeline."""
        logger.info("  ┌─────────────────────────────────────────────────┐")
        for step in timeline:
            if step.get("type") == "depot_start":
                logger.info(f"  │ 🏠 DEPOT START  depart={step['departure_utc']}          │")
            elif step.get("type") == "depot_end":
                logger.info(f"  │ 🏠 DEPOT END    arrive={step['arrival_utc']}          │")
            elif step.get("job_id"):
                logger.info(
                    f"  │ 📋 Job {step['job_id']:>4}    "
                    f"arrive={step['arrival_utc']}  "
                    f"depart={step['departure_utc']}  "
                    f"svc={step['service_seconds']}s │"
                )
        logger.info("  └─────────────────────────────────────────────────┘")
    
    def _mock_vroom_solution(
        self,
        vehicles: List[Dict[str, Any]],
        jobs: List[Dict[str, Any]],
        matrix: List[List[int]]
    ) -> Dict[str, Any]:
        """
        Build a plausible mock VROOM solution when the solver isn't available.
        Sequences jobs in nearest-neighbor order using the matrix.
        """
        n_vehicles = len(vehicles)
        steps = []
        current_time = 0
        current_idx = 0  # Start at depot (vehicle 0)
        
        # Start step
        steps.append({
            "type": "start",
            "location_index": 0,
            "arrival": 0,
            "duration": 0,
            "id": vehicles[0]["id"]
        })
        
        # Greedy nearest-neighbor for job ordering
        remaining = list(range(len(jobs)))
        visited_order = []
        
        while remaining:
            best_j = None
            best_cost = float("inf")
            
            for j in remaining:
                job_idx = n_vehicles + j
                cost = matrix[current_idx][job_idx]
                if cost < best_cost:
                    best_cost = cost
                    best_j = j
            
            if best_j is None:
                break
            
            remaining.remove(best_j)
            visited_order.append(best_j)
            
            job_idx = n_vehicles + best_j
            travel_time = matrix[current_idx][job_idx]
            current_time += travel_time
            service = jobs[best_j].get("service", 0)
            
            steps.append({
                "type": "job",
                "id": jobs[best_j]["id"],
                "location_index": job_idx,
                "arrival": current_time,
                "duration": travel_time,
                "service": service
            })
            
            current_time += service
            current_idx = job_idx
        
        # End step — return to depot
        return_time = matrix[current_idx][0]
        current_time += return_time
        
        steps.append({
            "type": "end",
            "location_index": 0,
            "arrival": current_time,
            "duration": return_time,
            "id": vehicles[0]["id"]
        })
        
        return {
            "code": 0,
            "routes": [{
                "vehicle": vehicles[0]["id"],
                "steps": steps,
                "duration": current_time,
                "service": sum(j.get("service", 0) for j in jobs)
            }],
            "summary": {
                "cost": current_time,
                "routes": 1,
                "unassigned": 0
            },
            "_mock": True
        }
    
    def _build_output(
        self,
        solution: Dict[str, Any],
        timeline: List[Dict[str, Any]],
        convergence_log: List[Dict[str, Any]],
        final_matrix: List[List[int]],
        baseline_matrix: List[List[int]],
        shift_start: int
    ) -> Dict[str, Any]:
        """Assemble the final output JSON."""
        # Build ETA report from timeline
        eta_report = []
        for step in (timeline or []):
            if step.get("job_id"):
                eta_report.append({
                    "job_id": step["job_id"],
                    "expected_arrival_utc": step.get("arrival_utc"),
                    "expected_departure_utc": step.get("departure_utc"),
                    "service_time_minutes": step.get("service_seconds", 0) / 60,
                    "travel_to_minutes": step.get("travel_to_seconds", 0) / 60
                })
        
        return {
            "status": "converged" if convergence_log and not convergence_log[-1]["penalties_found"] else "max_iterations_reached",
            "shift_start_utc": datetime.fromtimestamp(shift_start, tz=timezone.utc).isoformat(),
            "total_iterations": len(convergence_log),
            "convergence_log": convergence_log,
            "eta_report": eta_report,
            "vroom_solution": solution,
            "baseline_matrix": baseline_matrix,
            "final_matrix": final_matrix,
            "is_mock_solution": solution.get("_mock", False)
        }


# ════════════════════════════════════════════════
# Data Loading
# ════════════════════════════════════════════════

def load_mock_data(
    jobs_path: str = "data/mock/jobs.json",
    engineers_path: str = "data/mock/engineers.json",
    skills_path: str = "data/mock/skills.json"
) -> Tuple[List[Dict], List[Dict], List[List[float]]]:
    """
    Load and transform mock data into VROOM-ready format.
    Returns (vehicles, jobs, locations) where locations = [vehicle_starts..., job_locs...].
    """
    with open(skills_path) as f:
        skills_map = json.load(f)
    
    with open(engineers_path) as f:
        raw_engineers = json.load(f)["engineers"]
    
    with open(jobs_path) as f:
        raw_jobs = json.load(f)["jobs"]
    
    # Transform engineers → VROOM vehicles
    vehicles = []
    locations = []
    
    for eng in raw_engineers:
        start = [eng["start_longitude"], eng["start_latitude"]]
        end = [eng.get("end_longitude", eng["start_longitude"]),
               eng.get("end_latitude", eng["start_latitude"])]
        
        # Map skill names to integer IDs
        skill_ids = [skills_map[s] for s in eng.get("skills", []) if s in skills_map]
        
        # Parse working hours to VROOM epoch seconds
        wh = eng.get("working_hours", {})
        shift_start_iso = wh.get("start", "2026-03-10T08:00:00Z")
        shift_end_iso = wh.get("end", "2026-03-10T16:00:00Z")
        
        shift_start_unix = int(datetime.fromisoformat(shift_start_iso.replace("Z", "+00:00")).timestamp())
        shift_end_unix = int(datetime.fromisoformat(shift_end_iso.replace("Z", "+00:00")).timestamp())
        
        vehicles.append({
            "id": eng["id"],
            "start": start,
            "end": end,
            "skills": skill_ids,
            "time_window": [shift_start_unix, shift_end_unix]
        })
        locations.append(start)
    
    # Transform raw jobs → VROOM jobs
    jobs = []
    for raw_job in raw_jobs:
        loc = [raw_job["longitude"], raw_job["latitude"]]
        skill_ids = [skills_map[s] for s in raw_job.get("required_skills", []) if s in skills_map]
        
        job = {
            "id": raw_job["id"],
            "location": loc,
            "skills": skill_ids,
            "service": raw_job.get("service_time", 1800)
        }
        
        jobs.append(job)
        locations.append(loc)
    
    return vehicles, jobs, locations


# ════════════════════════════════════════════════
# Main Entry Point
# ════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Morning Planner — Iterative TDVRP Solver")
    parser.add_argument("--jobs", default="data/mock/jobs.json", help="Path to jobs JSON")
    parser.add_argument("--engineers", default="data/mock/engineers.json", help="Path to engineers JSON")
    parser.add_argument("--skills", default="data/mock/skills.json", help="Path to skills mapping JSON")
    parser.add_argument("--iterations", type=int, default=3, help="Max convergence iterations")
    parser.add_argument("--threshold", type=float, default=1.25, help="Penalty threshold (e.g. 1.25 = 25%%)")
    parser.add_argument("--output", default="morning_shift_plan.json", help="Output file path")
    
    args = parser.parse_args()
    
    logger.info("Loading mock data...")
    vehicles, jobs, locations = load_mock_data(args.jobs, args.engineers, args.skills)
    
    logger.info(f"Loaded {len(vehicles)} vehicles, {len(jobs)} jobs, {len(locations)} locations")
    
    # Use the first vehicle's shift start as the departure time
    shift_start = vehicles[0].get("time_window", [0, 0])[0]
    if shift_start == 0:
        shift_start = int(datetime.now(timezone.utc).timestamp())
    
    # Run convergence solver
    solver = ConvergenceSolver(
        max_iterations=args.iterations,
        penalty_threshold=args.threshold
    )
    
    result = solver.solve(vehicles, jobs, locations, shift_start)
    
    # Save output
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"OUTPUT SAVED: {args.output}")
    logger.info(f"Status: {result['status']}")
    logger.info(f"Iterations: {result['total_iterations']}")
    logger.info(f"Mock solution: {result['is_mock_solution']}")
    logger.info(f"{'='*60}")
    
    # Print ETA summary
    if result["eta_report"]:
        logger.info("\n📋 FINAL ETA REPORT:")
        logger.info("-" * 50)
        for eta in result["eta_report"]:
            logger.info(
                f"  Job {eta['job_id']:>4}: "
                f"ETA {eta['expected_arrival_utc']} → "
                f"depart {eta['expected_departure_utc']} "
                f"(svc={eta['service_time_minutes']:.0f}min, "
                f"travel={eta['travel_to_minutes']:.1f}min)"
            )
