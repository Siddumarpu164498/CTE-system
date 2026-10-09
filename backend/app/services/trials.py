"""Protocol ingestion: store the PDF, extract criteria (Agent A) and build the retrieval index."""

import hashlib
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.protocol_extraction import extract_criteria
from app.config import get_settings
from app.database import SessionLocal
from app.models import ProtocolCriterion, ProtocolDocument, Trial
from app.rag.chunker import chunk_pages
from app.rag.index import build_index, load_index
from app.rag.pdf_loader import PageText, load_pdf_bytes, pages_from_dicts
from app.schemas.clinical import Criterion
from app.services.llm import get_llm

log = logging.getLogger(__name__)


def index_dir(trial_id: str, document_id: str) -> Path:
    return get_settings().index_dir / trial_id / document_id


def create_trial_from_pdf(db: Session, owner_id: str, title: str, filename: str, data: bytes) -> tuple[Trial, ProtocolDocument, list[str]]:
    """Parse, persist and extract. Raises PDFReadError for unreadable files."""
    pages = load_pdf_bytes(data)
    settings = get_settings()
    sha = hashlib.sha256(data).hexdigest()

    trial = Trial(owner_id=owner_id, title=title, status="processing", current_version=1)
    db.add(trial)
    db.flush()
    path = settings.uploads_dir / trial.id / "v1.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    doc = ProtocolDocument(
        trial_id=trial.id, owner_id=owner_id, version=1,
        protocol_version=f"v1-{sha[:12]}", filename=filename, file_path=str(path), sha256=sha,
        page_count=len(pages), pages=[p.to_dict() for p in pages],
    )
    db.add(doc)
    db.flush()

    result = extract_criteria(pages, trial.id, get_llm())
    for c in result.criteria:
        db.add(ProtocolCriterion(
            trial_id=trial.id, document_id=doc.id, owner_id=owner_id, criterion_id=c.criterion_id,
            category=c.category, original_text=c.original_text,
            normalized_rule=c.normalized_rule.model_dump() if c.normalized_rule else None,
            required_attributes=c.required_attributes, source_page=c.source_page,
            source_excerpt=c.source_excerpt, extraction_confidence=c.extraction_confidence,
            requires_human_review=c.requires_human_review,
            data={**c.model_dump(mode="json"), "extraction_warnings": result.warnings},
        ))
    if result.criteria:
        trial.status = "ready"
        trial.error = None
    else:
        trial.status = "error"
        trial.error = {"code": "NO_CRITERIA", "message": "No inclusion or exclusion criteria were found in the protocol."}
    db.commit()
    return trial, doc, result.warnings


def latest_document(db: Session, trial: Trial) -> ProtocolDocument | None:
    return db.scalar(
        select(ProtocolDocument).where(ProtocolDocument.trial_id == trial.id, ProtocolDocument.version == trial.current_version)
    )


def load_criteria(db: Session, document_id: str) -> list[Criterion]:
    rows = db.scalars(
        select(ProtocolCriterion).where(ProtocolCriterion.document_id == document_id).order_by(ProtocolCriterion.criterion_id)
    ).all()
    out = []
    for r in rows:
        data = {k: v for k, v in r.data.items() if k != "extraction_warnings"}
        out.append(Criterion.model_validate(data))
    out.sort(key=lambda c: (c.category != "inclusion", c.criterion_id))
    return out


def get_or_build_index(trial_id: str, document_id: str, pages: list[PageText]):
    s = get_settings()
    directory = index_dir(trial_id, document_id)
    idx = load_index(directory, s.embeddings_enabled, s.embedding_model)
    if idx is None:
        idx = build_index(chunk_pages(pages, trial_id, document_id), directory, s.embeddings_enabled, s.embedding_model)
    return idx


def build_index_task(trial_id: str, document_id: str) -> None:
    """Background task: build and persist the per-trial index."""
    db = SessionLocal()
    try:
        trial = db.get(Trial, trial_id)
        doc = db.get(ProtocolDocument, document_id)
        if trial is None or doc is None:
            return
        trial.index_status = "building"
        db.commit()
        try:
            idx = get_or_build_index(trial_id, document_id, pages_from_dicts(doc.pages))
            trial.index_status = f"ready:{getattr(idx, 'kind', 'unknown')}"
        except Exception as exc:
            log.exception("index build failed for trial %s", trial_id)
            trial.index_status = "error"
            trial.error = {"code": "INDEX_FAILED", "message": str(exc)}
        db.commit()
    finally:
        db.close()
