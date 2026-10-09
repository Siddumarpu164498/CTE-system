from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from sqlalchemy import text

from app.config import HUMAN_REVIEW_NOTICE, get_settings
from app.database import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """The backend is API-only; send browsers to the interactive docs."""
    return RedirectResponse("/docs")


@router.get("/api/health")
def health() -> dict:
    s = get_settings()
    db_ok = True
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unavailable",
        "llm_provider": s.llm_provider if s.llm_enabled else "none (rule-based fallback)",
        "embeddings_enabled": s.embeddings_enabled,
        "human_review_notice": HUMAN_REVIEW_NOTICE,
    }
