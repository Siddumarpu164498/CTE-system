"""Date helpers for age calculation, staleness and time-window rules."""

from datetime import date, datetime


def parse_date(value: str | date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in ("%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognized date: {value!r}")


def age_on(date_of_birth: date, on: date) -> int:
    years = on.year - date_of_birth.year
    if (on.month, on.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years


def days_between(earlier: date, later: date) -> int:
    return (later - earlier).days


def is_stale(observed_at: date | None, as_of: date, max_age_days: int) -> bool:
    if observed_at is None:
        return False
    return days_between(observed_at, as_of) > max_age_days


def within_days(event: date | None, as_of: date, days: int) -> bool | None:
    """True if the event happened within `days` before as_of; None if the date is unknown."""
    if event is None:
        return None
    delta = days_between(event, as_of)
    return 0 <= delta <= days
