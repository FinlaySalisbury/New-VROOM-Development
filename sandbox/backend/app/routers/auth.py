"""
Auth Router — Email-based authentication flows.

Endpoints for sending welcome emails, password-reset links,
verification codes, and magic links via Resend + Supabase Admin API.
"""
import random
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client

from app.config import get_settings
from app.services.email_service import send_email

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


# ── Request Models ────────────────────────────────────────

class EmailRequest(BaseModel):
    email: EmailStr


# ── Helpers ───────────────────────────────────────────────

def get_admin_client():
    """Return a Supabase client authenticated with the service-role key."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _get_user_name(profile_row: dict, email: str) -> str:
    """Build a display name from profile fields, falling back to email prefix."""
    first = (profile_row.get("first_name") or "").strip()
    last = (profile_row.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    if full:
        return full
    display = (profile_row.get("display_name") or "").strip()
    if display:
        return display
    return email.split("@")[0]


# ── Endpoints ─────────────────────────────────────────────

@router.post("/send-welcome")
async def send_welcome(body: EmailRequest):
    """Send a welcome email to a newly registered user."""
    settings = get_settings()
    admin = get_admin_client()

    # Look up profile for display name
    first_name = body.email.split("@")[0]
    try:
        profile = (
            admin.table("profiles")
            .select("display_name, first_name, last_name")
            .eq("email", body.email)
            .limit(1)
            .execute()
        )
        if profile.data:
            first_name = _get_user_name(profile.data[0], body.email)
    except Exception as exc:
        logger.warning("Could not look up profile for %s: %s", body.email, exc)

    await send_email(
        to=body.email,
        subject="Welcome to YuRoute! 🚀",
        template_name="welcome",
        tokens={
            "first_name": first_name,
            "action_url": settings.APP_URL,
        },
    )

    return {"success": True}


@router.post("/forgot-password")
async def forgot_password(body: EmailRequest):
    """Generate a password-reset link and send it via email."""
    settings = get_settings()
    admin = get_admin_client()

    try:
        # Generate a recovery link using the Supabase Admin API
        link_response = admin.auth.admin.generate_link(
            {
                "type": "recovery",
                "email": body.email,
                "options": {"redirect_to": f"{settings.APP_URL}/#/login"},
            }
        )

        action_link = link_response.properties.action_link

        # Look up profile for first_name
        first_name = body.email.split("@")[0]
        try:
            profile = (
                admin.table("profiles")
                .select("display_name, first_name, last_name")
                .eq("email", body.email)
                .limit(1)
                .execute()
            )
            if profile.data:
                first_name = _get_user_name(profile.data[0], body.email)
        except Exception as exc:
            logger.warning("Could not look up profile for %s: %s", body.email, exc)

        await send_email(
            to=body.email,
            subject="Reset Your YuRoute Password",
            template_name="password-reset",
            tokens={
                "first_name": first_name,
                "email": body.email,
                "action_url": action_link,
            },
        )

    except Exception as exc:
        # Don't reveal whether the user exists — always return 200
        logger.warning("Password reset flow error for %s: %s", body.email, exc)

    return {
        "success": True,
        "message": "If an account exists, a reset link has been sent.",
    }


@router.post("/send-verification")
async def send_verification(body: EmailRequest):
    """Generate a verification link and send it with a 6-digit code."""
    settings = get_settings()
    admin = get_admin_client()

    try:
        link_response = admin.auth.admin.generate_link(
            {
                "type": "signup",
                "email": body.email,
                "options": {"redirect_to": f"{settings.APP_URL}/#/login"},
            }
        )

        action_link = link_response.properties.action_link

        # Generate a 6-digit code formatted as "XXX XXX"
        code = random.randint(100000, 999999)
        verification_code = f"{str(code)[:3]} {str(code)[3:]}"

        # Look up profile for first_name
        first_name = body.email.split("@")[0]
        try:
            profile = (
                admin.table("profiles")
                .select("display_name, first_name, last_name")
                .eq("email", body.email)
                .limit(1)
                .execute()
            )
            if profile.data:
                first_name = _get_user_name(profile.data[0], body.email)
        except Exception as exc:
            logger.warning("Could not look up profile for %s: %s", body.email, exc)

        await send_email(
            to=body.email,
            subject="Verify Your YuRoute Email",
            template_name="verification",
            tokens={
                "first_name": first_name,
                "verification_code": verification_code,
                "action_url": action_link,
            },
        )

    except Exception as exc:
        logger.warning("Verification flow error for %s: %s", body.email, exc)

    return {"success": True}


@router.post("/send-magic-link")
async def send_magic_link(body: EmailRequest):
    """Generate and send a magic-link for passwordless sign-in."""
    settings = get_settings()
    admin = get_admin_client()

    try:
        link_response = admin.auth.admin.generate_link(
            {
                "type": "magiclink",
                "email": body.email,
                "options": {"redirect_to": f"{settings.APP_URL}/#/login"},
            }
        )

        action_link = link_response.properties.action_link

        await send_email(
            to=body.email,
            subject="Your YuRoute Sign-In Link",
            template_name="magic-link",
            tokens={
                "email": body.email,
                "action_url": action_link,
            },
        )

    except Exception as exc:
        # Don't reveal whether the user exists — always return 200
        logger.warning("Magic link flow error for %s: %s", body.email, exc)

    return {"success": True}
