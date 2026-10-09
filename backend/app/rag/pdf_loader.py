"""PDF text extraction with PyMuPDF, one entry per page (1-based page numbers)."""

from dataclasses import dataclass
from pathlib import Path

import pymupdf as fitz

PDF_MAGIC = b"%PDF-"


class PDFReadError(ValueError):
    pass


@dataclass(frozen=True)
class PageText:
    page: int
    text: str

    def to_dict(self) -> dict:
        return {"page": self.page, "text": self.text}


def is_pdf_bytes(data: bytes) -> bool:
    # The header must appear within the first 1024 bytes per the PDF spec.
    return PDF_MAGIC in data[:1024]


def load_pdf_bytes(data: bytes) -> list[PageText]:
    if not is_pdf_bytes(data):
        raise PDFReadError("file is not a PDF (missing %PDF header)")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises several exception types for corrupt files
        raise PDFReadError(f"unreadable PDF: {exc}") from exc
    try:
        if doc.needs_pass:
            raise PDFReadError("encrypted PDFs are not supported")
        pages = [PageText(page=i + 1, text=page.get_text("text")) for i, page in enumerate(doc)]
    except PDFReadError:
        raise
    except Exception as exc:
        raise PDFReadError(f"unreadable PDF: {exc}") from exc
    finally:
        doc.close()
    if not pages:
        raise PDFReadError("PDF has no pages")
    if not any(p.text.strip() for p in pages):
        raise PDFReadError("PDF contains no extractable text (scanned documents are not supported)")
    return pages


def load_pdf(path: str | Path) -> list[PageText]:
    return load_pdf_bytes(Path(path).read_bytes())


def pages_from_dicts(items: list[dict]) -> list[PageText]:
    return [PageText(page=int(p["page"]), text=str(p["text"])) for p in items]
