"""
Profile Router — User profile management.

Endpoints for reading and updating the authenticated user's profile.
Uses a service-role client to bypass RLS for profile lookups/upserts.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
from supabase import create_client

from app.config import get_settings

router = APIRouter(prefix="/api/profile", tags=["profile"])
logger = logging.getLogger(__name__)
security = HTTPBearer()


# ── Request / Response Models ─────────────────────────────

class ProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    department: Optional[str] = None


class ProfileResponse(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    onboarding_complete: bool = False


# ── Helpers ───────────────────────────────────────────────

def get_admin_client():
    """Return a Supabase client authenticated with the service-role key."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _extract_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    """Decode the JWT and return the user ID (sub claim)."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub")
    return user_id


# ── Endpoints ─────────────────────────────────────────────

@router.get("", response_model=ProfileResponse)
async def get_profile(
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    """Return the authenticated user's profile."""
    user_id = _extract_user_id(credentials)
    admin = get_admin_client()

    try:
        result = (
            admin.table("profiles")
            .select("first_name, last_name, department, email, display_name, onboarding_complete")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to fetch profile for %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch profile")

    if result.data:
        row = result.data[0]
        return ProfileResponse(
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            department=row.get("department"),
            email=row.get("email"),
            display_name=row.get("display_name"),
            onboarding_complete=row.get("onboarding_complete", False),
        )

    # No profile row yet — return defaults
    return ProfileResponse()


@router.put("", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdate,
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    """Update the authenticated user's profile."""
    user_id = _extract_user_id(credentials)
    admin = get_admin_client()

    display_name = f"{body.first_name} {body.last_name}"

    update_data = {
        "first_name": body.first_name,
        "last_name": body.last_name,
        "department": body.department,
        "display_name": display_name,
        "onboarding_complete": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = (
            admin.table("profiles")
            .update(update_data)
            .eq("id", user_id)
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to update profile for %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update profile")

    if result.data:
        row = result.data[0]
        return ProfileResponse(
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            department=row.get("department"),
            email=row.get("email"),
            display_name=row.get("display_name"),
            onboarding_complete=row.get("onboarding_complete", True),
        )

    raise HTTPException(status_code=500, detail="Profile update returned no data")

