from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.patient_profile import normalize_patient
from app.api.errors import not_found
from app.config import get_settings
from app.database import get_db
from app.models import PatientObservation, PatientProfile, User, new_id
from app.schemas.api import PatientCreate, PatientOut, PatientSummary, PatientUpdate
from app.schemas.clinical import PatientProfileInput
from app.security.deps import get_current_user
from app.services import audit

router = APIRouter(prefix="/api/patients", tags=["patients"])


def latest_profile(db: Session, patient_id: str, user: User) -> PatientProfile:
    row = db.scalar(
        select(PatientProfile)
        .where(PatientProfile.patient_id == patient_id, PatientProfile.owner_id == user.id)
        .order_by(PatientProfile.version.desc())
        .limit(1)
    )
    if row is None:
        raise not_found("Patient")
    return row


def _store_version(db: Session, user: User, patient_id: str, version: int, label: str, profile: PatientProfileInput) -> PatientProfile:
    row = PatientProfile(patient_id=patient_id, owner_id=user.id, version=version, label=label,
                         data=profile.model_dump(mode="json"))
    db.add(row)
    db.flush()
    p = profile
    for lab in p.labs:
        db.add(PatientObservation(profile_id=row.id, owner_id=user.id, kind="lab", name=lab.name, value_num=lab.value,
                                  unit=lab.unit, observed_at=lab.observed_at.isoformat() if lab.observed_at else None))
    for dx in p.diagnoses:
        db.add(PatientObservation(profile_id=row.id, owner_id=user.id, kind="diagnosis", name=dx.name, value_text=dx.code,
                                  observed_at=dx.documented_at.isoformat() if dx.documented_at else None))
    for med in p.medications:
        db.add(PatientObservation(profile_id=row.id, owner_id=user.id, kind="medication", name=med.name,
                                  observed_at=med.start_date.isoformat() if med.start_date else None))
    for h in p.history:
        db.add(PatientObservation(profile_id=row.id, owner_id=user.id, kind="history", name=h.condition,
                                  value_text=None if h.present is None else str(h.present).lower()))
    if p.demographics.age is not None:
        db.add(PatientObservation(profile_id=row.id, owner_id=user.id, kind="demographic", name="age",
                                  value_num=p.demographics.age, unit="years"))
    db.commit()
    return row


def _out(db: Session, row: PatientProfile) -> PatientOut:
    profile = PatientProfileInput.model_validate(row.data)
    normalized = normalize_patient(profile, ["age"], stale_days=get_settings().stale_days)
    versions = db.scalars(select(PatientProfile.version).where(PatientProfile.patient_id == row.patient_id)
                          .order_by(PatientProfile.version)).all()
    first = db.scalar(select(func.min(PatientProfile.created_at)).where(PatientProfile.patient_id == row.patient_id))
    return PatientOut(id=row.patient_id, profile_version_id=row.id, version=row.version, label=row.label,
                      profile=profile, data_quality_flags=normalized.data_quality_flags, versions=list(versions),
                      created_at=first or row.created_at, updated_at=row.created_at)


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(body: PatientCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> PatientOut:
    row = _store_version(db, user, new_id(), 1, body.label, body.profile)
    audit.record(db, user.id, "patient.created", "patient", row.patient_id, {"version": 1})
    return _out(db, row)


@router.get("", response_model=list[PatientSummary])
def list_patients(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[PatientSummary]:
    latest = (
        select(PatientProfile.patient_id, func.max(PatientProfile.version).label("v"))
        .where(PatientProfile.owner_id == user.id)
        .group_by(PatientProfile.patient_id)
        .subquery()
    )
    rows = db.scalars(
        select(PatientProfile)
        .join(latest, (PatientProfile.patient_id == latest.c.patient_id) & (PatientProfile.version == latest.c.v))
        .order_by(PatientProfile.created_at.desc())
    ).all()
    return [PatientSummary(id=r.patient_id, label=r.label, version=r.version, updated_at=r.created_at) for r in rows]


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> PatientOut:
    row = latest_profile(db, patient_id, user)
    audit.record(db, user.id, "patient.read", "patient", patient_id)
    return _out(db, row)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: str, body: PatientUpdate, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)) -> PatientOut:
    current = latest_profile(db, patient_id, user)
    row = _store_version(db, user, patient_id, current.version + 1, body.label or current.label, body.profile)
    audit.record(db, user.id, "patient.updated", "patient", patient_id, {"version": row.version})
    return _out(db, row)
