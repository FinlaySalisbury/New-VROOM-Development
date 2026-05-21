from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/classify", tags=["Classify"])

class ClassifyRequest(BaseModel):
    model: str
    max_tokens: int
    system: str
    messages: list[dict]

@router.post("")
async def classify_proxy(req: ClassifyRequest):
    """
    Proxy endpoint for Anthropic API to avoid exposing the API key to the frontend.
    """
    settings = get_settings()
    if not settings.CLAUDE_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="CLAUDE_API_KEY is not configured on the server. Please add it to the .env file."
        )
        
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": settings.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01"
    }
    
    try:
        resp = requests.post(url, headers=headers, json=req.model_dump())
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Anthropic API error: {e}")
        err_text = e.response.text if hasattr(e, 'response') and e.response else str(e)
        status_code = e.response.status_code if hasattr(e, 'response') and e.response else 500
        raise HTTPException(status_code=status_code, detail=f"Claude API error: {err_text}")
