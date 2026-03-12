"""
Configuration — Environment-based settings for the Simulation Sandbox backend.
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # TomTom API
    TOMTOM_API_KEY: str = "MOCK_KEY"

    # Gemini AI (Route Explainer)
    GEMINI_API_KEY: str = ""

    # VROOM Engine
    VROOM_ENDPOINT: str = "http://localhost:3000/"

    # Database
    DATABASE_PATH: str = "sandbox_history.db"

    # Server
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
