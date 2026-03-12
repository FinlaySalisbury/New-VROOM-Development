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

from app.core.tomtom_client import TomTomClient
from app.services.matrix_weighter import TrafficMatrixWeighter
from app.core.vroom_interface import VroomSolverInterface

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
        penalty_weight: int = 120,
        tt_client: Optional[TomTomClient] = None
    ):
        self.api_key = api_key or os.environ.get("TOMTOM_API_KEY")
        self.max_iterations = max_iterations
        self.penalty_threshold = penalty_threshold
        self.penalty_weight = penalty_weight
        
        # Initialize components
        self.tt_client = tt_client or TomTomClient(api_key=self.api_key or "MOCK_KEY")
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
                solution = self._mock_vroom_solution(vehicles, jobs, matrix, shift_start)
            
            final_solution = solution
            
            # ── Step 3: Simulate timeline for ALL routes ──
            logger.info("--- Step 3: Simulating route timelines ---")
            if "routes" not in solution or not solution["routes"]:
                logger.error("No routes in VROOM solution")
                break
            
            all_timelines = []
            all_penalties = []
            
            for ri, route in enumerate(solution["routes"]):
                vehicle_id = route.get("vehicle", ri)
                # Use the vehicle's own shift start if available
                v_shift = shift_start
                for v in vehicles:
                    if v["id"] == vehicle_id:
                        tw = v.get("time_window", [shift_start])
                        v_shift = tw[0] if tw else shift_start
                        break
                
                timeline = self._simulate_timeline(route, v_shift)
                timeline_with_meta = {
                    "vehicle_id": vehicle_id,
                    "route_index": ri,
                    "steps": timeline
                }
                all_timelines.append(timeline_with_meta)
                
                logger.info(f"\n  Route {ri+1} (Vehicle {vehicle_id}):")
                self._log_timeline(timeline, v_shift)
                
                # ── Step 4: Verify legs against TomTom ──
                logger.info(f"  Verifying legs for Vehicle {vehicle_id}...")
                route_penalties = self._verify_legs(timeline, locations, matrix)
                all_penalties.extend(route_penalties)
            
            final_timeline = all_timelines
            
            iter_log = {
                "iteration": iteration + 1,
                "penalties_found": len(all_penalties),
                "penalty_details": [
                    {"from_idx": p[0], "to_idx": p[1], 
                     "baseline_s": matrix[p[0]][p[1]], "true_s": p[2]}
                    for p in all_penalties
                ]
            }
            convergence_log.append(iter_log)
            
            if not all_penalties:
                logger.info(f"✓ CONVERGED at iteration {iteration + 1} — no penalties triggered")
                break
                
            # Strategy 4: Convergence-Aware Iteration Limiting (Smart Exit)
            if iteration > 0 and all_penalties:
                total_gap = sum(max(0, p[2] - matrix[p[0]][p[1]]) for p in all_penalties)
                max_gap = max((max(0, p[2] - matrix[p[0]][p[1]]) for p in all_penalties), default=0)
                
                # If no single leg is wrong by more than 3 minutes (180s)
                # AND total network error is under 10 minutes (600s), stop optimizing.
                if max_gap <= 180 and total_gap <= 600:
                    logger.info(f"✓ SMART EXIT at iteration {iteration + 1} — "
                                f"route is practically optimal (max gap {max_gap}s, total gap {total_gap}s)")
                    break
            
            # ── Step 5: Apply penalties ──
            logger.info(f"--- Step 5: Applying {len(all_penalties)} penalties to matrix ---")
            for (oi, di, true_dur) in all_penalties:
                old_val = matrix[oi][di]
                
                # Dynamic scaling: Penalty = the gap + static weight
                # If true is 3600s and baseline was 1200s, gap is 2400s.
                gap = true_dur - old_val
                dynamic_penalty = max(0, gap) + self.penalty_weight
                
                new_val = true_dur + dynamic_penalty
                matrix[oi][di] = new_val
                
                logger.info(
                    f"  matrix[{oi}][{di}]: {old_val}s → {new_val}s "
                    f"(true={true_dur}s, gap={gap}s, applied_penalty=+{dynamic_penalty}s)"
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
                arrival_unix = step.get("arrival", 0)
                service = step.get("service", 0)
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
                arrival_unix = step.get("arrival", 0)
                if arrival_unix == 0:
                    arrival_unix = shift_start
                    
                timeline.insert(0, {
                    "type": "depot_start",
                    "location_index": step.get("location_index", 0),
                    "departure_unix": arrival_unix,
                    "departure_utc": datetime.fromtimestamp(
                        arrival_unix, tz=timezone.utc
                    ).strftime("%H:%M:%S")
                })
            
            elif step_type == "end":
                arrival_unix = step.get("arrival", 0)
                timeline.append({
                    "type": "depot_end",
                    "location_index": step.get("location_index", 0),
                    "arrival_unix": arrival_unix,
                    "arrival_utc": datetime.fromtimestamp(
                        arrival_unix, tz=timezone.utc
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
        matrix: List[List[int]],
        shift_start: int
    ) -> Dict[str, Any]:
        """
        Build a plausible mock VROOM solution when the solver isn't available.
        Distributes jobs across multiple vehicles with skill-matching and
        nearest-neighbor sequencing.
        """
        n_vehicles = len(vehicles)
        n_jobs = len(jobs)
        
        # Per-vehicle state
        vehicle_states = []
        for vi, v in enumerate(vehicles):
            v_shift = v.get("time_window", [shift_start])[0] if v.get("time_window") else shift_start
            vehicle_states.append({
                "vehicle_id": v["id"],
                "depot_idx": vi,
                "current_idx": vi,
                "current_time": v_shift,
                "start_time": v_shift,
                "skills": set(v.get("skills", [])),
                "steps": [{
                    "type": "start",
                    "location_index": vi,
                    "arrival": v_shift,
                    "duration": 0,
                    "id": v["id"]
                }],
                "assigned_jobs": []
            })
        
        # Build job skill sets for matching
        remaining = list(range(n_jobs))
        unassigned = []
        
        # Round-robin with nearest-neighbor: assign jobs to best-fit vehicle
        while remaining:
            best_assignment = None
            best_cost = float("inf")
            
            for j in remaining:
                job_skills = set(jobs[j].get("skills", []))
                job_idx = n_vehicles + j
                
                for vi, vs in enumerate(vehicle_states):
                    # Skill check: vehicle must have at least one matching skill
                    if job_skills and vs["skills"] and not (job_skills & vs["skills"]):
                        continue
                    
                    # Cost: travel time from vehicle's current position + load balance penalty
                    travel = matrix[vs["current_idx"]][job_idx]
                    # Add small bias toward vehicles with less accumulated time (load balance)
                    balance_penalty = vs["current_time"] * 0.1
                    total_cost = travel + balance_penalty
                    
                    if total_cost < best_cost:
                        best_cost = total_cost
                        best_assignment = (vi, j)
            
            if best_assignment is None:
                # No vehicle can serve remaining jobs (skill mismatch)
                unassigned.extend(remaining)
                break
            
            vi, j = best_assignment
            remaining.remove(j)
            
            vs = vehicle_states[vi]
            job_idx = n_vehicles + j
            travel_time = matrix[vs["current_idx"]][job_idx]
            vs["current_time"] += travel_time
            service = jobs[j].get("service", 0)
            
            vs["steps"].append({
                "type": "job",
                "id": jobs[j]["id"],
                "location_index": job_idx,
                "arrival": vs["current_time"],
                "duration": travel_time,
                "service": service
            })
            
            vs["current_time"] += service
            vs["current_idx"] = job_idx
            vs["assigned_jobs"].append(j)
        
        routes = []
        total_cost = 0
        for vs in vehicle_states:
            if len(vs["steps"]) <= 1:
                continue  # Skip vehicles with no jobs assigned
            
            return_time = matrix[vs["current_idx"]][vs["depot_idx"]]
            vs["current_time"] += return_time
            
            vs["steps"].append({
                "type": "end",
                "location_index": vs["depot_idx"],
                "arrival": vs["current_time"],
                "duration": return_time,
                "id": vs["vehicle_id"]
            })
            
            route_service = sum(
                jobs[j].get("service", 0) for j in vs["assigned_jobs"]
            )
            
            route_duration = vs["current_time"] - vs["start_time"]
            routes.append({
                "vehicle": vs["vehicle_id"],
                "steps": vs["steps"],
                "duration": route_duration,
                "service": route_service
            })
            total_cost += route_duration
        
        logger.info(f"Mock solver: {len(routes)} routes, {n_jobs - len(unassigned)} assigned, {len(unassigned)} unassigned")
        
        return {
            "code": 0,
            "routes": routes,
            "summary": {
                "cost": total_cost,
                "routes": len(routes),
                "unassigned": len(unassigned)
            },
            "unassigned": [{"id": jobs[j]["id"]} for j in unassigned],
            "_mock": True
        }

    
    def _build_output(
        self,
        solution: Dict[str, Any],
        timeline,
        convergence_log: List[Dict[str, Any]],
        final_matrix: List[List[int]],
        baseline_matrix: List[List[int]],
        shift_start: int
    ) -> Dict[str, Any]:
        """Assemble the final output JSON."""
        # Build ETA report from multi-route timeline
        eta_report = []
        route_timelines = timeline or []
        
        for rt in route_timelines:
            vehicle_id = rt.get("vehicle_id", "?")
            for step in rt.get("steps", []):
                if step.get("job_id"):
                    eta_report.append({
                        "vehicle_id": vehicle_id,
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
            "route_timelines": route_timelines,
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


# End of convergence_solver.py
