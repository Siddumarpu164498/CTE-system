from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import AppError
from app.database import get_db
from app.models import User
from app.schemas.api import LoginRequest, RegisterRequest, TokenOut, UserOut
from app.security.deps import get_current_user
from app.security.jwt import create_access_token, hash_password, verify_password
from app.services import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenOut:
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "EMAIL_TAKEN", "An account with this email already exists.")
    user = User(email=email, hashed_password=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    db.commit()
    audit.record(db, user.id, "user.registered", "user", user.id)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    audit.record(db, user.id, "user.login", "user", user.id)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
