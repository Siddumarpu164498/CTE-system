"""Background eligibility analysis: wires the LangGraph workflow to the database."""

import logging
import threading
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    AgentExecutionLog,
    ContradictionFinding,
    CriterionEvaluationRow,
    EligibilityRun,
    EvidenceReferenceRow,
    PatientProfile,
    ProtocolDocument,
)
from app.services import audit
from app.services.llm import get_llm
from app.services.trials import get_or_build_index, load_criteria
from app.workflow.graph import run_eligibility
from app.workflow.state import EligibilityState

log = logging.getLogger(__name__)
_db_lock = threading.Lock()  # parallel graph branches report progress concurrently


def make_reporter(run_id: str, owner_id: str):
    def report(node: str, status: str, started_at, ended_at, summary) -> None:
        with _db_lock:
            db = SessionLocal()
            try:
                row = db.scalar(select(AgentExecutionLog).where(
                    AgentExecutionLog.run_id == run_id, AgentExecutionLog.node == node))
                if row is None:
                    row = AgentExecutionLog(run_id=run_id, owner_id=owner_id, node=node, status=status)
                    db.add(row)
                row.status = status
                if started_at is not None:
                    row.started_at = started_at
                row.ended_at = ended_at
                row.summary = summary
                db.commit()
            finally:
                db.close()

    return report


def persist_state(db: Session, run: EligibilityRun, state: EligibilityState) -> None:
    """Write run outputs. Idempotent by run_id: prior child rows are replaced, never duplicated."""
    for model in (CriterionEvaluationRow, ContradictionFinding, EvidenceReferenceRow):
        db.execute(delete(model).where(model.run_id == run.id))

    result = state.get("result")
    error = state.get("error")
    now = datetime.now(timezone.utc)
    if result is not None and not error:
        for e in result.inclusion_results + result.exclusion_results:
            db.add(CriterionEvaluationRow(
                run_id=run.id, owner_id=run.owner_id, criterion_id=e.criterion_id, category=e.category,
                status=e.status, comparison_method=e.comparison_method, data=e.model_dump(mode="json"),
            ))
            for ref in e.evidence_references:
                db.add(EvidenceReferenceRow(
                    run_id=run.id, owner_id=run.owner_id, criterion_id=e.criterion_id, page=ref.page,
                    excerpt=ref.excerpt, chunk_id=ref.chunk_id, source=ref.source, score=ref.score,
                ))
        for t in result.silent_exclusion_triggers:
            db.add(ContradictionFinding(run_id=run.id, owner_id=run.owner_id, finding_type="silent_exclusion_trigger",
                                        data=t.model_dump(mode="json")))
        for c in result.unresolved_conflicts:
            db.add(ContradictionFinding(run_id=run.id, owner_id=run.owner_id, finding_type="conflict",
                                        data=c.model_dump(mode="json")))
        for m in result.missing_information:
            db.add(ContradictionFinding(run_id=run.id, owner_id=run.owner_id, finding_type="missing_data",
                                        data=m.model_dump(mode="json")))
        run.status = "completed"
        run.overall_status = result.overall_status
        run.result = result.model_dump(mode="json")
        run.error = None
    else:
        run.status = "failed"
        run.overall_status = None
        run.result = None
        run.error = dict(error) if error else {"code": "UNKNOWN_ERROR", "message": "Analysis did not produce a result.", "details": {}}
    run.completed_at = now
    audit.record(db, run.owner_id, "analysis.completed" if run.status == "completed" else "analysis.failed",
                 "eligibility_run", run.id, {"overall_status": run.overall_status, "error": run.error}, commit=False)
    db.commit()


def run_analysis(run_id: str) -> None:
    """Entry point for FastAPI BackgroundTasks. Safe to retry: persistence is idempotent."""
    settings = get_settings()
    db = SessionLocal()
    try:
        run = db.get(EligibilityRun, run_id)
        if run is None:
            log.error("run %s not found", run_id)
            return
        doc = db.get(ProtocolDocument, run.document_id)
        profile = db.get(PatientProfile, run.patient_profile_id)
        run.status = "running"
        db.commit()

        criteria = load_criteria(db, doc.id) if doc else []
        pages = doc.pages if doc else []

        def index_provider(page_objs):
            return get_or_build_index(run.trial_id, doc.id, page_objs) if doc else None

        def persister(state: EligibilityState) -> None:
            with _db_lock:
                persist_state(db, run, state)

        run_eligibility(
            run_id=run.id,
            trial_id=run.trial_id,
            document_id=run.document_id,
            protocol_version=run.protocol_version,
            pages=pages,
            patient_input=profile.data if profile else {},
            criteria=criteria,
            llm=get_llm(settings),
            index_provider=index_provider,
            reporter=make_reporter(run.id, run.owner_id),
            persister=persister,
            stale_days=settings.stale_days,
        )
    except Exception as exc:
        log.exception("analysis %s crashed", run_id)
        db.rollback()
        run = db.get(EligibilityRun, run_id)
        if run is not None:
            run.status = "failed"
            run.error = {"code": "ANALYSIS_CRASHED", "message": str(exc), "details": {}}
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()

