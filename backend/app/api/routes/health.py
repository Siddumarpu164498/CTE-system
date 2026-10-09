from fastapi import APIRouter
from sqlalchemy import text

from app.config import HUMAN_REVIEW_NOTICE, get_settings
from app.database import SessionLocal

router = APIRouter(tags=["health"])


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
