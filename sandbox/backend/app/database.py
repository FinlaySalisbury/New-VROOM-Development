"""
Database — SQLite async connection manager and CRUD operations for test history.
"""
import aiosqlite
import json
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

DATABASE_PATH = "sandbox_history.db"

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS test_runs (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    name            TEXT,
    strategy        TEXT NOT NULL,
    num_engineers   INTEGER NOT NULL,
    num_jobs        INTEGER NOT NULL,
    scenario_state  TEXT NOT NULL,
    vroom_solution  TEXT,
    trips_geojson   TEXT,
    faults_geojson  TEXT,
    routes_geojson  TEXT,
    total_duration_s  INTEGER,
    total_distance_m  INTEGER,
    unassigned_jobs   INTEGER,
    api_cost_estimate REAL
);
"""


async def get_db() -> aiosqlite.Connection:
    """Get an async SQLite connection."""
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def create_tables():
    """Initialize the database schema."""
    db = await get_db()
    try:
        await db.execute(CREATE_TABLE_SQL)
        await db.commit()
        logger.info("Database tables initialized")
    finally:
        await db.close()


async def save_test_run(
    run_id: str,
    name: Optional[str],
    strategy: str,
    num_engineers: int,
    num_jobs: int,
    scenario_state: dict,
    vroom_solution: Optional[dict],
    trips_geojson: dict,
    faults_geojson: dict,
    routes_geojson: dict,
    total_duration_s: Optional[int],
    total_distance_m: Optional[int],
    unassigned_jobs: Optional[int],
    api_cost_estimate: Optional[float],
):
    """Persist a completed test run to the database."""
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO test_runs (
                id, name, strategy, num_engineers, num_jobs,
                scenario_state, vroom_solution,
                trips_geojson, faults_geojson, routes_geojson,
                total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id, name, strategy, num_engineers, num_jobs,
                json.dumps(scenario_state),
                json.dumps(vroom_solution) if vroom_solution else None,
                json.dumps(trips_geojson),
                json.dumps(faults_geojson),
                json.dumps(routes_geojson),
                total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate,
            ),
        )
        await db.commit()
        logger.info(f"Saved test run {run_id}")
    finally:
        await db.close()


async def get_test_runs(limit: int = 50):
    """Retrieve recent test run summaries, newest first."""
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT id, created_at, name, strategy, num_engineers, num_jobs,
                   total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate
            FROM test_runs
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_test_run_by_id(run_id: str):
    """Retrieve a single test run with full scenario state for replay."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM test_runs WHERE id = ?", (run_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        result = dict(row)
        # Parse JSON fields
        for field in ("scenario_state", "vroom_solution", "trips_geojson", "faults_geojson", "routes_geojson"):
            if result.get(field):
                result[field] = json.loads(result[field])
        return result
    finally:
        await db.close()
