"""Agent A - Protocol Extraction.

Reads per-page protocol text, finds the Inclusion and Exclusion sections, and turns each
numbered/bulleted item into a validated `Criterion` with its real page number and an
excerpt that is verified to appear on that page.

The LLM path (when configured) proposes criteria as strict JSON; the rule-based path is
always available and is used whenever the LLM is unavailable or its output fails
validation. Neither path may invent a rule or a page: any excerpt that cannot be found
on its cited page is flagged for human review with lowered confidence.
"""

import logging
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from app.engine.units import CANONICAL_UNITS, UNIT_PATTERN, normalize_unit
from app.engine.vocabulary import AMBIGUOUS_QUALIFIERS, find_lab_in_text, normalize_text
from app.rag.pdf_loader import PageText
from app.schemas.clinical import Criterion, NormalizedRule
from app.services.llm import UNTRUSTED_DATA_RULE, LLMClient, LLMError

log = logging.getLogger(__name__)

_HEADING = re.compile(
    r"^\s*(?:\d+(?:\.\d+)*\.?\s+)?(inclusion|exclusion)\s+criteria\s*:?\s*$", re.IGNORECASE
)
_END_HEADINGS = (
    "study design", "study procedures", "study treatment", "treatment plan", "statistical",
    "withdrawal", "concomitant", "assessments", "schedule of", "endpoints", "objectives",
    "references", "appendix", "randomization", "randomisation", "safety reporting", "discontinuation",
)
_ITEM = re.compile(r"^\s*(?:(\d{1,3})[.)]|[•▪●\-\*])\s+(\S.*)$")
_FOOTER = re.compile(
    r"^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s*/\s*\d+|confidential.*)\s*$|\bpage\s+\d+\s+of\s+\d+\b",
    re.IGNORECASE,
)
_NUM = r"(-?\d+(?:\.\d+)?)"

_SEMANTIC_MARKERS = ("able to", "willing", "consent", "agree to", "comply", "understand")


@dataclass
class RawItem:
    category: str
    page: int
    text: str
    excerpt: str


@dataclass
class ParsedRule:
    rule: NormalizedRule | None
    required_attributes: list[str]
    confidence: float
    review_reasons: list[str] = field(default_factory=list)


@dataclass
class ExtractionResult:
    criteria: list[Criterion]
    method: str
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- helpers


def normalize_ws(text: str) -> str:
    return normalize_text(text)


def excerpt_on_page(excerpt: str, page_text: str) -> bool:
    """Whitespace/case-normalized check that an excerpt literally appears on a page."""
    e = normalize_ws(excerpt)
    return bool(e) and e in normalize_ws(page_text)


def _is_end_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 70 or s.endswith((".", ",", ";")) or _ITEM.match(s):
        return False
    low = re.sub(r"^\d+(?:\.\d+)*\.?\s+", "", s.lower())
    return any(low.startswith(h) for h in _END_HEADINGS)


def _boilerplate_lines(pages: list[PageText]) -> set[str]:
    """Running headers/footers: lines that repeat on several pages once digits are masked."""
    if len(pages) < 2:
        return set()
    seen: dict[str, set[int]] = {}
    for page in pages:
        for line in page.text.splitlines():
            key = re.sub(r"\d+", "#", line.strip().lower())
            if key and not _ITEM.match(line) and not _HEADING.match(line):
                seen.setdefault(key, set()).add(page.page)
    return {k for k, on in seen.items() if len(on) >= max(2, (len(pages) + 1) // 2)}


def find_criteria_items(pages: list[PageText]) -> list[RawItem]:
    """Walk pages line by line and collect list items under inclusion/exclusion headings."""
    items: list[RawItem] = []
    boilerplate = _boilerplate_lines(pages)
    section: str | None = None
    current: RawItem | None = None

    def flush() -> None:
        nonlocal current
        if current is not None:
            current.text = re.sub(r"\s+", " ", current.text).strip()
            current.excerpt = re.sub(r"\s+", " ", current.excerpt).strip()
            if current.text:
                items.append(current)
        current = None

    for page in pages:
        for raw_line in page.text.splitlines():
            line = raw_line.strip()
            if not line or _FOOTER.search(line) or re.sub(r"\d+", "#", line.lower()) in boilerplate:
                continue
            heading = _HEADING.match(line)
            if heading:
                flush()
                section = heading.group(1).lower()
                continue
            if section and _is_end_heading(line):
                flush()
                section = None
                continue
            if not section:
                continue
            item = _ITEM.match(line)
            if item:
                flush()
                body = item.group(2).strip()
                current = RawItem(category=section, page=page.page, text=body, excerpt=body)
            elif current is not None:
                current.text += " " + line
                if page.page == current.page:
                    current.excerpt += " " + line
    flush()
    return items


# --------------------------------------------------------------------------- rule parsing

_GTE = r"must not be below|must not be less than|not below|not less than|no less than|at least|greater than or equal to|equal to or greater than|minimum of|≥|>="
_LTE = r"must not exceed|not exceeding|not exceed|no more than|not more than|not greater than|not above|at most|less than or equal to|equal to or less than|maximum of|≤|<="
_LT = r"below|less than|lower than|under|<"
_GT = r"above|greater than|more than|higher than|exceeding|exceeds|exceed|>"
_OPS: list[tuple[str, str]] = [("gte", _GTE), ("lte", _LTE), ("lt", _LT), ("gt", _GT)]


def _unit_after(text: str, pos: int) -> str | None:
    m = UNIT_PATTERN.match(text, pos)
    if not m:
        m = UNIT_PATTERN.match(text, pos + 1) if pos < len(text) and text[pos] == " " else None
    return normalize_unit(m.group(0)) if m else None


def _parse_age(t: str) -> ParsedRule | None:
    if "age" not in t and "years" not in t:
        return None
    m = re.search(
        r"(?:age[d]?|aged)\s*(?:of\s*)?(?:between\s*)?" + _NUM + r"\s*(?:years?\s*)?(?:to|-|and)\s*" + _NUM
        + r"\s*(?:years?)?(?:\s*(?:of age|old))?\s*\(?(inclusive|exclusive)?",
        t,
    ) or re.search(
        r"(?:between\s*)?" + _NUM + r"\s*(?:to|-|and)\s*" + _NUM + r"\s*years?\s*(?:of age|old)?\s*\(?(inclusive|exclusive)?",
        t,
    )
    if m:
        lo, hi, incl = float(m.group(1)), float(m.group(2)), m.group(3)
        reasons = []
        inclusive: bool | None = {"inclusive": True, "exclusive": False}.get(incl or "")
        if inclusive is None:
            reasons.append("Age range does not state whether the bounds are inclusive.")
        rule = NormalizedRule(attribute="age", operator="between", value=lo, value_max=hi, unit="years", inclusive=inclusive)
        return ParsedRule(rule, ["age"], 0.95 if inclusive is not None else 0.75, reasons)
    patterns = [
        ("gte", r"(?:age[d]?\s*)?(?:≥|>=|at least)\s*" + _NUM + r"\s*years"),
        ("gte", _NUM + r"\s*years\s*(?:of age\s*)?(?:or|and)\s*(?:older|above|over)"),
        ("gte", r"age[d]?\s*(?:≥|>=)\s*" + _NUM),
        ("gt", r"(?:age[d]?\s*)?(?:older than|over|>)\s*" + _NUM + r"\s*years"),
        ("lt", r"(?:age[d]?\s*)?(?:younger than|under|<)\s*" + _NUM + r"\s*years"),
        ("lte", r"(?:age[d]?\s*)?(?:≤|<=|at most|no older than)\s*" + _NUM + r"\s*years"),
    ]
    for op, pat in patterns:
        m = re.search(pat, t)
        if m:
            rule = NormalizedRule(attribute="age", operator=op, value=float(m.group(1)), unit="years")
            return ParsedRule(rule, ["age"], 0.9)
    return None


def _parse_lab(t: str) -> ParsedRule | None:
    found = find_lab_in_text(t)
    if not found:
        return None
    attribute, alias = found
    start = t.find(alias)
    tail = t[start + len(alias):]
    reasons: list[str] = []

    if re.search(r"\b\d+(?:\.\d+)?\s*(?:x|×|times)\s*(?:the\s*)?(?:uln|upper limit of normal)", tail):
        reasons.append("Threshold is relative to the upper limit of normal; patient reference range required.")
        return ParsedRule(None, [attribute], 0.5, reasons)

    between = re.search(r"between\s*" + _NUM + r"\s*(?:and|to|-)\s*" + _NUM, tail)
    if between:
        unit = _unit_after(tail, between.end())
        rule = NormalizedRule(
            attribute=attribute, operator="between", value=float(between.group(1)),
            value_max=float(between.group(2)), unit=unit or CANONICAL_UNITS.get(attribute),
            inclusive=None,
        )
        reasons.append("Range does not state whether the bounds are inclusive.")
        return ParsedRule(rule, [attribute], 0.75, reasons)

    best: tuple[int, str, re.Match] | None = None
    for op, phrases in _OPS:
        m = re.search(r"(?:" + phrases + r")\s*(?:a\s+value\s+of\s*)?" + _NUM, tail)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), op, m)
    postfix = re.search(_NUM + r"\s*(\S+)?\s*or\s*(more|greater|higher|above|less|lower|below)", tail)
    if best is None and postfix:
        op = "gte" if postfix.group(3) in {"more", "greater", "higher", "above"} else "lte"
        value = float(postfix.group(1))
        unit = _unit_after(tail, postfix.start(1) + len(postfix.group(1)))
    elif best is not None:
        _, op, m = best
        value = float(m.group(1))
        unit = _unit_after(tail, m.end())
    else:
        reasons.append(f"{alias} is mentioned but no numeric threshold could be parsed.")
        return ParsedRule(None, [attribute], 0.4, reasons)

    confidence = 0.92
    if unit is None:
        unit = CANONICAL_UNITS.get(attribute)
        reasons.append(f"Unit not stated in protocol text; assumed {unit}.")
        confidence = 0.7
    rule = NormalizedRule(attribute=attribute, operator=op, value=value, unit=unit)  # type: ignore[arg-type]
    return ParsedRule(rule, [attribute], confidence, reasons)


_CONDITION_PREFIXES = re.compile(
    r"^(?:(?:a|any|known|documented|current|active|prior|previous|confirmed|clinical)\s+)*"
    r"(?:history of|diagnosis of|presence of|evidence of|patients with|participants with|subjects with)?\s*",
)


def _parse_condition(t: str) -> ParsedRule:
    body = t.rstrip(" .;")
    body = re.split(r",\s*(?:defined|as defined|including|e\.g\.|such as)\b", body)[0]
    body = _CONDITION_PREFIXES.sub("", body).strip()
    terms = [p.strip(" .;") for p in re.split(r"\s+(?:and/or|or)\s+|,\s*", body) if p.strip(" .;")]
    reasons: list[str] = []
    for q in AMBIGUOUS_QUALIFIERS:
        if re.search(r"(?<![a-z])" + re.escape(q) + r"(?![a-z])", t):
            reasons.append(f"'{q}' is not defined numerically in the protocol; clinical interpretation required.")
            break
    confidence = 0.55 if reasons else 0.75
    rule = NormalizedRule(attribute="condition", operator="present", value=terms or [body])
    return ParsedRule(rule, ["condition:" + "|".join(terms or [body])], confidence, reasons)


def _parse_time_window(t: str) -> ParsedRule | None:
    m = re.search(r"within\s*(?:the\s*)?(?:last\s*|past\s*|previous\s*)?" + _NUM + r"\s*(days?|weeks?|months?)", t)
    if not m:
        return None
    n = float(m.group(1))
    days = n * {"d": 1, "w": 7, "m": 30}[m.group(2)[0]]
    subject = t[: m.start()].rstrip(" ,")
    subject = re.sub(r"^(?:received|receipt of|treatment with|use of|prior)\s+", "", subject).strip()
    reasons = []
    if m.group(2).startswith("month"):
        reasons.append("Month-based window converted to days using 30 days per month.")
    rule = NormalizedRule(attribute=f"event:{subject}", operator="within_days", value=days, unit="days")
    return ParsedRule(rule, [f"event:{subject}"], 0.7, reasons)


def parse_rule(text: str) -> ParsedRule:
    """Rule-based translation of one criterion's text into a NormalizedRule."""
    t = normalize_text(text)
    if any(marker in t for marker in _SEMANTIC_MARKERS):
        return ParsedRule(None, [], 0.4, ["Non-numeric criterion requires semantic evaluation."])
    for parser in (_parse_age, _parse_lab, _parse_time_window):
        parsed = parser(t)
        if parsed is not None:
            return parsed
    if re.search(r"\d", t):
        return ParsedRule(None, [], 0.4, ["Criterion contains numbers that could not be parsed into a rule."])
    return _parse_condition(t)


# --------------------------------------------------------------------------- builders


def _build_criterion(
    trial_id: str,
    category: str,
    index: int,
    text: str,
    page: int,
    excerpt: str,
    pages_by_no: dict[int, str],
    parsed: ParsedRule,
    method: str,
) -> Criterion:
    reasons = list(parsed.review_reasons)
    confidence = parsed.confidence
    page_text = pages_by_no.get(page)
    if page_text is None or not excerpt_on_page(excerpt, page_text):
        reasons.append(f"Source excerpt could not be verified on cited page {page}.")
        confidence = min(confidence, 0.3)
    if parsed.rule is None and not any("semantic" in r for r in reasons):
        reasons.append("No machine-readable rule; requires semantic evaluation or human review.")
    prefix = "INC" if category == "inclusion" else "EXC"
    return Criterion(
        criterion_id=f"{prefix}-{index:02d}",
        trial_id=trial_id,
        category=category,  # type: ignore[arg-type]
        original_text=text,
        normalized_rule=parsed.rule,
        required_attributes=parsed.required_attributes,
        source_page=page,
        source_excerpt=excerpt,
        extraction_confidence=round(confidence, 2),
        requires_human_review=bool(reasons),
        review_reasons=reasons,
        extraction_method=method,  # type: ignore[arg-type]
    )


def extract_rule_based(pages: list[PageText], trial_id: str) -> list[Criterion]:
    pages_by_no = {p.page: p.text for p in pages}
    counters = {"inclusion": 0, "exclusion": 0}
    criteria: list[Criterion] = []
    for item in find_criteria_items(pages):
        counters[item.category] += 1
        criteria.append(
            _build_criterion(
                trial_id, item.category, counters[item.category], item.text, item.page,
                item.excerpt, pages_by_no, parse_rule(item.text), "rule_based",
            )
        )
    return criteria


# --------------------------------------------------------------------------- LLM path

_NULLABLE_STR = {"type": ["string", "null"]}
_NULLABLE_NUM = {"type": ["number", "null"]}

LLM_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["criteria"],
    "properties": {
        "criteria": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "category", "original_text", "source_page", "source_excerpt", "attribute", "operator",
                    "value", "value_terms", "value_max", "unit", "inclusive", "ambiguity_reason",
                ],
                "properties": {
                    "category": {"type": "string", "enum": ["inclusion", "exclusion"]},
                    "original_text": {"type": "string"},
                    "source_page": {"type": "integer"},
                    "source_excerpt": {"type": "string"},
                    "attribute": _NULLABLE_STR,
                    "operator": {
                        "type": ["string", "null"],
                        "enum": ["gt", "gte", "lt", "lte", "eq", "between", "present", "absent", "within_days", None],
                    },
                    "value": _NULLABLE_NUM,
                    "value_terms": {"type": ["array", "null"], "items": {"type": "string"}},
                    "value_max": _NULLABLE_NUM,
                    "unit": _NULLABLE_STR,
                    "inclusive": {"type": ["boolean", "null"]},
                    "ambiguity_reason": _NULLABLE_STR,
                },
            },
        }
    },
}

LLM_SYSTEM = (
    "You extract clinical trial eligibility criteria from protocol text. " + UNTRUSTED_DATA_RULE + " "
    "Return every inclusion and exclusion criterion in document order. original_text and source_excerpt "
    "must be copied verbatim from the page given as source_page. Use canonical attributes: age, egfr, "
    "creatinine, crcl, alt, ast, bilirubin, hemoglobin, platelets, anc, hba1c, lvef, qtc, bmi, weight, "
    "potassium, sodium; use attribute 'condition' with operator 'present' and value_terms for diagnoses. "
    "Set operator null when the rule cannot be expressed this way. Fill ambiguity_reason when wording is "
    "vague (e.g. 'severe', 'adequate') and no numeric definition is given. Never interpret vague wording."
)


def extract_with_llm(pages: list[PageText], trial_id: str, llm: LLMClient) -> list[Criterion]:
    doc = "\n".join(f'<document page="{p.page}">\n{p.text}\n</document>' for p in pages)
    data = llm.complete_json(LLM_SYSTEM, f"Extract the eligibility criteria.\n{doc}", LLM_SCHEMA)
    pages_by_no = {p.page: p.text for p in pages}
    counters = {"inclusion": 0, "exclusion": 0}
    criteria: list[Criterion] = []
    for raw in data.get("criteria", []):
        category = raw.get("category")
        if category not in counters:
            continue
        counters[category] += 1
        reasons: list[str] = []
        rule: NormalizedRule | None = None
        if raw.get("attribute") and raw.get("operator"):
            value = raw.get("value_terms") if raw.get("operator") in {"present", "absent"} else raw.get("value")
            try:
                rule = NormalizedRule(
                    attribute=raw["attribute"], operator=raw["operator"], value=value,
                    value_max=raw.get("value_max"), unit=normalize_unit(raw.get("unit")),
                    inclusive=raw.get("inclusive"),
                )
            except ValidationError as exc:
                reasons.append(f"Model-proposed rule failed validation: {exc.errors()[0]['msg']}")
        if raw.get("ambiguity_reason"):
            reasons.append(str(raw["ambiguity_reason"]))
        if rule and rule.operator == "between" and rule.inclusive is None:
            reasons.append("Range does not state whether the bounds are inclusive.")
        attrs = [rule.attribute] if rule else []
        parsed = ParsedRule(rule, attrs, 0.85 if rule and not reasons else 0.6, reasons)
        criteria.append(
            _build_criterion(
                trial_id, category, counters[category], str(raw.get("original_text", "")).strip(),
                int(raw.get("source_page") or 0) or 1, str(raw.get("source_excerpt", "")).strip(),
                pages_by_no, parsed, "llm",
            )
        )
    return criteria


def extract_criteria(pages: list[PageText], trial_id: str, llm: LLMClient | None = None) -> ExtractionResult:
    warnings: list[str] = []
    if llm is not None:
        try:
            criteria = extract_with_llm(pages, trial_id, llm)
            if criteria:
                return ExtractionResult(criteria, "llm", warnings)
            warnings.append("LLM returned no criteria; used rule-based extractor.")
        except (LLMError, ValidationError, ValueError, KeyError, TypeError, AttributeError) as exc:
            log.warning("LLM extraction failed, falling back to rule-based: %s", exc)
            warnings.append(f"LLM extraction failed ({type(exc).__name__}); used rule-based extractor.")
    return ExtractionResult(extract_rule_based(pages, trial_id), "rule_based", warnings)
