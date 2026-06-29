"""
Invitations Router — Send project invitations via email.

Authenticated endpoint that creates an invitation record in Supabase
and sends a notification email to the invitee.
"""
import logging

from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from supabase import Client

from app.config import get_settings
from app.database import get_supabase_client, security
from app.services.email_service import send_email

router = APIRouter(prefix="/api/invitations", tags=["invitations"])
logger = logging.getLogger(__name__)


# ── Request Models ────────────────────────────────────────

class InvitationRequest(BaseModel):
    project_id: str
    email: EmailStr
    role: str


# ── Endpoints ─────────────────────────────────────────────

@router.post("/send")
async def send_invitation(
    body: InvitationRequest,
    supabase: Client = Depends(get_supabase_client),
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    """Create a project invitation and email the invitee."""
    settings = get_settings()

    # Extract the current user's ID from the JWT
    import jwt as pyjwt
    token_payload = pyjwt.decode(
        credentials.credentials,
        options={"verify_signature": False},
        audience="authenticated",
    )
    current_user_id = token_payload.get("sub")

    # 1. Check for an existing pending invitation
    existing = (
        supabase.table("invitations")
        .select("id")
        .eq("project_id", body.project_id)
        .eq("email", body.email)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail="An invitation has already been sent to this email for this project.",
        )

    # 2. Insert invitation record
    invite_data = {
        "project_id": body.project_id,
        "email": body.email,
        "role": body.role,
        "status": "pending",
    }
    insert_result = supabase.table("invitations").insert(invite_data).execute()
    if not insert_result.data:
        raise HTTPException(status_code=500, detail="Failed to create invitation.")

    # 3. Look up the project name
    project_name = "your project"
    try:
        project = (
            supabase.table("projects")
            .select("name")
            .eq("id", body.project_id)
            .limit(1)
            .execute()
        )
        if project.data:
            project_name = project.data[0].get("name", project_name)
    except Exception as exc:
        logger.warning("Could not look up project name: %s", exc)

    # 4. Look up inviter's profile by user ID (service role bypasses RLS)
    inviter_name = "A team member"
    inviter_email = ""
    try:
        from supabase import create_client
        admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        profile = (
            admin.table("profiles")
            .select("display_name, first_name, last_name, email")
            .eq("id", current_user_id)
            .limit(1)
            .execute()
        )
        if profile.data:
            row = profile.data[0]
            inviter_email = row.get("email", "")
            first = row.get("first_name", "") or ""
            last = row.get("last_name", "") or ""
            full_name = f"{first} {last}".strip()
            if not full_name:
                full_name = row.get("display_name", "") or ""
            inviter_name = full_name if full_name else inviter_email.split("@")[0]
    except Exception as exc:
        logger.warning("Could not look up inviter profile: %s", exc)

    # 5. Send the invitation email
    await send_email(
        to=body.email,
        subject=f"You've been invited to {project_name} on YuRoute",
        template_name="invitation",
        tokens={
            "inviter_name": inviter_name,
            "inviter_email": inviter_email,
            "project_name": project_name,
            "role": body.role.capitalize(),
            "action_url": f"{settings.APP_URL}/#/projects",
        },
    )

    return {"success": True, "message": "Invitation sent."}


# ── Invite Request Notification Endpoints ─────────────────

class InviteRequestNotifyBody(BaseModel):
    project_id: str
    requester_email: str
    requester_name: str
    invitee_email: str
    role: str
    comment: str
    role_justification: str | None = None


class InviteRequestDecisionBody(BaseModel):
    project_id: str
    requester_email: str
    invitee_email: str
    role: str
    status: str  # 'approved' or 'rejected'
    reviewer_name: str
    reason: str | None = None


@router.post("/request-notify-admins")
async def notify_admins_of_request(
    body: InviteRequestNotifyBody,
    supabase: Client = Depends(get_supabase_client),
):
    """Notify all admins/owners of a project about a new invite request."""
    settings = get_settings()

    # 1. Look up project name
    project_name = "your project"
    try:
        project = (
            supabase.table("projects")
            .select("name")
            .eq("id", body.project_id)
            .limit(1)
            .execute()
        )
        if project.data:
            project_name = project.data[0].get("name", project_name)
    except Exception as exc:
        logger.warning("Could not look up project name: %s", exc)

    # 2. Fetch admin/owner emails via service role client
    admin_emails = []
    try:
        from supabase import create_client
        svc = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        members = (
            svc.table("project_members")
            .select("user_id, role, profiles!project_members_profile_fkey(email)")
            .eq("project_id", body.project_id)
            .in_("role", ["admin", "owner"])
            .execute()
        )
        for m in members.data or []:
            email = m.get("profiles", {}).get("email")
            if email:
                admin_emails.append(email)
    except Exception as exc:
        logger.error("Failed to fetch admin emails: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to look up admin emails.")

    if not admin_emails:
        return {"success": True, "message": "No admins found to notify."}

    # 3. Build role justification block
    # Rendered as a table-row so it slots into the finalized template layout.
    # On-brand: neutral card, orange accent rail (orange is an accent colour).
    role_justification_block = ""
    if body.role_justification:
        role_justification_block = f"""
        <tr>
          <td class="px-pad" style="padding:16px 48px 0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                   bgcolor="#f4f4f2" style="background-color:#f4f4f2; border:1px solid #E4EDED;
                   border-left:3px solid #F47738; border-radius:12px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:11px;
                            line-height:14px; letter-spacing:0.18em; text-transform:uppercase;
                            color:#5a5a58; font-weight:700;">Role justification</p>
                  <p style="margin:6px 0 0 0; font-family: Arial, Helvetica, sans-serif;
                            font-size:14px; line-height:22px; color:#000000;">{body.role_justification}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>"""

    # 4. Send email to each admin/owner
    sent = 0
    for email in admin_emails:
        await send_email(
            to=email,
            subject=f"New invite request for {project_name}",
            template_name="invite-request",
            tokens={
                "requester_name": body.requester_name,
                "requester_email": body.requester_email,
                "invitee_email": body.invitee_email,
                "project_name": project_name,
                "role": body.role.capitalize(),
                "comment": body.comment,
                "role_justification_block": role_justification_block,
                "action_url": f"{settings.APP_URL}/#/projects",
            },
        )
        sent += 1

    return {"success": True, "message": f"Notified {sent} admin(s)."}


@router.post("/request-decision-notify")
async def notify_requester_of_decision(
    body: InviteRequestDecisionBody,
    supabase: Client = Depends(get_supabase_client),
):
    """Notify the requester that their invite request was approved or rejected."""
    settings = get_settings()

    # 1. Look up project name
    project_name = "your project"
    try:
        project = (
            supabase.table("projects")
            .select("name")
            .eq("id", body.project_id)
            .limit(1)
            .execute()
        )
        if project.data:
            project_name = project.data[0].get("name", project_name)
    except Exception as exc:
        logger.warning("Could not look up project name: %s", exc)

    # 2. Build conditional blocks
    # Rendered as table-rows for the finalized template layout. No red in the
    # brand — the reason card uses a neutral surface with an orange accent rail.
    reason_block = ""
    if body.reason:
        reason_block = f"""
        <tr>
          <td class="px-pad" style="padding:16px 48px 0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                   bgcolor="#f4f4f2" style="background-color:#f4f4f2; border:1px solid #E4EDED;
                   border-left:3px solid #F47738; border-radius:12px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:11px;
                            line-height:14px; letter-spacing:0.18em; text-transform:uppercase;
                            color:#5a5a58; font-weight:700;">Reason</p>
                  <p style="margin:6px 0 0 0; font-family: Arial, Helvetica, sans-serif;
                            font-size:14px; line-height:22px; color:#000000;">{body.reason}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>"""

    if body.status == "approved":
        next_steps_block = """
        <tr>
          <td class="px-pad" style="padding:24px 48px 0 48px;">
            <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:16px;
                      line-height:24px; color:#000000;">
              The invitation has been sent to the invitee. They&rsquo;ll receive an email
              with instructions to join the project.
            </p>
          </td>
        </tr>"""
    else:
        next_steps_block = """
        <tr>
          <td class="px-pad" style="padding:24px 48px 0 48px;">
            <p style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:16px;
                      line-height:24px; color:#000000;">
              If you believe this was a mistake, please contact a project admin directly.
            </p>
          </td>
        </tr>"""

    # 3. Send email to requester
    await send_email(
        to=body.requester_email,
        subject=f"Invite request {body.status} — {project_name}",
        template_name="invite-request-decision",
        tokens={
            "invitee_email": body.invitee_email,
            "project_name": project_name,
            "role": body.role.capitalize(),
            "status": body.status,
            "reviewer_name": body.reviewer_name,
            "reason_block": reason_block,
            "next_steps_block": next_steps_block,
            "action_url": f"{settings.APP_URL}/#/projects",
        },
    )

    return {"success": True, "message": f"Requester notified ({body.status})."}
