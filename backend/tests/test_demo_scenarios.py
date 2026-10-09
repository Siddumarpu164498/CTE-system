"""Regression tests for the synthetic demo protocols (hepatic, cardiac) and patients E-J.

The expected outcomes were observed from the offline pipeline (rule-based extraction,
deterministic comparators) and pin its behaviour; nothing here is hardcoded in the app.
"""

import pytest

from app.rag.pdf_loader import load_pdf


def _pages(fixture_path, name):
    return [p.to_dict() for p in load_pdf(fixture_path(name))]


def _statuses(result):
    return {e.criterion_id: e.status for e in result.inclusion_results + result.exclusion_results}


@pytest.mark.parametrize("protocol, expected", [
    ("protocol_hepatic.pdf", {
        "INC-01": ("age", "between"), "INC-02": ("platelets", "gte"), "INC-03": ("hemoglobin", "gte"),
        "EXC-01": ("alt", "gt"), "EXC-02": ("bilirubin", "gt"), "EXC-03": ("condition", "present"),
        "EXC-04": ("condition", "present"),
    }),
    ("protocol_cardio.pdf", {
        "INC-01": ("age", "gte"), "INC-02": ("lvef", "lte"), "INC-03": ("hba1c", "lt"),
        "EXC-01": ("event:myocardial infarction", "within_days"), "EXC-02": ("qtc", "gt"),
        "EXC-03": ("potassium", "gt"), "EXC-04": ("condition", "present"),
    }),
])
def test_demo_protocols_extract_to_rules(fixture_path, protocol, expected):
    from app.agents.protocol_extraction import extract_criteria
    from app.rag.pdf_loader import load_pdf as load

    result = extract_criteria(load(fixture_path(protocol)), "trial-demo")
    assert result.method == "rule_based"
    got = {c.criterion_id: (c.normalized_rule.attribute, c.normalized_rule.operator) for c in result.criteria}
    assert got == expected
    pages = {c.criterion_id: c.source_page for c in result.criteria}
    assert all(p == (2 if cid.startswith("INC") else 3) for cid, p in pages.items())


def test_hepatic_all_met_is_eligible(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_hepatic.pdf"), "patient_hep_eligible.json")["result"]
    assert result.overall_status == "ELIGIBLE", result.final_explanation
    assert result.silent_exclusion_triggers == []


def test_hepatic_high_alt_and_bilirubin_not_eligible(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_hepatic.pdf"), "patient_hep_high_alt.json")["result"]
    s = _statuses(result)
    assert result.overall_status == "NOT_ELIGIBLE"
    # hemoglobin 121 g/L converts to 12.1 g/dL; bilirubin compared in umol/L
    assert s["INC-03"] == "SATISFIED"
    assert s["EXC-01"] == "TRIGGERED" and s["EXC-02"] == "TRIGGERED"
    assert [t.domain for t in result.silent_exclusion_triggers] == ["hepatic"]


def test_hepatic_stale_platelets_requires_more_information(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_hepatic.pdf"), "patient_hep_stale_labs.json")["result"]
    s = _statuses(result)
    assert result.overall_status == "MORE_INFORMATION_REQUIRED"
    assert s["INC-02"] == "UNKNOWN"  # platelet count older than 90 days
    assert s["EXC-03"] == "UNKNOWN"  # cirrhosis neither documented nor ruled out
    assert any(m.attribute == "platelets" for m in result.missing_information)


def test_cardio_all_met_is_eligible(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_cardio.pdf"), "patient_cardio_eligible.json")["result"]
    assert result.overall_status == "ELIGIBLE", result.final_explanation
    assert _statuses(result)["EXC-01"] == "NOT_TRIGGERED"  # MI documented outside the 90-day window


def test_cardio_recent_mi_and_long_qtc_not_eligible(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_cardio.pdf"), "patient_cardio_recent_mi.json")["result"]
    s = _statuses(result)
    assert result.overall_status == "NOT_ELIGIBLE"
    assert s["EXC-01"] == "TRIGGERED" and s["EXC-02"] == "TRIGGERED"
    assert [t.domain for t in result.silent_exclusion_triggers] == ["cardiac"]


def test_cardio_missing_lvef_and_conflicting_potassium(fixture_path, run_workflow):
    result = run_workflow(_pages(fixture_path, "protocol_cardio.pdf"), "patient_cardio_incomplete.json")["result"]
    s = _statuses(result)
    assert result.overall_status == "MORE_INFORMATION_REQUIRED"
    assert s["INC-02"] == "UNKNOWN" and s["EXC-03"] == "UNKNOWN"
    assert any(c.conflict_type == "inconsistent_patient_values" and "potassium" in c.attributes
               for c in result.unresolved_conflicts)
