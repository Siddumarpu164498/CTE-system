from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.errors import AppError, not_found
from app.config import get_settings
from app.database import get_db
from app.models import ProtocolCriterion, ProtocolDocument, Trial, User
from app.rag.pdf_loader import PDFReadError, is_pdf_bytes
from app.schemas.api import PageOut, TrialDetail, TrialSummary
from app.schemas.clinical import Criterion
from app.security.deps import get_current_user
from app.services import audit
from app.services.trials import build_index_task, create_trial_from_pdf, latest_document, load_criteria

router = APIRouter(prefix="/api/trials", tags=["trials"])


def owned_trial(db: Session, trial_id: str, user: User) -> Trial:
    trial = db.get(Trial, trial_id)
    if trial is None or trial.owner_id != user.id:
        raise not_found("Trial")
    return trial


def _summary(db: Session, trial: Trial, doc: ProtocolDocument | None) -> dict:
    count = db.scalar(select(func.count()).select_from(ProtocolCriterion).where(
        ProtocolCriterion.document_id == doc.id)) if doc else 0
    return dict(
        id=trial.id, title=trial.title, status=trial.status, index_status=trial.index_status,
        current_version=trial.current_version, protocol_version=doc.protocol_version if doc else None,
        page_count=doc.page_count if doc else None, criteria_count=count or 0, created_at=trial.created_at,
    )


def _detail(db: Session, trial: Trial) -> TrialDetail:
    doc = latest_document(db, trial)
    criteria = load_criteria(db, doc.id) if doc else []
    warnings: list[str] = []
    method = None
    if doc:
        row = db.scalar(select(ProtocolCriterion).where(ProtocolCriterion.document_id == doc.id))
        if row is not None:
            warnings = row.data.get("extraction_warnings", [])
            method = row.data.get("extraction_method")
    return TrialDetail(**_summary(db, trial, doc), filename=doc.filename if doc else None,
                       extraction_method=method, extraction_warnings=warnings, criteria=criteria, error=trial.error)


@router.post("/upload", response_model=TrialDetail, status_code=201)
async def upload_trial(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrialDetail:
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise AppError(413, "FILE_TOO_LARGE", f"Protocol PDF must be at most {get_settings().max_upload_mb} MB.")
    if not data:
        raise AppError(400, "EMPTY_FILE", "Uploaded file is empty.")
    if not is_pdf_bytes(data):
        raise AppError(400, "INVALID_FILE_TYPE", "Only PDF protocol documents are accepted.",
                       {"filename": file.filename, "content_type": file.content_type})
    name = (file.filename or "protocol.pdf")[:300]
    try:
        trial, doc, _ = create_trial_from_pdf(db, user.id, (title or name.rsplit(".", 1)[0])[:300], name, data)
    except PDFReadError as exc:
        db.rollback()
        raise AppError(400, "UNREADABLE_PDF", str(exc), {"filename": file.filename}) from exc
    audit.record(db, user.id, "trial.uploaded", "trial", trial.id,
                 {"filename": name, "sha256": doc.sha256, "pages": doc.page_count})
    background.add_task(build_index_task, trial.id, doc.id)
    return _detail(db, trial)


@router.get("", response_model=list[TrialSummary])
def list_trials(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[TrialSummary]:
    trials = db.scalars(select(Trial).where(Trial.owner_id == user.id).order_by(Trial.created_at.desc())).all()
    return [TrialSummary(**_summary(db, t, latest_document(db, t))) for t in trials]


@router.get("/{trial_id}", response_model=TrialDetail)
def get_trial(trial_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TrialDetail:
    return _detail(db, owned_trial(db, trial_id, user))


@router.get("/{trial_id}/criteria", response_model=list[Criterion])
def get_criteria(trial_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Criterion]:
    trial = owned_trial(db, trial_id, user)
    doc = latest_document(db, trial)
    return load_criteria(db, doc.id) if doc else []


@router.get("/{trial_id}/pages/{page}", response_model=PageOut)
def get_page(trial_id: str, page: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> PageOut:
    trial = owned_trial(db, trial_id, user)
    doc = latest_document(db, trial)
    if doc is None or page < 1 or page > doc.page_count:
        raise not_found("Page")
    text = next((p["text"] for p in doc.pages if int(p["page"]) == page), "")
    return PageOut(trial_id=trial.id, page=page, page_count=doc.page_count, text=text)
