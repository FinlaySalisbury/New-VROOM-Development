# ═══════════════════════════════════════════════════════════
# InView VROOM Simulation Sandbox — Dockerfile
#
# Multi-stage build:
#   1. node   — builds the React (Vite) frontend into /fe/dist
#   2. python — FastAPI backend + the built frontend, one container
# ═══════════════════════════════════════════════════════════

# ── Stage 1: build the React frontend ──────────────────────
FROM node:20-slim AS frontend
WORKDIR /fe

# Install deps from the lockfile first for layer caching.
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci

# Public build-time config (the anon key is a public client key — the same
# value the legacy config.js exposes). Supplied as build args by compose.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY frontend-react/ ./
RUN npm run build

# ── Stage 2: FastAPI backend + built frontend ──────────────
FROM python:3.12-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend source
COPY backend/ /app/backend/

# Copy the built React frontend — served by FastAPI as /app/frontend
COPY --from=frontend /fe/dist /app/frontend/

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run the server
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
