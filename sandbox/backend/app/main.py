"""
FastAPI Application — InView VROOM Simulation Sandbox Backend.

Serves both the REST API and the static frontend from a single process.
"""
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import get_settings
from app.database import create_tables
from app.routers import simulation, history

# Frontend directory (relative to the sandbox root)
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-30s | %(levelname)-7s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    logger.info("Initializing Simulation Sandbox backend...")
    await create_tables()
    logger.info("Database ready")
    yield
    logger.info("Shutting down Simulation Sandbox backend")


app = FastAPI(
    title="InView VROOM Simulation Sandbox",
    description="Generate, execute, and visualize route optimization tests using VROOM and TomTom APIs.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(simulation.router)
app.include_router(history.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "simulation-sandbox"}


@app.get("/api/cost-estimate")
async def get_cost_estimate(num_engineers: int = 5, num_jobs: int = 20):
    """
    Live cost estimate calculation for TomTom Premium strategy.
    Used by the frontend Cost Guide panel.
    """
    n = num_engineers + num_jobs
    matrix_elements = n * n
    cost_per_element = 0.00042  # €0.42 per 1000 transactions
    return {
        "total_waypoints": n,
        "matrix_elements": matrix_elements,
        "estimated_cost_eur": round(matrix_elements * cost_per_element, 4),
        "cost_per_element": cost_per_element,
    }


# ── Static Frontend Serving ──────────────────────────────
# Mount static files (CSS, JS) — must come AFTER API routes
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend files. Falls back to index.html for SPA routing."""
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))

