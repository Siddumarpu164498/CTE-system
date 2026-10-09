"""Agent B: normalization, unit conversion and data-quality flags."""

from datetime import date

from app.agents.patient_profile import normalize_patient
from app.schemas.clinical import PatientProfileInput


def profile(**kw) -> PatientProfileInput:
    base = {"as_of": "2026-10-01", "demographics": {"age": 60}}
    base.update(kw)
    return PatientProfileInput.model_validate(base)


def test_lab_aliases_and_creatinine_conversion():
    p = normalize_patient(profile(labs=[
        {"name": "estimated GFR", "value": 55, "unit": "mL/min/1.73m²", "observed_at": "2026-09-01"},
        {"name": "Serum Creatinine", "value": 132.6, "unit": "µmol/L", "observed_at": "2026-09-01"},
    ]))
    assert p.attributes["egfr"].value == 55 and p.attributes["egfr"].status == "ok"
    cr = p.attributes["creatinine"]
    assert abs(cr.value - 1.5) < 1e-6 and cr.unit == "mg/dL"
    assert cr.observations[0].original_value == 132.6 and cr.observations[0].original_unit == "µmol/L"


def test_stale_conflicting_missing_and_unconvertible():
    p = normalize_patient(profile(labs=[
        {"name": "eGFR", "value": 40, "unit": "mL/min/1.73m2", "observed_at": "2026-03-01"},
        {"name": "ALT", "value": 30, "unit": "U/L", "observed_at": "2026-09-01"},
        {"name": "ALT", "value": 90, "unit": "U/L", "observed_at": "2026-09-01"},
        {"name": "eGFR-like", "value": 1, "unit": "furlongs"},
        {"name": "Hemoglobin", "value": 12, "unit": "mmol/L", "observed_at": "2026-09-01"},
    ]), required_attributes=["egfr", "platelets"])
    flags = {(f.attribute, f.flag) for f in p.data_quality_flags}
    assert ("egfr", "stale") in flags
    assert ("alt", "conflicting") in flags and p.attributes["alt"].value is None
    assert ("platelets", "missing") in flags
    assert ("hemoglobin", "unit_unconvertible") in flags
    assert p.attributes["egfr"].status == "stale"


def test_age_from_dob_and_conflict():
    ok = normalize_patient(PatientProfileInput.model_validate(
        {"as_of": "2026-10-01", "demographics": {"date_of_birth": "1957-10-01"}}))
    assert ok.attributes["age"].value == 69
    bad = normalize_patient(PatientProfileInput.model_validate(
        {"as_of": "2026-10-01", "demographics": {"age": 50, "date_of_birth": "1957-10-01"}}))
    assert bad.attributes["age"].status == "conflicting"


def test_today_default():
    p = normalize_patient(PatientProfileInput(), today=date(2026, 1, 1))
    assert p.as_of == date(2026, 1, 1)
    assert p.attributes["age"].status == "missing"
