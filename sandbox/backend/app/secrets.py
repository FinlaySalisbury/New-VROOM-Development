"""
GCP Secret Manager integration.

Fetches secrets from Google Cloud Secret Manager at startup and injects
them into os.environ so pydantic-settings picks them up automatically.

Falls back gracefully to existing environment variables when GCP is
unavailable (e.g. local development with a .env file).
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "work-site-navigation-app")

# Map of GCP secret name → environment variable name.
# Only genuinely sensitive keys belong here.
SECRET_MAP = {
    "TOMTOM_API_KEY": "TOMTOM_API_KEY",
    "GEMINI_API_KEY": "GEMINI_API_KEY",
    "CLAUDE_API_KEY": "CLAUDE_API_KEY",
    "HERE_API_KEY": "HERE_API_KEY",
    "SUPABASE_JWT_SECRET": "SUPABASE_JWT_SECRET",
}
# SUPABASE_URL and SUPABASE_KEY are public (anon key) — stay as regular env vars
# TAVILY_API_KEY excluded (local MCP use only)
# ANTHROPIC_API_KEY excluded (code uses CLAUDE_API_KEY)


def load_secrets_into_env() -> None:
    """
    Fetch all secrets listed in SECRET_MAP from GCP Secret Manager and
    write them into ``os.environ``.

    * If a variable is already set in the environment (e.g. via .env or
      docker-compose), the existing value takes priority — no GCP call
      is made for that key.
    * If the ``google-cloud-secret-manager`` package is not installed or
      GCP credentials are unavailable, the function logs a warning and
      returns without raising.
    """
    try:
        from google.cloud import secretmanager  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "google-cloud-secret-manager not installed — "
            "using environment variables only"
        )
        return

    try:
        client = secretmanager.SecretManagerServiceClient()
    except Exception as exc:
        logger.warning(
            "Could not create Secret Manager client (no GCP credentials?), "
            "falling back to env vars: %s",
            exc,
        )
        return

    loaded, skipped = 0, 0
    for secret_id, env_var in SECRET_MAP.items():
        # Honour existing env vars (local override / docker-compose)
        if os.environ.get(env_var):
            logger.debug("%s already set in env — skipping GCP fetch", env_var)
            skipped += 1
            continue

        try:
            name = f"projects/{GCP_PROJECT_ID}/secrets/{secret_id}/versions/latest"
            response = client.access_secret_version(request={"name": name})
            value = response.payload.data.decode("UTF-8").strip()
            os.environ[env_var] = value
            loaded += 1
            logger.info("Loaded %s from GCP Secret Manager", env_var)
        except Exception as exc:
            logger.warning("Could not fetch secret %s: %s", secret_id, exc)

    logger.info(
        "Secret Manager: loaded=%d, skipped (already set)=%d, total=%d",
        loaded,
        skipped,
        len(SECRET_MAP),
    )
