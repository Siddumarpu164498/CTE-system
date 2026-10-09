from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.errors import AppError, not_found
from app.api.routes.patients import latest_profile
from app.api.routes.trials import owned_trial
from app.config import HUMAN_REVIEW_NOTICE
from app.database import get_db
from app.models import (
    AgentExecutionLog,
    AuditEvent,
    EligibilityRun,
    EvidenceReferenceRow,
    PatientProfile,
    Trial,
    User,
)
from app.schemas.api import AnalyzeRequest, NodeProgress, RunCreated, RunDetail, RunStatus, RunSummary
from app.security.deps import get_current_user
from app.services import audit
from app.services.analysis import run_analysis
from app.services.trials import latest_document
from app.workflow.state import NODE_ORDER

router = APIRouter(prefix="/api/eligibility", tags=["eligibility"])


def owned_run(db: Session, run_id: str, user: User) -> EligibilityRun:
    run = db.get(EligibilityRun, run_id)
    if run is None or run.owner_id != user.id:
        raise not_found("Run")
    return run


@router.post("/analyze", response_model=RunCreated, status_code=202)
def analyze(body: AnalyzeRequest, background: BackgroundTasks, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)) -> RunCreated:
    trial = owned_trial(db, body.trial_id, user)
    if trial.status != "ready":
        raise AppError(409, "TRIAL_NOT_READY", f"Trial is not ready for analysis (status: {trial.status}).", trial.error or {})
    doc = latest_document(db, trial)
    if doc is None:
        raise AppError(409, "TRIAL_NOT_READY", "Trial has no protocol document.")
    profile = latest_profile(db, body.patient_id, user)
    run = EligibilityRun(
        owner_id=user.id, trial_id=trial.id, document_id=doc.id, protocol_version=doc.protocol_version,
        patient_id=profile.patient_id, patient_profile_id=profile.id, patient_profile_version=profile.version,
        status="queued",
    )
    db.add(run)
    db.commit()
    audit.record(db, user.id, "analysis.requested", "eligibility_run", run.id,
                 {"trial_id": trial.id, "patient_id": profile.patient_id, "patient_version": profile.version})
    background.add_task(run_analysis, run.id)
    return RunCreated(run_id=run.id, status=run.status)


@router.get("", response_model=list[RunSummary])
def list_runs(limit: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[RunSummary]:
    rows = db.execute(
        select(EligibilityRun, Trial.title, PatientProfile.label)
        .join(Trial, Trial.id == EligibilityRun.trial_id)
        .join(PatientProfile, PatientProfile.id == EligibilityRun.patient_profile_id)
        .where(EligibilityRun.owner_id == user.id)
        .order_by(EligibilityRun.created_at.desc())
        .limit(max(1, min(limit, 100)))
    ).all()
    return [
        RunSummary(run_id=r.id, trial_id=r.trial_id, trial_title=title, patient_id=r.patient_id, patient_label=label,
                   patient_profile_version=r.patient_profile_version, status=r.status,
                   overall_status=r.overall_status, created_at=r.created_at)
        for r, title, label in rows
    ]


@router.get("/{run_id}/status", response_model=RunStatus)
def run_status(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RunStatus:
    run = owned_run(db, run_id, user)
    logs = {l.node: l for l in db.scalars(select(AgentExecutionLog).where(AgentExecutionLog.run_id == run.id)).all()}
    progress = []
    for node in NODE_ORDER + [n for n in logs if n not in NODE_ORDER]:
        log = logs.get(node)
        if log is None:
            progress.append(NodeProgress(node=node, status="pending"))
        else:
            progress.append(NodeProgress(node=node, status=log.status, started_at=log.started_at,
                                         ended_at=log.ended_at, summary=log.summary))
    return RunStatus(run_id=run.id, status=run.status, overall_status=run.overall_status, progress=progress,
                     error=run.error, created_at=run.created_at, completed_at=run.completed_at)


@router.get("/{run_id}", response_model=RunDetail)
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RunDetail:
    run = owned_run(db, run_id, user)
    trial = db.get(Trial, run.trial_id)
    profile = db.get(PatientProfile, run.patient_profile_id)
    audit.record(db, user.id, "result.read", "eligibility_run", run.id)
    return RunDetail(
        run_id=run.id, status=run.status, trial_id=run.trial_id, trial_title=trial.title if trial else "",
        patient_id=run.patient_id, patient_label=profile.label if profile else "",
        patient_profile_version=run.patient_profile_version, protocol_version=run.protocol_version,
        result=run.result, error=run.error, human_review_notice=HUMAN_REVIEW_NOTICE,
        created_at=run.created_at, completed_at=run.completed_at,
    )


@router.get("/{run_id}/evidence")
def get_evidence(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    run = owned_run(db, run_id, user)
    rows = db.scalars(select(EvidenceReferenceRow).where(EvidenceReferenceRow.run_id == run.id)
                      .order_by(EvidenceReferenceRow.criterion_id, EvidenceReferenceRow.page)).all()
    audit.record(db, user.id, "evidence.read", "eligibility_run", run.id)
    return {
        "run_id": run.id,
        "trial_id": run.trial_id,
        "protocol_version": run.protocol_version,
        "evidence": [
            {"criterion_id": r.criterion_id, "page": r.page, "excerpt": r.excerpt, "chunk_id": r.chunk_id,
             "source": r.source, "score": r.score}
            for r in rows
        ],
        "human_review_notice": HUMAN_REVIEW_NOTICE,
    }


@router.get("/{run_id}/audit")
def get_audit(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    run = owned_run(db, run_id, user)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.owner_id == user.id,
               or_(AuditEvent.resource_id == run.id, AuditEvent.resource_id == run.trial_id,
                   AuditEvent.resource_id == run.patient_id))
        .order_by(AuditEvent.created_at)
    ).all()
    logs = db.scalars(select(AgentExecutionLog).where(AgentExecutionLog.run_id == run.id)
                      .order_by(AgentExecutionLog.started_at)).all()
    return {
        "run_id": run.id,
        "audit_events": [
            {"id": e.id, "action": e.action, "resource_type": e.resource_type, "resource_id": e.resource_id,
             "details": e.details, "created_at": e.created_at.isoformat()}
            for e in events
        ],
        "agent_execution_logs": [
            {"node": l.node, "status": l.status, "started_at": l.started_at.isoformat() if l.started_at else None,
             "ended_at": l.ended_at.isoformat() if l.ended_at else None, "summary": l.summary}
            for l in logs
        ],
    }
