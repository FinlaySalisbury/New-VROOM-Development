"""
Configuration — Environment-based settings for the Simulation Sandbox backend.
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache
from app.secrets import load_secrets_into_env

# Load secrets from GCP Secret Manager into env vars
# before pydantic Settings reads them. Falls back to .env for local dev.
load_secrets_into_env()

class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # TomTom API
    TOMTOM_API_KEY: str = "MOCK_KEY"

    # HERE API
    HERE_API_KEY: str = "MOCK_KEY"

    # Route Explainer provider: "gemini" or "claude" (temporary fallback while
    # Gemini is unavailable). Flip back to "gemini" to restore the default.
    AI_PROVIDER: str = "claude"

    # Gemini AI (Route Explainer)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3-flash-preview"

    # Claude AI (Skill Classification + Route Explainer fallback)
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # VROOM Engine
    VROOM_ENDPOINT: str = "http://localhost:3000/"

    # Supabase Settings
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Resend Email
    RESEND_API_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    APP_URL: str = "https://yuroute.com"

    # Server
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001", "https://yuroute.com", "https://www.yuroute.com"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
