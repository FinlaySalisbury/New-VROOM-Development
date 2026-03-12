"""
Database — SQLite async connection manager and CRUD operations for test history.
"""
import aiosqlite
import json
import logging
from typing import Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)

DATABASE_PATH = "sandbox_history.db"

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS test_runs (
    id              TEXT PRIMARY KEY,
    test_number     INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    name            TEXT,
    strategy        TEXT NOT NULL,
    num_engineers   INTEGER NOT NULL,
    num_jobs        INTEGER NOT NULL,
    scenario_state  TEXT NOT NULL,
    vroom_solution  TEXT,
    routes_data     TEXT,
    trips_geojson   TEXT,
    faults_geojson  TEXT,
    routes_geojson  TEXT,
    total_duration_s  INTEGER,
    total_distance_m  INTEGER,
    unassigned_jobs   INTEGER,
    api_cost_estimate REAL,
    is_remix        INTEGER DEFAULT 0,
    parent_run_id   TEXT
);
"""

MIGRATE_SQL = [
    "ALTER TABLE test_runs ADD COLUMN test_number INTEGER",
    "ALTER TABLE test_runs ADD COLUMN routes_data TEXT",
    "ALTER TABLE test_runs ADD COLUMN is_remix INTEGER DEFAULT 0",
    "ALTER TABLE test_runs ADD COLUMN parent_run_id TEXT",
    "ALTER TABLE test_runs ADD COLUMN combined_geojson TEXT",
]


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
        # Attempt migrations for existing databases
        for sql in MIGRATE_SQL:
            try:
                await db.execute(sql)
            except Exception:
                pass  # Column already exists
        await db.commit()
        logger.info("Database tables initialized")
    finally:
        await db.close()


async def get_next_test_number() -> int:
    """Get the next auto-incrementing test number."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT COALESCE(MAX(test_number), 0) + 1 FROM test_runs"
        )
        row = await cursor.fetchone()
        return row[0] if row else 1
    finally:
        await db.close()


async def save_test_run(
    run_id: str,
    test_number: int,
    name: Optional[str],
    strategy: str,
    num_engineers: int,
    num_jobs: int,
    scenario_state: dict,
    vroom_solution: Optional[dict],
    routes_data: Optional[list],
    trips_geojson: dict[str, Any],
    faults_geojson: dict[str, Any],
    routes_geojson: dict[str, Any],
    combined_geojson: dict[str, Any],
    total_duration_s: Optional[int],
    total_distance_m: Optional[int],
    unassigned_jobs: Optional[int],
    api_cost_estimate: Optional[float],
    is_remix: bool = False,
    parent_run_id: Optional[str] = None,
):
    """Persist a completed test run to the database."""
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO test_runs (
                id, test_number, name, strategy, num_engineers, num_jobs,
                scenario_state, vroom_solution, routes_data,
                trips_geojson, faults_geojson, routes_geojson, combined_geojson,
                total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate,
                is_remix, parent_run_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id, test_number, name, strategy, num_engineers, num_jobs,
                json.dumps(scenario_state),
                json.dumps(vroom_solution) if vroom_solution else None,
                json.dumps(routes_data) if routes_data else None,
                json.dumps(trips_geojson),
                json.dumps(faults_geojson),
                json.dumps(routes_geojson),
                json.dumps(combined_geojson),
                total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate,
                1 if is_remix else 0,
                parent_run_id,
            ),
        )
        await db.commit()
        logger.info(f"Saved test run #{test_number} ({run_id})")
    finally:
        await db.close()


async def get_test_runs(limit: int = 50, remix_only: bool = False):
    """Retrieve recent test run summaries, newest first."""
    db = await get_db()
    try:
        where = "WHERE is_remix = 1" if remix_only else "WHERE is_remix = 0 OR is_remix IS NULL"
        cursor = await db.execute(
            f"""
            SELECT id, test_number, created_at, name, strategy, num_engineers, num_jobs,
                   total_duration_s, total_distance_m, unassigned_jobs, api_cost_estimate,
                   is_remix, parent_run_id
            FROM test_runs
            {where}
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
        for field in ("scenario_state", "vroom_solution", "routes_data",
                      "trips_geojson", "faults_geojson", "routes_geojson", "combined_geojson"):
            if result.get(field):
                result[field] = json.loads(result[field])
        return result
    finally:
        await db.close()
