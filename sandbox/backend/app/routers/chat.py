"""
Chat Router — POST /api/chat endpoint for the Route Explainer AI.
"""
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.config import get_settings
from app.database import get_test_run_by_id
from app.services.route_explainer import assemble_context, ask_gemini, ask_claude

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    """Request body for POST /api/chat."""
    run_id: str
    message: str
    history: list[dict[str, str]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Response body for POST /api/chat."""
    reply: str
    history: list[dict[str, str]]


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a natural-language question about a specific test run to the
    Route Explainer AI (provider selected by AI_PROVIDER).
    """
    settings = get_settings()

    provider = (settings.AI_PROVIDER or "gemini").lower()
    if provider == "claude":
        if not settings.CLAUDE_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="CLAUDE_API_KEY is not configured. Add it to .env to enable the AI assistant."
            )
    elif not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. Add it to .env to enable the AI assistant."
        )

    # Fetch the test run data
    run_data = await get_test_run_by_id(request.run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Test run not found")

    try:
        # Assemble context from stored scenario data
        context = assemble_context(run_data)
        logger.info(f"AI Chat: assembled {len(context)} chars of context for run {request.run_id[:8]} (provider={provider})")

        # Call the configured provider
        if provider == "claude":
            reply = ask_claude(
                context=context,
                message=request.message,
                history=request.history,
                api_key=settings.CLAUDE_API_KEY,
                model=settings.CLAUDE_MODEL,
            )
        else:
            reply = ask_gemini(
                context=context,
                message=request.message,
                history=request.history,
                api_key=settings.GEMINI_API_KEY,
                model=settings.GEMINI_MODEL,
            )

        # Build updated history
        updated_history = list(request.history)
        updated_history.append({"role": "user", "content": request.message})
        updated_history.append({"role": "assistant", "content": reply})

        return ChatResponse(reply=reply, history=updated_history)

    except Exception as e:
        logger.exception(f"AI Chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")
