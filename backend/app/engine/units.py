"""Unit normalization and conversion using an explicit, validated table only.

Conversions not listed here are refused (UnitConversionError) rather than guessed.
"""

import re


class UnitConversionError(ValueError):
    pass


# raw unit spelling (normalized: lower case, no spaces) -> canonical unit token
_UNIT_ALIASES: dict[str, str] = {
    "ml/min/1.73m2": "mL/min/1.73m2",
    "ml/min/1.73m²": "mL/min/1.73m2",
    "ml/min/1.73m^2": "mL/min/1.73m2",
    "ml/min/1.73sqm": "mL/min/1.73m2",
    "ml/min": "mL/min",
    "mg/dl": "mg/dL",
    "µmol/l": "umol/L",
    "μmol/l": "umol/L",
    "umol/l": "umol/L",
    "mmol/l": "mmol/L",
    "g/dl": "g/dL",
    "g/l": "g/L",
    "u/l": "U/L",
    "iu/l": "U/L",
    "x10^9/l": "10^9/L",
    "10^9/l": "10^9/L",
    "x10e9/l": "10^9/L",
    "10*9/l": "10^9/L",
    "x10^3/µl": "10^3/uL",
    "x10^3/ul": "10^3/uL",
    "10^3/ul": "10^3/uL",
    "10^3/µl": "10^3/uL",
    "k/ul": "10^3/uL",
    "%": "%",
    "ms": "ms",
    "msec": "ms",
    "kg": "kg",
    "kg/m2": "kg/m2",
    "kg/m²": "kg/m2",
    "year": "years",
    "years": "years",
    "yrs": "years",
    "y": "years",
}

# canonical unit per attribute (what the comparators work in)
CANONICAL_UNITS: dict[str, str] = {
    "age": "years",
    "egfr": "mL/min/1.73m2",
    "crcl": "mL/min",
    "creatinine": "mg/dL",
    "bilirubin": "mg/dL",
    "hemoglobin": "g/dL",
    "alt": "U/L",
    "ast": "U/L",
    "platelets": "10^9/L",
    "anc": "10^9/L",
    "hba1c": "%",
    "lvef": "%",
    "qtc": "ms",
    "bmi": "kg/m2",
    "weight": "kg",
    "potassium": "mmol/L",
    "sodium": "mmol/L",
}

# (attribute, from_unit, to_unit) -> factor to multiply by
_CONVERSIONS: dict[tuple[str, str, str], float] = {
    ("creatinine", "umol/L", "mg/dL"): 1 / 88.4,
    ("creatinine", "mg/dL", "umol/L"): 88.4,
    ("bilirubin", "umol/L", "mg/dL"): 1 / 17.1,
    ("bilirubin", "mg/dL", "umol/L"): 17.1,
    ("hemoglobin", "g/L", "g/dL"): 0.1,
    ("hemoglobin", "g/dL", "g/L"): 10.0,
    ("platelets", "10^3/uL", "10^9/L"): 1.0,
    ("platelets", "10^9/L", "10^3/uL"): 1.0,
    ("anc", "10^3/uL", "10^9/L"): 1.0,
    ("anc", "10^9/L", "10^3/uL"): 1.0,
}

UNIT_PATTERN = re.compile(
    r"(mL/min/1\.73\s*m(?:2|²|\^2)|mL/min|mg/dL|[µμu]mol/L|mmol/L|g/dL|g/L|I?U/L|"
    r"x?\s?10\^?[39]/[µμu]?L|%|msec|ms|kg/m(?:2|²)|kg|years?)",
    re.IGNORECASE,
)


def normalize_unit(unit: str | None) -> str | None:
    if unit is None:
        return None
    key = re.sub(r"\s+", "", unit.strip()).lower()
    if not key:
        return None
    return _UNIT_ALIASES.get(key, unit.strip())


def convert(attribute: str, value: float, from_unit: str | None, to_unit: str | None) -> float:
    """Convert value between units for an attribute, or raise UnitConversionError."""
    src = normalize_unit(from_unit)
    dst = normalize_unit(to_unit)
    if src == dst:
        return value
    if src is None or dst is None:
        raise UnitConversionError(f"cannot convert {attribute} without both units ({from_unit!r} -> {to_unit!r})")
    factor = _CONVERSIONS.get((attribute, src, dst))
    if factor is None:
        raise UnitConversionError(f"no validated conversion for {attribute} from {src} to {dst}")
    return round(value * factor, 4)


def to_canonical(attribute: str, value: float, unit: str | None) -> tuple[float, str | None]:
    """Convert to the attribute's canonical unit. A missing unit is accepted only when
    the attribute has a single canonical unit and is then assumed to be in it."""
    canonical = CANONICAL_UNITS.get(attribute)
    if canonical is None:
        return value, normalize_unit(unit)
    if unit is None or not unit.strip():
        raise UnitConversionError(f"{attribute} value has no unit; expected {canonical}")
    return convert(attribute, value, unit, canonical), canonical
