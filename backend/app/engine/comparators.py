"""Deterministic comparators for numeric rules.

Each comparator returns True/False, or None when the result cannot be decided
(for example a value exactly on a boundary whose inclusivity the protocol does not state).
"""

from app.schemas.clinical import NormalizedRule

_SYMBOLS = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "eq": "="}


def _fmt(v: float | None) -> str:
    if v is None:
        return "?"
    return f"{v:g}"


def describe(rule: NormalizedRule) -> str:
    """Human-readable expected condition, e.g. 'eGFR >= 30 mL/min/1.73m2'."""
    from app.engine.vocabulary import label

    unit = f" {rule.unit}" if rule.unit else ""
    name = label(rule.attribute)
    if rule.operator in _SYMBOLS:
        return f"{name} {_SYMBOLS[rule.operator]} {_fmt(rule.value)}{unit}"
    if rule.operator == "between":
        if rule.inclusive is True:
            bounds = "inclusive"
        elif rule.inclusive is False:
            bounds = "exclusive"
        else:
            bounds = "inclusivity not stated"
        return f"{name} between {_fmt(rule.value)} and {_fmt(rule.value_max)}{unit} ({bounds})"
    if rule.operator in {"present", "absent"}:
        terms = rule.value if isinstance(rule.value, list) else [str(rule.value)]
        joined = " or ".join(terms)
        return f"{joined} {'documented' if rule.operator == 'present' else 'not documented'}"
    if rule.operator == "within_days":
        return f"{name} within {_fmt(rule.value)} days"
    return f"{name} {rule.operator} {rule.value}"


def compare(value: float, rule: NormalizedRule) -> bool | None:
    """Compare a patient value (already in the rule's unit) with a numeric rule."""
    op = rule.operator
    threshold = rule.value
    if op in {"gt", "gte", "lt", "lte", "eq"} and not isinstance(threshold, (int, float)):
        raise ValueError(f"rule {op} needs a numeric threshold")
    if op == "gt":
        return value > threshold
    if op == "gte":
        return value >= threshold
    if op == "lt":
        return value < threshold
    if op == "lte":
        return value <= threshold
    if op == "eq":
        return abs(value - threshold) < 1e-9
    if op == "between":
        lo, hi = float(threshold), float(rule.value_max)  # type: ignore[arg-type]
        on_boundary = value in (lo, hi)
        if lo < value < hi:
            return True
        if not on_boundary:
            return False
        if rule.inclusive is None:
            return None
        return rule.inclusive
    raise ValueError(f"operator {op} is not a numeric comparison")
