"""Per-trial retrieval index: FAISS over sentence-transformer embeddings, persisted to disk.

With EMBEDDINGS_ENABLED=false (tests, low-memory hosts) a deterministic keyword index is
used instead; it exposes the same search interface.
"""

import json
import logging
import math
import re
import threading
from collections import Counter
from functools import lru_cache
from pathlib import Path

from app.rag.chunker import Chunk

log = logging.getLogger(__name__)

_TOKEN = re.compile(r"[a-z0-9]+(?:\.[0-9]+)?")
# Serializes model loading and index builds (upload background task vs. analysis run).
_BUILD_LOCK = threading.RLock()


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


@lru_cache(maxsize=2)
def get_embedder(model_name: str):
    """Load the embedding model once per process."""
    from sentence_transformers import SentenceTransformer

    with _BUILD_LOCK:
        log.info("loading embedding model %s", model_name)
        return SentenceTransformer(model_name)


class KeywordIndex:
    kind = "keyword"

    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self._tokens = [Counter(tokenize(c.text)) for c in chunks]
        df: Counter = Counter()
        for toks in self._tokens:
            df.update(toks.keys())
        n = max(1, len(chunks))
        self._idf = {t: math.log(1 + n / c) for t, c in df.items()}

    def search(self, query: str, k: int = 3) -> list[tuple[Chunk, float]]:
        q = set(tokenize(query))
        scored = []
        for chunk, toks in zip(self.chunks, self._tokens):
            score = sum(self._idf.get(t, 0.0) for t in q if t in toks)
            if score > 0:
                scored.append((chunk, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]


class FaissIndex:
    kind = "faiss"

    def __init__(self, chunks: list[Chunk], index, model_name: str):
        self.chunks = chunks
        self.index = index
        self.model_name = model_name

    @classmethod
    def build(cls, chunks: list[Chunk], model_name: str) -> "FaissIndex":
        import faiss
        import numpy as np

        model = get_embedder(model_name)
        vectors = model.encode([c.text for c in chunks], normalize_embeddings=True, show_progress_bar=False)
        vectors = np.asarray(vectors, dtype="float32")
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)
        return cls(chunks, index, model_name)

    def search(self, query: str, k: int = 3) -> list[tuple[Chunk, float]]:
        import numpy as np

        model = get_embedder(self.model_name)
        q = np.asarray(model.encode([query], normalize_embeddings=True, show_progress_bar=False), dtype="float32")
        scores, ids = self.index.search(q, min(k, len(self.chunks)))
        return [(self.chunks[i], float(s)) for s, i in zip(scores[0], ids[0]) if i >= 0]

    def save(self, directory: Path) -> None:
        import faiss

        directory.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(directory / "index.faiss"))
        (directory / "meta.json").write_text(json.dumps({"model": self.model_name}))

    @classmethod
    def load(cls, directory: Path, chunks: list[Chunk]) -> "FaissIndex":
        import faiss

        meta = json.loads((directory / "meta.json").read_text())
        return cls(chunks, faiss.read_index(str(directory / "index.faiss")), meta["model"])


def _save_chunks(directory: Path, chunks: list[Chunk]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "chunks.json").write_text(json.dumps([c.to_dict() for c in chunks]))


def _load_chunks(directory: Path) -> list[Chunk] | None:
    path = directory / "chunks.json"
    if not path.exists():
        return None
    return [Chunk(**c) for c in json.loads(path.read_text())]


def build_index(chunks: list[Chunk], directory: Path, embeddings_enabled: bool, model_name: str):
    """Build and persist the index for one protocol document."""
    with _BUILD_LOCK:
        existing = load_index(directory, embeddings_enabled, model_name)
        if existing is not None and (existing.kind == "faiss" or not embeddings_enabled):
            return existing
        return _build(chunks, directory, embeddings_enabled, model_name)


def _build(chunks: list[Chunk], directory: Path, embeddings_enabled: bool, model_name: str):
    _save_chunks(directory, chunks)
    if embeddings_enabled and chunks:
        try:
            idx = FaissIndex.build(chunks, model_name)
            idx.save(directory)
            return idx
        except Exception as exc:  # model download or native library failure
            log.warning("FAISS index build failed, using keyword index: %s", exc)
    return KeywordIndex(chunks)


def load_index(directory: Path, embeddings_enabled: bool, model_name: str):
    """Load a persisted index; returns None if nothing has been built yet."""
    chunks = _load_chunks(directory)
    if chunks is None:
        return None
    if embeddings_enabled and (directory / "index.faiss").exists():
        try:
            return FaissIndex.load(directory, chunks)
        except Exception as exc:
            log.warning("FAISS index load failed, using keyword index: %s", exc)
    return KeywordIndex(chunks)
