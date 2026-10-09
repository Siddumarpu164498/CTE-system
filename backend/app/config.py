"""Application settings, read only from environment variables (or a local .env)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-insecure-secret-change-me"

HUMAN_REVIEW_NOTICE = (
    "Clinical decision support only. This assessment supports, and does not replace, "
    "review by a qualified clinician or trial investigator. Final eligibility must be "
    "confirmed by the study team."
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./data/app.db"
    data_dir: Path = Path("./data")
    migrate_on_startup: bool = True

    jwt_secret: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    llm_provider: Literal["anthropic", "openai", "none"] = "none"
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_seconds: float = 60.0

    embeddings_enabled: bool = True
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    frontend_origin: str = "http://localhost:5173"
    max_upload_mb: int = 20
    stale_days: int = 90
    log_level: str = "INFO"

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if self.app_env == "production" and (not self.jwt_secret or self.jwt_secret == DEV_JWT_SECRET):
            raise ValueError("JWT_SECRET must be set to a strong secret when APP_ENV=production")
        return self

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        # Render and Heroku hand out postgres:// URLs; SQLAlchemy 2 needs an explicit driver.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider != "none" and bool(self.llm_api_key)

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "indexes"


@lru_cache
def get_settings() -> Settings:
    return Settings()
