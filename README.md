# Clinical Trial Eligibility & Exclusion Contradiction System

An agentic clinical decision-support prototype. It reads a trial protocol PDF and a structured
patient profile, evaluates inclusion and exclusion criteria with six specialized agents, detects
**Silent Exclusion Triggers**, and cites every decisive finding to the protocol page it came from.

> **Clinical decision support only.** The system supports, and does not replace, review by a
> qualified clinician or trial investigator. Every result carries `human_review_required: true`
> and a human-review notice in both the API and the UI. All bundled data is synthetic.

| | |
|---|---|
| Live API | https://clinical-trial-eligibility-api.onrender.com/docs (Render free plan; first request after idle takes ~1 min) |
| Live UI | https://clinical-trial-eligibility-app.onrender.com (Render static site) |
| Demo login (after seeding) | `demo@example.org` / `demo-password-123` |

---

## What it does

1. **Upload**: a protocol PDF (≤ 20 MB; magic bytes checked) and a patient profile (form or JSON).
2. **Document processing + RAG**: PyMuPDF extracts text per page. Chunks of about 500 characters with 100 overlap keep trial, document, page and section. A sentence-transformers (`all-MiniLM-L6-v2`) FAISS index is persisted per trial.
3. **Agent A, Protocol Extraction**: finds the Inclusion and Exclusion sections and turns each item into a `Criterion` (operator, threshold, unit, page, excerpt). Each excerpt is **verified to appear on its cited page**. If it doesn't, the criterion is flagged for review and its confidence drops.
4. **Agent B, Patient Profile**: normalizes lab names (aliases) and units (validated table only, e.g. creatinine µmol/L ÷ 88.4 → mg/dL). Flags missing, stale (> 90 days), conflicting and ambiguous values. An undocumented diagnosis is never treated as absent.
5. **Agents C ∥ D, Inclusion Matching and Exclusion Detection** (parallel LangGraph branches): deterministic comparators decide SATISFIED / UNSATISFIED / UNKNOWN and TRIGGERED / NOT_TRIGGERED / UNKNOWN.
6. **Agent E, Contradiction**: groups criteria by clinical domain (renal, hepatic, cardiac, …) and raises a Silent Exclusion Trigger when the patient passes some inclusion criteria but a related rule in that domain fails or is unresolved. It also records conflicting rules, inconsistent values and missing data.
7. **Agent F, Reviewer**: drops or downgrades any finding without evidence, then applies the conservative decision table.
8. **Results dashboard**: overall status, criteria tables, trigger cards, missing data, conflicts, and an evidence viewer that shows the page text with the excerpt highlighted.

### Decision rules (enforced in `app/agents/reviewer.py`)

- A proven exclusion always wins over passing inclusion criteria.
- UNKNOWN is never treated as SATISFIED or NOT_TRIGGERED.
- A missing or conflicting decisive value gives `MORE_INFORMATION_REQUIRED`, never `ELIGIBLE`.
- `ELIGIBLE` only when every inclusion is SATISFIED, no exclusion is TRIGGERED, and no material uncertainty remains.
- Ambiguous protocol wording ("severe", "adequate", unstated range inclusivity) is flagged for review and never silently interpreted. A value exactly on a boundary whose inclusivity is unstated evaluates to UNKNOWN.
- A diagnosis is never inferred from a single lab value unless the protocol defines it that way.

### The acceptance scenario

`tests/fixtures/protocol_renal.pdf` (generated, so page numbers are known):
page 2 holds the inclusion criteria and page 3 the exclusion criteria.

| Criterion | Protocol text (page) | Patient (69 y, eGFR 28) | Result |
|---|---|---|---|
| INC-01 | Age 18 to 70 years inclusive (p.2) | 69 | SATISFIED |
| INC-02 | eGFR must not be below 30 mL/min/1.73m2 (p.2) | 28 | UNSATISFIED |
| EXC-01 | Severe renal impairment (p.3), no numeric definition | not documented | UNKNOWN, requires review: *not confirmed by eGFR alone* |

Overall result: **NOT_ELIGIBLE**, with a renal-domain Silent Exclusion Trigger that links INC-01 and EXC-01
to INC-02 and cites pages 2 and 3. With `protocol_renal_defined.pdf` ("…defined as eGFR below 30"),
EXC-01 becomes **TRIGGERED**.

---

## Architecture

```
backend/app/
  main.py, config.py, database.py
  models/            SQLAlchemy tables (UUID PKs, owner_id, created/updated_at)
  schemas/           clinical.py (Criterion, CriterionEvaluation, SilentExclusionTrigger, EligibilityResult, …), api.py
  api/routes/        auth, trials, patients, eligibility, health  (+ api/errors.py structured errors)
  agents/            protocol_extraction, patient_profile, inclusion_matching, exclusion_detection, contradiction, reviewer
  engine/            comparators.py, units.py, dates.py, vocabulary.py, rule_evaluator.py
  rag/               pdf_loader.py, chunker.py, index.py (FAISS / keyword), retriever.py (retrieval validation)
  workflow/          state.py (typed state), graph.py (LangGraph)
  services/          llm.py (provider-agnostic), audit.py, trials.py, analysis.py (background runs)
  security/          jwt.py, deps.py
backend/alembic/     migration 0001 (12 tables)
backend/tests/       58 tests + fixtures/ (synthetic PDFs, 4 synthetic patients)
backend/scripts/     make_synthetic_protocol.py, seed.py
frontend/src/        pages/ (Login, Dashboard, TrialUpload, PatientForm, Analysis, Results), components/, api/client.ts, types.ts
```

**Workflow** (`app/workflow/graph.py`):

```
validate_inputs → extract_protocol → normalize_patient → retrieve_evidence
   → [inclusion_matching ∥ exclusion_detection] → detect_contradictions → review_and_decide → persist → END
```

If the protocol is unreadable, the profile is invalid, or zero criteria are extracted, the run goes to
`handle_error`. That node writes a structured error, and the failed run is still persisted.
Missing patient data does not stop a run; the affected criteria are marked UNKNOWN. Each node's
start, end, status and output summary goes to `agent_execution_logs`, which the status endpoint reads.
Persistence is idempotent by `run_id`: a retry replaces the child rows instead of duplicating them.

**LLM use.** Only Agent A calls the LLM by default; it is also used for semantic (non-numeric)
criteria when configured. Model output must validate against a strict schema. If it doesn't, Agent A falls
back to the rule-based extractor and a semantic check becomes UNKNOWN. A semantic-only judgement can never
make a patient ELIGIBLE on its own: it yields MORE_INFORMATION_REQUIRED. PDF text is passed as untrusted
data, and the model is told never to follow instructions inside it.

**Tech stack.** Python 3.12 (the plan specified 3.11; the pinned NumPy 2.5 requires 3.12), FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, LangGraph, PyMuPDF,
sentence-transformers + faiss-cpu, python-jose, passlib/bcrypt. Frontend: React 18, TypeScript,
Vite, Tailwind, React Router, Axios. All versions are pinned (`backend/requirements.txt`, `frontend/package.json`).

---

## Run locally

### Option A: Docker Compose (Postgres + API + UI)

```bash
cp .env.example .env               # optional; defaults work offline
docker compose up --build
# API  http://localhost:8000/docs     UI  http://localhost:5173
docker compose exec backend python -m scripts.seed --api-url http://localhost:8000 --analyze
```

### Option B: without Docker

```bash
# backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.make_synthetic_protocol          # writes tests/fixtures/*.pdf
uvicorn app.main:app --reload --port 8000           # runs Alembic migrations on startup (SQLite by default)
python -m scripts.seed --api-url http://localhost:8000 --analyze   # demo user + data + the 69/28 run

# frontend (second terminal)
cd frontend
cp .env.example .env                # VITE_API_URL=http://localhost:8000
npm ci && npm run dev               # http://localhost:5173
```

Demo: log in as `demo@example.org` / `demo-password-123`. Under **New assessment**, choose
*SYN-RENAL-001* and *Synthetic patient A - age 69, eGFR 28*, then run it. The results page shows
**NOT ELIGIBLE** and a renal Silent Exclusion Trigger citing pages 2 and 3; click "p. 2" or "p. 3"
to see the highlighted excerpt.

### Migrations

```bash
cd backend
alembic upgrade head                                   # uses DATABASE_URL
alembic revision --autogenerate -m "describe change"   # after editing app/models
```

Set `MIGRATE_ON_STARTUP=false` to manage migrations yourself.

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` | `production` refuses to start without a real `JWT_SECRET` |
| `DATABASE_URL` | `sqlite:///./data/app.db` | `postgres://` and `postgresql://` URLs are accepted (psycopg 3) |
| `DATA_DIR` | `./data` | Uploaded PDFs and per-trial FAISS indexes |
| `JWT_SECRET` | dev placeholder | **Required in production** |
| `JWT_EXPIRE_MINUTES` | `720` | |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS; comma-separated list |
| `LLM_PROVIDER` | `none` | `anthropic` \| `openai` \| `none` (offline, rule-based) |
| `LLM_API_KEY` / `LLM_MODEL` | — | Model defaults: `claude-opus-5-5` / `gpt-4o-mini` |
| `EMBEDDINGS_ENABLED` | `true` | `false` uses the deterministic keyword retriever |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | |
| `MAX_UPLOAD_MB` / `STALE_DAYS` | `20` / `90` | |
| `MIGRATE_ON_STARTUP` | `true` | |
| `VITE_API_URL` (frontend) | `http://localhost:8000` | Baked in at build time |

Secrets come only from the environment; `.env.example` contains placeholders only.

---

## API

All endpoints except `health`, `register` and `login` need `Authorization: Bearer <token>`. Every record
is checked against its owner, and another user's record returns **404** (its existence is not revealed).
Errors always look like `{"error": {"code", "message", "details"}}`. OpenAPI docs are at `/docs`.

| Method | Path | |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | returns `access_token` + user |
| GET | `/api/auth/me` | |
| POST | `/api/trials/upload` | multipart `file` (+ `title`); PDF only, ≤ 20 MB; returns extracted criteria |
| GET | `/api/trials`, `/api/trials/{id}`, `/api/trials/{id}/criteria`, `/api/trials/{id}/pages/{page}` | |
| POST / GET | `/api/patients`, `/api/patients/{id}` | |
| PATCH | `/api/patients/{id}` | creates a **new profile version** |
| POST | `/api/eligibility/analyze` | `{trial_id, patient_id}` → `202 {run_id}`; runs in BackgroundTasks |
| GET | `/api/eligibility/{run_id}/status` | per-node progress |
| GET | `/api/eligibility/{run_id}`, `/evidence`, `/audit` | result, citations, audit trail + agent logs |
| GET | `/api/eligibility` | recent runs |
| GET | `/api/health` | |

Each run is linked to the trial, the protocol version (`v1-<sha256 prefix>`) and the patient profile version.
Uploads, analysis requests and completions, and every read of results or evidence are written to `audit_events`.

---

## Tests

```bash
cd backend && pytest            # 58 tests, fully offline (LLM_PROVIDER=none, keyword retriever)
cd frontend && npm run build    # type-check + production build
```

Coverage includes:
- the mandatory acceptance test (`tests/test_acceptance.py`), including the defined-renal variant;
- outcomes: all-pass → ELIGIBLE, missing eGFR → MORE_INFORMATION_REQUIRED, conflicting eGFR → MORE_INFORMATION_REQUIRED with the conflict listed, and a proven exclusion beating passing inclusions;
- upload errors: non-PDF and unreadable uploads → 400 structured error, plus the size limit;
- extraction: ambiguous criterion → review flag, excerpt not on its cited page → flagged, invalid LLM JSON → rule-based fallback or UNKNOWN (no crash);
- engine: creatinine µmol/L → mg/dL conversion, comparator boundaries (70 inclusive, 30 not below), stale/conflicting/missing flags;
- security and persistence: user B cannot read user A's trial, patient or run (404), API round-trip with idempotent re-persistence, Alembic upgrade/downgrade;
- retrieval: retrieval validation, plus the real FAISS path (skipped when the embedding model can't be loaded offline).

---

## Deploy

**Render (backend + frontend).** Push the repo, then in Render choose *New → Blueprint* and select `render.yaml`. It
creates the Docker web service (`backend/Dockerfile`), the frontend static site (built with `VITE_API_URL` pointing at
the API, with an SPA rewrite) and a Postgres database. `FRONTEND_ORIGIN` already allows the static site; optionally set
`LLM_PROVIDER`/`LLM_API_KEY`. `JWT_SECRET` is generated.
The blueprint uses Render's free plans: 512 MB RAM, no persistent disk, the service sleeps when idle (first request
after a sleep takes about a minute) and free Postgres expires after 30 days. Embeddings are therefore off
(`EMBEDDINGS_ENABLED=false`); the keyword retriever, all agents and page citations work unchanged (peak memory measured at
about 170 MB). For FAISS + MiniLM retrieval use the `standard` plan, set `EMBEDDINGS_ENABLED=true` and add a disk at
`/app/data`. Seed the deployment
with `python -m scripts.seed --api-url https://<render-host> --analyze`.

**Frontend → Vercel (alternative).** Import the repo with root directory `frontend` (framework: Vite) and set
`VITE_API_URL=https://<render-host>`, then add the Vercel URL to `FRONTEND_ORIGIN` in `render.yaml`.
`frontend/vercel.json` provides the SPA rewrite.

---

## Limitations and future work

- **Scope cut for the 3-day build:** no Redis/queue (FastAPI BackgroundTasks; a run is lost if the process
  restarts mid-run, but a retry is idempotent), no roles or refresh tokens, and no ClinicalBERT/BioBERT
  (numeric rules use deterministic comparators instead).
- The evidence viewer shows the page text with the excerpt highlighted; it does not render the PDF.
- The rule-based extractor targets numbered/bulleted criteria with common phrasings ("not below", "at least",
  "≥", ranges, "within N days"). Unusual layouts (tables, multi-column, scanned PDFs) need the LLM path or manual review.
  Scanned PDFs without a text layer are rejected.
- ULN-relative thresholds ("ALT > 3 × ULN") need the patient's reference range and are left for review.
- The condition vocabulary and domain map (`engine/vocabulary.py`) are small, hand-curated tables. A production
  system would map to SNOMED CT / ICD-10 / LOINC.
- One protocol version per trial (uploading again creates a new trial). Patient profiles are versioned.
- Model confidence is never presented as clinical certainty. Final eligibility always requires study-team review.
