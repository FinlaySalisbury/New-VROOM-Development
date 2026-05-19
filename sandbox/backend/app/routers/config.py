"""
Router for handling configuration persistence (Engineers, Job Lists, Global Settings).
"""
import json
from typing import List, Dict, Any
from fastapi import APIRouter, Body
from app.database import get_db

router = APIRouter(prefix="/api/config", tags=["config"])

@router.get("/engineers")
async def get_engineers():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT data FROM engineers")
        rows = await cursor.fetchall()
        return [json.loads(row["data"]) for row in rows]
    finally:
        await db.close()

@router.post("/engineers")
async def save_engineers(engineers: List[Dict[str, Any]] = Body(...)):
    db = await get_db()
    try:
        await db.execute("DELETE FROM engineers")
        for eng in engineers:
            await db.execute(
                "INSERT INTO engineers (id, data) VALUES (?, ?)",
                (eng.get("id"), json.dumps(eng))
            )
        await db.commit()
        return {"status": "success", "count": len(engineers)}
    finally:
        await db.close()

@router.get("/job-lists")
async def get_job_lists():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT data FROM job_lists")
        rows = await cursor.fetchall()
        return [json.loads(row["data"]) for row in rows]
    finally:
        await db.close()

@router.post("/job-lists")
async def save_job_lists(job_lists: List[Dict[str, Any]] = Body(...)):
    db = await get_db()
    try:
        await db.execute("DELETE FROM job_lists")
        for jl in job_lists:
            await db.execute(
                "INSERT INTO job_lists (id, data) VALUES (?, ?)",
                (jl.get("id"), json.dumps(jl))
            )
        await db.commit()
        return {"status": "success", "count": len(job_lists)}
    finally:
        await db.close()

@router.get("/settings/depot")
async def get_depot():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT value FROM global_settings WHERE key = 'main_depot'")
        row = await cursor.fetchone()
        if row:
            return json.loads(row["value"])
        return [-0.1278, 51.5074] # Default fallback
    finally:
        await db.close()

@router.post("/settings/depot")
async def save_depot(depot: List[float] = Body(...)):
    db = await get_db()
    try:
        await db.execute(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)",
            ("main_depot", json.dumps(depot))
        )
        await db.commit()
        return {"status": "success"}
    finally:
        await db.close()
