"""Agent B - Patient Profile.

Normalizes demographics and labs (canonical names and units, via the validated
conversion table only), keeps the original value and unit, and flags missing, stale,
conflicting and ambiguous data. It never treats an undocumented diagnosis as absent.
"""

from collections import defaultdict
from datetime import date

from app.engine.dates import age_on, is_stale
from app.engine.units import UnitConversionError, to_canonical
from app.engine.vocabulary import canonical_lab, label
from app.schemas.clinical import (
    AttributeValue,
    DataQualityFlag,
    NormalizedObservation,
    NormalizedProfile,
    PatientProfileInput,
)


def _resolve_age(profile: PatientProfileInput, as_of: date, flags: list[DataQualityFlag]) -> AttributeValue:
    demo = profile.demographics
    from_dob = age_on(demo.date_of_birth, as_of) if demo.date_of_birth else None
    if demo.age is not None and from_dob is not None and abs(demo.age - from_dob) >= 1:
        detail = f"Stated age {demo.age:g} conflicts with date of birth (age {from_dob} on {as_of})."
        flags.append(DataQualityFlag(attribute="age", flag="conflicting", detail=detail))
        return AttributeValue(attribute="age", value=None, unit="years", status="conflicting", detail=detail)
    value = demo.age if demo.age is not None else from_dob
    if value is None:
        return AttributeValue(attribute="age", value=None, unit="years", status="missing", detail="Age not provided.")
    return AttributeValue(attribute="age", value=float(value), unit="years", observed_at=as_of, status="ok")


def normalize_patient(
    profile: PatientProfileInput,
    required_attributes: list[str] | None = None,
    stale_days: int = 90,
    today: date | None = None,
) -> NormalizedProfile:
    as_of = profile.as_of or today or date.today()
    flags: list[DataQualityFlag] = []
    attributes: dict[str, AttributeValue] = {"age": _resolve_age(profile, as_of, flags)}

    grouped: dict[str, list[NormalizedObservation]] = defaultdict(list)
    for lab in profile.labs:
        attr = canonical_lab(lab.name)
        if attr is None:
            flags.append(DataQualityFlag(attribute=lab.name, flag="ambiguous", detail=f"Unrecognized lab name '{lab.name}'."))
            continue
        try:
            value, unit = to_canonical(attr, lab.value, lab.unit)
        except UnitConversionError as exc:
            flags.append(DataQualityFlag(attribute=attr, flag="unit_unconvertible", detail=str(exc)))
            attributes.setdefault(
                attr,
                AttributeValue(attribute=attr, value=None, unit=lab.unit, status="ambiguous", detail=str(exc)),
            )
            continue
        grouped[attr].append(
            NormalizedObservation(
                attribute=attr, source_name=lab.name, value=value, unit=unit,
                original_value=lab.value, original_unit=lab.unit, observed_at=lab.observed_at,
            )
        )

    for attr, observations in grouped.items():
        dated = sorted(observations, key=lambda o: o.observed_at or date.min, reverse=True)
        latest = dated[0]
        same_day = [o for o in dated if o.observed_at == latest.observed_at]
        distinct = sorted({o.value for o in same_day})
        if len(distinct) > 1:
            values = ", ".join(f"{v:g}" for v in distinct)
            detail = f"Conflicting {label(attr)} values on {latest.observed_at or 'an undated observation'}: {values}."
            flags.append(DataQualityFlag(attribute=attr, flag="conflicting", detail=detail))
            attributes[attr] = AttributeValue(
                attribute=attr, value=None, unit=latest.unit, observed_at=latest.observed_at,
                status="conflicting", detail=detail, observations=dated,
            )
            continue
        if latest.observed_at is None:
            detail = f"{label(attr)} has no observation date; recency cannot be confirmed."
            flags.append(DataQualityFlag(attribute=attr, flag="ambiguous", detail=detail))
            attributes[attr] = AttributeValue(
                attribute=attr, value=latest.value, unit=latest.unit, status="ambiguous", detail=detail, observations=dated,
            )
            continue
        if is_stale(latest.observed_at, as_of, stale_days):
            detail = f"Most recent {label(attr)} ({latest.observed_at}) is older than {stale_days} days."
            flags.append(DataQualityFlag(attribute=attr, flag="stale", detail=detail))
            attributes[attr] = AttributeValue(
                attribute=attr, value=latest.value, unit=latest.unit, observed_at=latest.observed_at,
                status="stale", detail=detail, observations=dated,
            )
            continue
        attributes[attr] = AttributeValue(
            attribute=attr, value=latest.value, unit=latest.unit, observed_at=latest.observed_at,
            status="ok", observations=dated,
        )

    for attr in required_attributes or []:
        if ":" in attr:
            continue  # condition/event attributes are resolved by the matching agents
        current = attributes.get(attr)
        if current is None:
            attributes[attr] = AttributeValue(
                attribute=attr, value=None, unit=None, status="missing", detail=f"{label(attr)} not provided."
            )
            current = attributes[attr]
        if current.status == "missing" and not any(f.attribute == attr and f.flag == "missing" for f in flags):
            flags.append(DataQualityFlag(attribute=attr, flag="missing", detail=current.detail or f"{label(attr)} missing."))

    return NormalizedProfile(
        as_of=as_of,
        sex=profile.demographics.sex,
        attributes=attributes,
        diagnoses=profile.diagnoses,
        medications=profile.medications,
        history=profile.history,
        data_quality_flags=flags,
    )
