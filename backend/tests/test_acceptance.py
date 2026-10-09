"""MANDATORY acceptance test: Silent Exclusion Trigger for a 69-year-old with eGFR 28.

Runs fully offline (LLM_PROVIDER=none, keyword retriever).
"""


def _by_id(results):
    return {e.criterion_id: e for e in results}


def _pages(evaluation):
    return {r.page for r in evaluation.evidence_references}


def test_patient_69_egfr28_not_eligible_with_renal_trigger(renal_pages, run_workflow):
    state = run_workflow(renal_pages, "patient_69_egfr28.json")
    assert state.get("error") is None, state.get("error")
    result = state["result"]
    inc = _by_id(result.inclusion_results)
    exc = _by_id(result.exclusion_results)

    # INC age: SATISFIED, evidence page 2
    assert "age" in inc["INC-01"].original_text.lower()
    assert inc["INC-01"].status == "SATISFIED"
    assert 2 in _pages(inc["INC-01"])

    # INC eGFR: UNSATISFIED, patient value 28, expected >= 30, evidence page 2
    assert "egfr" in inc["INC-02"].original_text.lower()
    assert inc["INC-02"].status == "UNSATISFIED"
    assert inc["INC-02"].patient_value.startswith("28")
    assert ">= 30" in inc["INC-02"].expected_condition
    assert inc["INC-02"].comparison_method == "deterministic"
    assert 2 in _pages(inc["INC-02"])

    # EXC severe renal impairment: UNKNOWN, requires review, page 3, not confirmed by eGFR alone
    severe = exc["EXC-01"]
    assert "severe renal impairment" in severe.original_text.lower()
    assert severe.status == "UNKNOWN"
    assert severe.requires_human_review is True
    assert 3 in _pages(severe)
    assert "not confirmed by egfr alone" in severe.explanation.lower()

    # At least one renal-domain Silent Exclusion Trigger citing pages 2 and 3
    renal = [t for t in result.silent_exclusion_triggers if t.domain == "renal"]
    assert renal, result.silent_exclusion_triggers
    trigger = renal[0]
    assert {2, 3} <= {r.page for r in trigger.evidence_references}
    assert "INC-01" in trigger.inclusion_criterion_ids
    assert "EXC-01" in trigger.exclusion_criterion_ids
    assert "INC-02" in trigger.related_failing_criterion_ids
    assert "severe renal impairment is not confirmed by egfr alone" in trigger.explanation.lower()
    assert trigger.requires_human_review is True
    assert any(f.attribute == "egfr" and f.value.startswith("28") for f in trigger.patient_findings)

    # Overall NOT_ELIGIBLE, human review always required
    assert result.overall_status == "NOT_ELIGIBLE"
    assert result.human_review_required is True
    assert any(d.criterion_id == "INC-02" for d in result.decisive_evidence)


def test_defined_protocol_triggers_renal_exclusion(renal_defined_pages, run_workflow):
    state = run_workflow(renal_defined_pages, "patient_69_egfr28.json")
    result = state["result"]
    exc = _by_id(result.exclusion_results)
    assert exc["EXC-01"].status == "TRIGGERED"
    assert exc["EXC-01"].comparison_method == "deterministic"
    assert 3 in _pages(exc["EXC-01"])
    assert result.overall_status == "NOT_ELIGIBLE"
