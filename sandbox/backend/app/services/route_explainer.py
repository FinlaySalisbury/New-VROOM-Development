"""
Route Explainer — Context assembly and Gemini API integration.

Assembles VROOM scenario data into structured XML context blocks
and sends them to Gemini 2.5 Pro for natural-language explanations.
"""
import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Skill ID → Name mapping (fallback if scenario doesn't include it)
DEFAULT_SKILLS_MAP = {
    1: "traffic_light_repair",
    2: "cctv_maintenance",
    3: "fiber_splicing",
    4: "high_voltage",
    5: "sign_installation",
    6: "road_marking",
}

SYSTEM_PROMPT = """You are the InView Routing Intelligence Assistant. Your role is to explain complex VROOM optimization outputs to logistics managers in a friendly, concise, and highly analytical tone.

You have access to the routing logs, live traffic data, engineer profiles, and job constraints. 

CORE EXPLANATION DIRECTIVES:
1. Job Allocation: When asked why Engineer A got Job X, cross-reference Engineer A's skills and inventory with Job X's requirements. Look at the shift constraints to prove why Engineer B was not viable.
2. Traffic Awareness: Explicitly quantify the time saved by using TomTom traffic data vs. naive routing. If a route looks geographically inefficient, explain how live traffic delays necessitated it.
3. SLA & Urgency: If an urgent job (2-hour window) disrupted a localized cluster of jobs, explain that urgency supersedes geographical density.
4. Unassigned Jobs: If the <ROUTING_OUTPUT> contains unassigned jobs, you MUST explain exactly why. Common reasons to look for: missing skills, lack of spare parts, shift time exhaustion, or site access time window violations.

CONVERSATIONAL RULES:
- Keep answers friendly, professional, and concise. Avoid dumping raw JSON back to the user.
- If the user asks a hypothetical question (e.g., 'What if we added a mid-shift injection here?'), use the provided constraints to simulate the likely VROOM behavior (e.g., 'If a new 2-hour urgent fault drops in Westminster, Engineer A would be diverted, likely causing Job Y to be dropped due to shift limits').
- Always base your logic strictly on the provided JSON context.
- Use markdown formatting: **bold** for key metrics, bullet points for lists, and short tables when comparing options.
"""


def _resolve_skills(skill_ids: list, skills_map: dict) -> list[str]:
    """Convert numeric skill IDs to human-readable names."""
    return [skills_map.get(sid, skills_map.get(str(sid), f"skill_{sid}")) for sid in skill_ids]


def _format_time(unix_ts: int) -> str:
    """Format a Unix timestamp as HH:MM UTC."""
    from datetime import datetime, timezone
    try:
        return datetime.fromtimestamp(unix_ts, tz=timezone.utc).strftime("%H:%M")
    except (OSError, ValueError):
        return "??:??"


def assemble_context(run_data: dict) -> str:
    """
    Build the 4 XML context blocks from a stored test run.
    
    Args:
        run_data: Full test run dict from the database (includes
                  scenario_state, vroom_solution, routes_data).
    
    Returns:
        A single string containing all context blocks.
    """
    scenario = run_data.get("scenario_state", {})
    solution = run_data.get("vroom_solution", {})
    routes_data = run_data.get("routes_data", [])
    
    # Skills map: prefer scenario's own, fall back to default
    raw_map = scenario.get("skills_map", {})
    skills_map = {}
    for k, v in raw_map.items():
        # The map might be name→id or id→name; normalise to id→name
        if isinstance(v, int):
            skills_map[v] = str(k)
        else:
            skills_map[int(k) if str(k).isdigit() else k] = str(v)
    if not skills_map:
        skills_map = DEFAULT_SKILLS_MAP

    blocks = []

    # ── ENGINEER_PROFILES ──
    engineers = scenario.get("vehicles", [])
    eng_lines = []
    for eng in engineers:
        eid = eng.get("id")
        name = eng.get("name", f"Engineer_{eid}")
        skill_names = _resolve_skills(eng.get("skills", []), skills_map)
        tw = eng.get("time_window", [])
        tw_str = f"{_format_time(tw[0])} – {_format_time(tw[1])}" if len(tw) >= 2 else "unknown"
        shift_dur_h = round((tw[1] - tw[0]) / 3600, 1) if len(tw) >= 2 else "?"
        start = eng.get("start", [])
        end = eng.get("end", [])
        
        eng_lines.append(
            f"  Engineer #{eid} ({name}):\n"
            f"    Skills: {', '.join(skill_names)}\n"
            f"    Shift Window: {tw_str} ({shift_dur_h}h)\n"
            f"    Depot: [{start[0]:.4f}, {start[1]:.4f}] → [{end[0]:.4f}, {end[1]:.4f}]"
        )
    blocks.append(f"<ENGINEER_PROFILES>\n" + "\n".join(eng_lines) + "\n</ENGINEER_PROFILES>")

    # ── JOB_MANIFEST ──
    jobs = scenario.get("jobs", [])
    job_lines = []
    for job in jobs:
        jid = job.get("id")
        desc = job.get("description", "")
        skill_names = _resolve_skills(job.get("skills", []), skills_map)
        service_min = round(job.get("service", 0) / 60)
        priority = job.get("priority", "?")
        urgency = job.get("urgency_level", "medium")
        tws = job.get("time_windows", [])
        tw_str = f"{_format_time(tws[0][0])} – {_format_time(tws[0][1])}" if tws else "any"
        loc = job.get("location", [])
        loc_str = f"[{loc[0]:.4f}, {loc[1]:.4f}]" if len(loc) >= 2 else "?"

        job_lines.append(
            f"  Job #{jid}: {desc}\n"
            f"    Required Skills: {', '.join(skill_names)}\n"
            f"    Service Time: {service_min}min | Priority: {priority} | Urgency: {urgency}\n"
            f"    SLA Window: {tw_str} | Location: {loc_str}"
        )
    blocks.append(f"<JOB_MANIFEST>\n" + "\n".join(job_lines) + "\n</JOB_MANIFEST>")

    # ── ROUTING_OUTPUT ──
    routes_summary = []
    if solution and "routes" in solution:
        for route in solution["routes"]:
            vid = route.get("vehicle")
            steps = route.get("steps", [])
            dur = route.get("duration", 0)
            job_ids = [s.get("job", s.get("id")) for s in steps if s.get("type") == "job"]
            routes_summary.append(
                f"  Vehicle #{vid}: {len(job_ids)} jobs → [{', '.join(str(j) for j in job_ids)}] "
                f"| Duration: {round(dur / 60)}min"
            )
    
    unassigned = solution.get("unassigned", [])
    unassigned_ids = [u.get("id") for u in unassigned] if unassigned else []
    
    routing_block = "Routes:\n" + "\n".join(routes_summary) if routes_summary else "No routes."
    routing_block += f"\n\nUnassigned Jobs ({len(unassigned_ids)}): {unassigned_ids if unassigned_ids else 'None'}"
    
    summary = solution.get("summary", {})
    if summary:
        routing_block += (
            f"\n\nSummary: {summary.get('routes', 0)} routes, "
            f"total cost={summary.get('cost', 0)}, "
            f"unassigned={summary.get('unassigned', 0)}"
        )
    
    blocks.append(f"<ROUTING_OUTPUT>\n{routing_block}\n</ROUTING_OUTPUT>")

    # ── TRAFFIC_DELTA ──
    traffic_lines = []
    if routes_data:
        for rd in routes_data:
            vid = rd.get("vehicle_id")
            legs = rd.get("legs", [])
            total_actual = sum(l.get("duration_s", 0) for l in legs)
            total_ff = sum(l.get("free_flow_duration_s", 0) for l in legs)
            delta = total_actual - total_ff
            delta_sign = "+" if delta > 0 else ""
            avg_mult = (
                round(sum(l.get("traffic_multiplier", 1.0) for l in legs) / max(len(legs), 1), 2)
                if legs else 1.0
            )
            traffic_lines.append(
                f"  Engineer #{vid}: {len(legs)} legs | "
                f"Traffic-aware: {round(total_actual / 60)}min | "
                f"Free-flow: {round(total_ff / 60)}min | "
                f"Delta: {delta_sign}{round(delta / 60)}min | "
                f"Avg multiplier: {avg_mult}x"
            )
    
    if traffic_lines:
        blocks.append(f"<TRAFFIC_DELTA>\n" + "\n".join(traffic_lines) + "\n</TRAFFIC_DELTA>")
    else:
        blocks.append("<TRAFFIC_DELTA>\nNo traffic data available for this run.\n</TRAFFIC_DELTA>")

    return "\n\n".join(blocks)


def ask_gemini(
    context: str,
    message: str,
    history: list[dict[str, str]],
    api_key: str,
) -> str:
    """
    Call Gemini 2.5 Pro with the assembled context and conversation history.
    
    Args:
        context: The assembled XML context blocks.
        message: The user's current question.
        history: Previous conversation turns [{role, content}, ...].
        api_key: Gemini API key.
    
    Returns:
        The assistant's response text.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    # Build the full system instruction with injected context
    full_system = (
        SYSTEM_PROMPT.strip()
        + "\n\n--- SCENARIO DATA ---\n\n"
        + context
    )

    # Build conversation contents
    contents = []
    for turn in history:
        role = turn.get("role", "user")
        # Gemini uses "user" and "model" roles
        gemini_role = "model" if role == "assistant" else "user"
        contents.append(
            types.Content(
                role=gemini_role,
                parts=[types.Part.from_text(text=turn["content"])],
            )
        )
    
    # Add the current user message
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=message)],
        )
    )

    # Call Gemini
    logger.info(f"Calling Gemini with {len(contents)} conversation turns, context={len(context)} chars")
    
    response = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=full_system,
            temperature=0.3,
            top_p=0.8,
        ),
    )

    reply = response.text or "I wasn't able to generate a response. Please try again."
    logger.info(f"Gemini response: {len(reply)} chars")
    return reply
