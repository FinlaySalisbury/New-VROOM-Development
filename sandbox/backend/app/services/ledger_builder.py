"""
Dispatch Ledger Builder.

Assembles a compact, typed record of the high-value facts a solve computes and
would otherwise discard — assignment reasoning, deterministic unassigned-job
diagnosis, per-engineer load, convergence progress, and notable traffic
discoveries. The ledger is persisted alongside the test run (test_runs
.dispatch_ledger) and injected wholesale into the Route Explainer's context so
the assistant reads conclusions instead of re-deriving them from raw arrays.

The schema here is deliberately typed and normalizable so a future project-level
insights layer can aggregate ledgers across many runs.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# A leg is "notable" once its live duration is at least this multiple of
# free-flow — i.e. traffic materially shaped the route.
NOTABLE_TRAFFIC_MULTIPLIER = 1.3


def _resolve_skill_names(skill_ids: list, skills_map: dict) -> list[str]:
    """Convert numeric skill IDs to human-readable names using the run's map."""
    names = []
    for sid in skill_ids:
        name = skills_map.get(sid, skills_map.get(str(sid)))
        names.append(str(name) if name is not None else f"skill_{sid}")
    return names


def _normalise_skills_map(scenario: dict) -> dict:
    """Return an id→name skills map, tolerating name→id or id→name storage."""
    raw = scenario.get("skills_map", {}) or {}
    out: dict = {}
    for k, v in raw.items():
        if isinstance(v, int):
            out[v] = str(k)
        else:
            out[int(k) if str(k).isdigit() else k] = str(v)
    return out


def _clean_name(vehicle: dict) -> str:
    """
    Best-effort readable engineer name from a possibly-encoded vehicle name.
    Tolerates both the scenario shape (`name`/`id`) and the routes_data shape
    (`vehicle_name`/`vehicle_id`).
    """
    vid = vehicle.get("id", vehicle.get("vehicle_id"))
    raw = vehicle.get("name") or vehicle.get("vehicle_name") or f"Engineer #{vid}"
    base = raw.split("_Day")[0]
    if "|" in base:
        base = base.split("|")[0]
    return base


def _windows_overlap(job_windows: list, shift_window: Optional[list]) -> bool:
    """True if any of the job's SLA windows overlaps the engineer's shift."""
    if not shift_window or len(shift_window) < 2:
        return True  # no shift constraint recorded → treat as open
    if not job_windows:
        return True  # job accepts any time
    s0, s1 = shift_window[0], shift_window[1]
    for w in job_windows:
        if len(w) >= 2 and w[0] <= s1 and w[1] >= s0:
            return True
    return False


def diagnose_unassigned(scenario: dict, unassigned_ids: list, skills_map: dict) -> list[dict]:
    """
    Deterministically explain why each unassigned job could not be placed.

    VROOM does not emit rejection reasons, so we test every engineer post-hoc
    for skill, SLA-window and shift-duration feasibility and report the blocking
    condition(s). This is the single highest-value field for the assistant.
    """
    vehicles = scenario.get("vehicles", [])
    jobs_by_id = {j.get("id"): j for j in scenario.get("jobs", [])}
    out = []

    for jid in unassigned_ids:
        job = jobs_by_id.get(jid)
        if job is None:
            out.append({"job_id": jid, "reason": "Job not found in scenario.", "blockers": []})
            continue

        req_skills = set(job.get("skills", []))
        job_windows = job.get("time_windows", [])
        service_s = job.get("service", 0)

        skill_ok, window_ok, shift_ok = [], [], []
        for v in vehicles:
            has_skills = req_skills.issubset(set(v.get("skills", [])))
            if not has_skills:
                continue
            skill_ok.append(v)
            if not _windows_overlap(job_windows, v.get("time_window")):
                continue
            window_ok.append(v)
            tw = v.get("time_window")
            if tw and len(tw) >= 2 and service_s <= (tw[1] - tw[0]):
                shift_ok.append(v)

        req_names = _resolve_skill_names(sorted(req_skills), skills_map)
        if not skill_ok:
            reason = f"No engineer holds all required skills ({', '.join(req_names) or 'none'})."
            blockers = ["skill_mismatch"]
        elif not window_ok:
            reason = (
                f"{len(skill_ok)} engineer(s) are skill-matched, but none are on shift "
                f"within the job's SLA window."
            )
            blockers = ["time_window"]
        elif not shift_ok:
            reason = (
                f"{len(window_ok)} engineer(s) match skills and window, but the service time "
                f"exceeds their remaining shift capacity."
            )
            blockers = ["shift_capacity"]
        else:
            reason = (
                f"{len(shift_ok)} engineer(s) were feasible; the job was dropped by the optimiser "
                f"as a lower-priority trade-off against route cost / other jobs."
            )
            blockers = ["optimiser_tradeoff"]

        out.append(
            {
                "job_id": jid,
                "description": job.get("description", ""),
                "required_skills": req_names,
                "priority": job.get("priority"),
                "urgency": job.get("urgency_level"),
                "reason": reason,
                "blockers": blockers,
            }
        )
    return out


def _skill_feasibility(scenario: dict) -> list[dict]:
    """Per job, which engineers' skills satisfy it (powers 'who could have done it')."""
    vehicles = scenario.get("vehicles", [])
    out = []
    for job in scenario.get("jobs", []):
        req = set(job.get("skills", []))
        capable = [
            {"vehicle_id": v.get("id"), "name": _clean_name(v)}
            for v in vehicles
            if req.issubset(set(v.get("skills", [])))
        ]
        out.append({"job_id": job.get("id"), "capable_engineers": capable})
    return out


def _engineer_load(routes_data: list) -> list[dict]:
    """Per-engineer workload summary derived from the enhanced routes data."""
    out = []
    for rd in routes_data or []:
        legs = rd.get("legs", [])
        travel_s = sum(l.get("duration_s", 0) for l in legs)
        free_flow_s = sum(l.get("free_flow_duration_s", 0) for l in legs)
        service_s = sum(
            step.get("service_s", 0)
            for step in rd.get("timeline", [])
            if step.get("type") == "job"
        )
        mults = [l.get("traffic_multiplier") for l in legs if l.get("traffic_multiplier")]
        avg_mult = round(sum(mults) / len(mults), 2) if mults else 1.0

        tw = rd.get("vehicle_time_window")
        shift_s = (tw[1] - tw[0]) if tw and len(tw) >= 2 else None
        busy_s = travel_s + service_s
        utilisation = round(100 * busy_s / shift_s) if shift_s else None

        out.append(
            {
                "vehicle_id": rd.get("vehicle_id"),
                "name": _clean_name(rd),
                "jobs_assigned": rd.get("num_jobs_assigned", 0),
                "service_min": round(service_s / 60),
                "travel_min": round(travel_s / 60),
                "free_flow_min": round(free_flow_s / 60),
                "traffic_delta_min": round((travel_s - free_flow_s) / 60),
                "avg_traffic_multiplier": avg_mult,
                "shift_utilisation_pct": utilisation,
            }
        )
    return out


def _traffic_discovery(routes_data: list) -> list[dict]:
    """Legs where live traffic materially exceeded free-flow."""
    out = []
    for rd in routes_data or []:
        for leg in rd.get("legs", []):
            mult = leg.get("traffic_multiplier") or 1.0
            if mult >= NOTABLE_TRAFFIC_MULTIPLIER:
                out.append(
                    {
                        "vehicle_id": rd.get("vehicle_id"),
                        "leg_id": leg.get("leg_id"),
                        "free_flow_min": round(leg.get("free_flow_duration_s", 0) / 60),
                        "actual_min": round(leg.get("duration_s", 0) / 60),
                        "multiplier": round(mult, 2),
                    }
                )
    out.sort(key=lambda x: x["multiplier"], reverse=True)
    return out[:10]  # keep the ledger compact — the worst offenders only


def _convergence(convergence_log: list) -> dict:
    """Condense the per-iteration convergence log for the assistant."""
    if not convergence_log:
        return {"ran": False, "iterations": 0, "status": "not_applicable", "log": []}
    last = convergence_log[-1]
    converged = not last.get("penalties_found")
    log = [
        {
            "iteration": entry.get("iteration"),
            "penalties_found": entry.get("penalties_found"),
        }
        for entry in convergence_log
    ]
    return {
        "ran": True,
        "iterations": len(convergence_log),
        "status": "converged" if converged else "max_iterations_reached",
        "log": log,
    }


def build_dispatch_ledger(
    scenario: dict,
    vroom_solution: dict,
    routes_data: list,
    convergence_log: Optional[list],
    strategy: str,
) -> dict:
    """
    Build the per-dispatch ledger. Safe to call for every strategy — fields that
    don't apply (e.g. convergence for naive/inhouse) degrade to empty/false.
    """
    solution = vroom_solution or {}
    skills_map = _normalise_skills_map(scenario)
    unassigned_ids = [u.get("id") for u in solution.get("unassigned", []) or []]
    summary = solution.get("summary", {}) or {}

    ledger = {
        "schema_version": 1,
        "meta": {
            "strategy": strategy,
            "solver_mock": bool(solution.get("_mock", False)),
            "routes": summary.get("routes", len(solution.get("routes", []) or [])),
            "unassigned_count": len(unassigned_ids),
            "total_cost": summary.get("cost"),
        },
        "convergence": _convergence(convergence_log or []),
        "engineer_load": _engineer_load(routes_data),
        "traffic_discovery": _traffic_discovery(routes_data),
        "unassigned_diagnosis": diagnose_unassigned(scenario, unassigned_ids, skills_map),
        "skill_feasibility": _skill_feasibility(scenario),
    }
    logger.info(
        "Built dispatch ledger: %d engineers, %d unassigned diagnosed, %d traffic hotspots",
        len(ledger["engineer_load"]),
        len(ledger["unassigned_diagnosis"]),
        len(ledger["traffic_discovery"]),
    )
    return ledger
