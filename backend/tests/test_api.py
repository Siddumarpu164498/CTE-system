"""HTTP API: auth, uploads, ownership, background analysis and persistence round-trip."""

import json

from sqlalchemy import func, select


def _upload(client, headers, fixture_path, name="protocol_renal.pdf"):
    with open(fixture_path(name), "rb") as fh:
        r = client.post("/api/trials/upload", headers=headers, files={"file": (name, fh, "application/pdf")},
                        data={"title": "Renal demo"})
    assert r.status_code == 201, r.text
    return r.json()


def _patient(client, headers, load_patient, name="patient_69_egfr28.json"):
    body = load_patient(name)
    r = client.post("/api/patients", headers=headers, json={"label": body["label"], "profile": body["profile"]})
    assert r.status_code == 201, r.text
    return r.json()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert "does not replace" in r.json()["human_review_notice"]


def test_auth_flow(client):
    r = client.post("/api/auth/register", json={"email": "A@Example.org", "password": "password123"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    assert client.post("/api/auth/register", json={"email": "a@example.org", "password": "password123"}).status_code == 409
    bad = client.post("/api/auth/login", json={"email": "a@example.org", "password": "wrong-password"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "INVALID_CREDENTIALS"
    ok = client.post("/api/auth/login", json={"email": "a@example.org", "password": "password123"})
    assert ok.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "a@example.org"
    assert client.get("/api/auth/me").json()["error"]["code"] == "UNAUTHENTICATED"
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_upload_rejects_non_pdf_and_unreadable(client, auth_headers):
    h = auth_headers()
    r = client.post("/api/trials/upload", headers=h, files={"file": ("notes.txt", b"hello world", "text/plain")})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_FILE_TYPE"
    r = client.post("/api/trials/upload", headers=h,
                    files={"file": ("broken.pdf", b"%PDF-1.4\n garbage that is not a pdf", "application/pdf")})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "UNREADABLE_PDF"
    assert set(r.json()["error"]) == {"code", "message", "details"}


def test_upload_size_limit(client, auth_headers, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    r = client.post("/api/trials/upload", headers=auth_headers(),
                    files={"file": ("a.pdf", b"%PDF-1.4 tiny", "application/pdf")})
    assert r.status_code == 413


def test_upload_returns_criteria_and_pages(client, auth_headers, fixture_path):
    h = auth_headers()
    trial = _upload(client, h, fixture_path)
    assert trial["status"] == "ready" and trial["page_count"] == 3
    assert [c["criterion_id"] for c in trial["criteria"]] == ["INC-01", "INC-02", "EXC-01", "EXC-02"]
    assert {c["source_page"] for c in trial["criteria"]} == {2, 3}
    page = client.get(f"/api/trials/{trial['id']}/pages/2", headers=h).json()
    assert "Inclusion Criteria" in page["text"]
    assert client.get(f"/api/trials/{trial['id']}/pages/9", headers=h).status_code == 404
    assert len(client.get(f"/api/trials/{trial['id']}/criteria", headers=h).json()) == 4
    listed = client.get("/api/trials", headers=h).json()
    assert listed[0]["criteria_count"] == 4
    detail = client.get(f"/api/trials/{trial['id']}", headers=h).json()
    assert detail["index_status"].startswith("ready")


def test_patient_versioning(client, auth_headers, load_patient):
    h = auth_headers()
    p = _patient(client, h, load_patient)
    assert p["version"] == 1
    body = load_patient("patient_69_egfr28.json")
    body["profile"]["labs"][0]["value"] = 31
    r = client.patch(f"/api/patients/{p['id']}", headers=h, json={"profile": body["profile"]})
    assert r.status_code == 200 and r.json()["version"] == 2 and r.json()["versions"] == [1, 2]
    assert client.get(f"/api/patients/{p['id']}", headers=h).json()["profile"]["labs"][0]["value"] == 31
    assert len(client.get("/api/patients", headers=h).json()) == 1
    bad = client.post("/api/patients", headers=h, json={"label": "x", "profile": {"labs": [{"name": "eGFR"}]}})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "VALIDATION_ERROR"


def test_full_analysis_round_trip(client, auth_headers, fixture_path, load_patient):
    from app.database import SessionLocal
    from app.models import AgentExecutionLog, CriterionEvaluationRow, EligibilityRun, EvidenceReferenceRow

    h = auth_headers()
    trial = _upload(client, h, fixture_path)
    patient = _patient(client, h, load_patient)
    r = client.post("/api/eligibility/analyze", headers=h, json={"trial_id": trial["id"], "patient_id": patient["id"]})
    assert r.status_code == 202
    run_id = r.json()["run_id"]

    status = client.get(f"/api/eligibility/{run_id}/status", headers=h).json()
    assert status["status"] == "completed", status
    assert status["overall_status"] == "NOT_ELIGIBLE"
    nodes = {p["node"]: p["status"] for p in status["progress"]}
    assert nodes["inclusion_matching"] == "completed" and nodes["persist"] == "completed"

    detail = client.get(f"/api/eligibility/{run_id}", headers=h).json()
    result = detail["result"]
    assert result["overall_status"] == "NOT_ELIGIBLE"
    assert result["human_review_required"] is True
    trig = result["silent_exclusion_triggers"][0]
    assert trig["domain"] == "renal"
    assert {2, 3} <= {e["page"] for e in trig["evidence_references"]}
    assert detail["patient_profile_version"] == 1 and detail["protocol_version"].startswith("v1-")

    evidence = client.get(f"/api/eligibility/{run_id}/evidence", headers=h).json()["evidence"]
    assert {(e["criterion_id"], e["page"]) for e in evidence} >= {("INC-02", 2), ("EXC-01", 3)}
    audit = client.get(f"/api/eligibility/{run_id}/audit", headers=h).json()
    actions = {e["action"] for e in audit["audit_events"]}
    assert {"analysis.requested", "analysis.completed", "result.read", "trial.uploaded"} <= actions
    assert len(audit["agent_execution_logs"]) >= 9
    runs = client.get("/api/eligibility", headers=h).json()
    assert runs[0]["run_id"] == run_id and runs[0]["overall_status"] == "NOT_ELIGIBLE"

    # Persistence is idempotent by run_id: re-running the same run never duplicates rows.
    from app.services.analysis import run_analysis

    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(CriterionEvaluationRow).where(CriterionEvaluationRow.run_id == run_id))
        ev_before = db.scalar(select(func.count()).select_from(EvidenceReferenceRow).where(EvidenceReferenceRow.run_id == run_id))
    run_analysis(run_id)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(CriterionEvaluationRow).where(CriterionEvaluationRow.run_id == run_id)) == before == 4
        assert db.scalar(select(func.count()).select_from(EvidenceReferenceRow).where(EvidenceReferenceRow.run_id == run_id)) == ev_before
        assert db.scalar(select(func.count()).select_from(AgentExecutionLog).where(AgentExecutionLog.run_id == run_id)) == 9
        assert db.get(EligibilityRun, run_id).overall_status == "NOT_ELIGIBLE"


def test_user_b_cannot_read_user_a_records(client, auth_headers, fixture_path, load_patient):
    a = auth_headers("a@example.org")
    b = auth_headers("b@example.org")
    trial = _upload(client, a, fixture_path)
    patient = _patient(client, a, load_patient)
    run_id = client.post("/api/eligibility/analyze", headers=a,
                         json={"trial_id": trial["id"], "patient_id": patient["id"]}).json()["run_id"]
    for url in (
        f"/api/trials/{trial['id']}", f"/api/trials/{trial['id']}/criteria", f"/api/trials/{trial['id']}/pages/2",
        f"/api/patients/{patient['id']}", f"/api/eligibility/{run_id}", f"/api/eligibility/{run_id}/status",
        f"/api/eligibility/{run_id}/evidence", f"/api/eligibility/{run_id}/audit",
    ):
        r = client.get(url, headers=b)
        assert r.status_code == 404, url
        assert r.json()["error"]["code"] == "NOT_FOUND"
    assert client.patch(f"/api/patients/{patient['id']}", headers=b, json={"profile": {}}).status_code == 404
    r = client.post("/api/eligibility/analyze", headers=b, json={"trial_id": trial["id"], "patient_id": patient["id"]})
    assert r.status_code == 404
    assert client.get("/api/trials", headers=b).json() == []
    assert client.get("/api/eligibility", headers=b).json() == []


def test_migrations_apply_cleanly(tmp_root, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from pathlib import Path
    from sqlalchemy import create_engine, inspect

    from app.config import get_settings

    url = f"sqlite:///{tmp_root / 'migrated.db'}"
    monkeypatch.setattr(get_settings(), "database_url", url)
    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {
        "users", "trials", "protocol_documents", "protocol_criteria", "patient_profiles", "patient_observations",
        "eligibility_runs", "criterion_evaluations", "contradiction_findings", "evidence_references",
        "agent_execution_logs", "audit_events",
    } <= tables
    command.downgrade(cfg, "base")
    assert "users" not in set(inspect(create_engine(url)).get_table_names())
