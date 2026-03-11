# ═══════════════════════════════════════════════════════════
# InView VROOM Simulation Sandbox — Dockerfile
# 
# Builds both the FastAPI backend and static frontend into
# a single lightweight container.
# ═══════════════════════════════════════════════════════════
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

# Copy frontend static files
COPY frontend/ /app/frontend/

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run the server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
WORKDIR /app/backend
