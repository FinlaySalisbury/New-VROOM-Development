"""
Email Service — Send transactional emails via Resend.

Provides HTML template loading with token substitution and
a high-level send_email() helper used by auth and invitation flows.
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

import resend

from app.config import get_settings

logger = logging.getLogger(__name__)

# Resolve the templates directory (sandbox/backend/templates/)
TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"


def _configure_resend() -> None:
    """Set the Resend API key from application settings."""
    settings = get_settings()
    resend.api_key = settings.RESEND_API_KEY


def load_template(name: str, tokens: dict[str, str]) -> str:
    """
    Load an HTML email template and replace ``{{key}}`` placeholders.

    Parameters
    ----------
    name : str
        Template filename without extension (e.g. ``"welcome"``).
    tokens : dict[str, str]
        Mapping of placeholder keys to replacement values.

    Returns
    -------
    str
        Final HTML string ready to send.
    """
    settings = get_settings()
    template_path = TEMPLATES_DIR / f"{name}.html"
    html = template_path.read_text(encoding="utf-8")

    # Inject default tokens (callers can override). The logo path is
    # config-driven so templates stay portable across environments.
    defaults = {
        "logo_url": f"{settings.APP_URL}/assets/logo-yunex-traffic-black.png",
        "privacy_url": f"{settings.APP_URL}/privacy",
        "unsubscribe_url": f"{settings.APP_URL}/unsubscribe",
        "current_year": str(datetime.now(timezone.utc).year),
    }
    merged = {**defaults, **tokens}

    for key, value in merged.items():
        html = html.replace(f"{{{{{key}}}}}", value)

    return html


async def send_email(
    to: str,
    subject: str,
    template_name: str,
    tokens: dict[str, str],
) -> dict:
    """
    Render a template and send the email via Resend.

    Parameters
    ----------
    to : str
        Recipient email address.
    subject : str
        Email subject line.
    template_name : str
        Template filename without extension.
    tokens : dict[str, str]
        Placeholder values for the template.

    Returns
    -------
    dict
        Resend API response on success, or an error dict on failure.
    """
    _configure_resend()

    try:
        html = load_template(template_name, tokens)

        params: resend.Emails.SendParams = {
            "from": "YuRoute <noreply@yuroute.com>",
            "to": [to],
            "subject": subject,
            "html": html,
        }

        response = resend.Emails.send(params)
        logger.info("Email sent successfully to %s (template=%s)", to, template_name)
        return response

    except FileNotFoundError:
        logger.error("Email template '%s' not found at %s", template_name, TEMPLATES_DIR)
        return {"error": f"Template '{template_name}' not found"}

    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc, exc_info=True)
        return {"error": str(exc)}
