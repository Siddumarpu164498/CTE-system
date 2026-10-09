"""FastAPI dependencies for authentication."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.database import get_db
from app.models import User
from app.security.jwt import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(401, "UNAUTHENTICATED", "Missing bearer token.")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise AppError(401, "INVALID_TOKEN", "Token is invalid or expired.")
    user = db.get(User, user_id)
    if user is None:
        raise AppError(401, "INVALID_TOKEN", "User no longer exists.")
    return user
