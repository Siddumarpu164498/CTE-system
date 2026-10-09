"""Generate synthetic protocol PDFs with known page layout for tests and demos.

  page 1  title and synopsis
  page 2  Inclusion Criteria
  page 3  Exclusion Criteria

Writes tests/fixtures/protocol_renal.pdf and tests/fixtures/protocol_renal_defined.pdf.
All content is synthetic. Run from backend/:  python -m scripts.make_synthetic_protocol
"""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"

TITLE = "SYN-RENAL-001: A Synthetic Phase II Study of Investigational Product XR-17"
SYNOPSIS = [
    "Protocol version 1.0 (synthetic document for software testing only).",
    "",
    "Synopsis",
    "This synthetic protocol describes a randomized, double-blind study of the",
    "investigational product XR-17 in adults with type 2 diabetes mellitus.",
    "XR-17 is cleared by the kidneys, so participant renal function is assessed",
    "at screening. No real patient data is contained in this document.",
    "",
    "Primary objective: change in HbA1c from baseline to week 24.",
]
INCLUSION = [
    "1. Age 18 to 70 years inclusive.",
    "2. Estimated glomerular filtration rate (eGFR) must not be below 30 mL/min/1.73m2.",
]


def exclusion(defined: bool) -> list[str]:
    first = (
        "1. Severe renal impairment, defined as eGFR below 30 mL/min/1.73m2."
        if defined
        else "1. Severe renal impairment."
    )
    return [first, "2. Pregnancy or breastfeeding."]


def _page(c: canvas.Canvas, number: int, heading: str, lines: list[str], heading_size: int = 14) -> None:
    width, height = A4
    y = height - 2.5 * cm
    c.setFont("Helvetica-Bold", heading_size)
    c.drawString(2 * cm, y, heading)
    y -= 1.0 * cm
    c.setFont("Helvetica", 11)
    for line in lines:
        c.drawString(2 * cm, y, line)
        y -= 0.6 * cm
    c.setFont("Helvetica", 8)
    c.drawString(2 * cm, 1.5 * cm, f"SYN-RENAL-001 synthetic protocol - Page {number} of 3")
    c.showPage()


def make_protocol(path: Path, defined: bool) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle(TITLE)
    _page(c, 1, TITLE[:60], [TITLE[60:].strip(), *SYNOPSIS] if len(TITLE) > 60 else SYNOPSIS, heading_size=12)
    _page(c, 2, "Inclusion Criteria", ["Participants must meet all of the following criteria:", "", *INCLUSION])
    _page(c, 3, "Exclusion Criteria", ["Participants meeting any of the following are excluded:", "", *exclusion(defined)])
    c.save()
    return path


def main() -> None:
    for name, defined in (("protocol_renal.pdf", False), ("protocol_renal_defined.pdf", True)):
        print("wrote", make_protocol(FIXTURES / name, defined))


if __name__ == "__main__":
    main()
