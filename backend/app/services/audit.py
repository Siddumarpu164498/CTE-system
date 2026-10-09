"""Audit trail for uploads, analyses and reads of results."""

import logging

from sqlalchemy.orm import Session

from app.models import AuditEvent

log = logging.getLogger("audit")


def record(
    db: Session,
    owner_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    commit: bool = True,
) -> AuditEvent:
    event = AuditEvent(owner_id=owner_id, action=action, resource_type=resource_type,
                       resource_id=resource_id, details=details or {})
    db.add(event)
    if commit:
        db.commit()
    log.info("audit action=%s resource=%s/%s user=%s", action, resource_type, resource_id, owner_id)
    return event
