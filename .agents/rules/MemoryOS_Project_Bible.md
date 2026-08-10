# MEMORYOS — PROJECT BIBLE
# ============================================================
# VERSION: 1.0
# PURPOSE: Paste this entire document into a fresh Claude chat
# before asking for ANYTHING. This gives Claude full context
# to generate prompts consistent with the entire system.
# ============================================================

---

## SECTION 1 — WHAT WE ARE BUILDING

MemoryOS is an AI-powered personal knowledge engine. Users upload
PDFs and screenshots; the system extracts text (parsing + OCR),
chunks and embeds it, and lets users retrieve information with
natural-language semantic search instead of folders/filenames.

"Google searches the web, MemoryOS searches your own knowledge."

This is a personal RAG (retrieval-augmented generation) system —
upload, index, ask questions, get grounded answers with citations
back to the source file and page.

---

## SECTION 2 — THE FIVE CORE SERVICES

Every service is a Python module in `backend/services/`. Services
never call each other's internals directly — they pass data through
Pydantic schemas and the shared DB session, coordinated by the
routes layer and the background-task processing pipeline (Section 3).

### Service 1: PdfService
- File: `backend/services/pdf_service.py`
- Purpose: Extracts text and page structure from uploaded PDFs
- Input: `File` record (storage_path, source_type=pdf)
- Actions: Parse PDF via `pdfplumber` (preferred for layout/page
  numbers) or `pypdf`, extract text per page, preserve `page_number`
  for citation later
- Output: Raw per-page text handed to the chunking step
- Library: pdfplumber / pypdf

### Service 2: OcrService
- File: `backend/services/ocr_service.py`
- Purpose: Extracts text from screenshot images
- Input: `File` record (storage_path, source_type=screenshot)
- Actions: Preprocess image with Pillow, run Tesseract via
  `pytesseract`
- Output: Extracted OCR text handed to the chunking step
- Library: pytesseract (Tesseract binary) + Pillow

### Service 3: EmbeddingService
- File: `backend/services/embedding_service.py`
- Purpose: Generates vector embeddings for text chunks
- Input: Chunk text (from either PdfService or OcrService output)
- Actions: Run `sentence-transformers all-MiniLM-L6-v2` locally,
  batch-encode chunks
- Output: 384-dim vectors written to `chunks.embedding` (pgvector)
- Model: sentence-transformers all-MiniLM-L6-v2 — local, free, no
  rate limits. **Never use Gemini embeddings.**

### Service 4: LlmService
- File: `backend/services/llm_service.py`
- Purpose: Async Gemini wrapper for summarization, Q&A, topic
  extraction, and tag generation
- Input: Prompt + context (for Q&A: **retrieved chunks only**, never
  free generation)
- Actions: `await model.generate_content_async(prompt)` — sync calls
  are forbidden inside FastAPI async routes
- Output: Summary text / grounded answer / topic list / tag list
- Model: Google Gemini `gemini-1.5-flash` via `google-generativeai`

### Service 5: VectorSearchService
- File: `backend/services/vector_search_service.py`
- Purpose: Runs top-k similarity search over pgvector
- Input: Query embedding, `user_id`, `top_k`, optional `source_type`
  filter
- Actions: pgvector cosine similarity query via SQLAlchemy async
  session, filtered and thresholded
- Output: Ranked list of chunks with file references (filename,
  page_number, snippet)
- **CRITICAL RULE**: every query MUST filter by `user_id` — zero
  exceptions, this is the multi-tenant isolation boundary

---

## SECTION 3 — THE PROCESSING PIPELINE

- Files: `backend/routes/files.py` (trigger) + services above (work)
- Built with: FastAPI `BackgroundTasks` for MVP (Celery + Redis is a
  Phase 8 stretch goal, not a blocker)
- Entry point: `async def process_file(file_id: UUID) -> None`

### File Status Field
```
status: uploading -> processing -> ready -> failed
```

### Flow
```
upload_endpoint (create File row, status=uploading)
  → background_task: process_file(file_id)
      → status=processing
      → [pdf] PdfService.extract_text()  OR  [screenshot] OcrService.extract_text()
      → chunk text (chunk_size / overlap from constants.py)
      → EmbeddingService.embed(chunks) → store Chunk rows (pgvector)
      → [optional] LlmService.summarize() + LlmService.extract_topics()
      → [screenshot only] LlmService.generate_tags()
      → status=ready
  → [any step raises] status=failed, error message persisted — never
    left stuck in "processing" silently
```

### Stopping Conditions
- Extraction failure (corrupt PDF, OCR error) → `status=failed` with
  a stored error message
- Successful embed + (optional) summarize → `status=ready`

---

## SECTION 4 — SHARED VECTOR STORE (pgvector)

- File: `backend/db/session.py` + `backend/models.py` (`Chunk` model)
- Technology: PostgreSQL + **pgvector** extension — one database for
  relational and vector data (Qdrant dropped to cut infra complexity)
- Embeddings: sentence-transformers all-MiniLM-L6-v2, local, 384-dim

### Chunk Table (from constants)
```
id            uuid pk
file_id       fk -> files.id
content       text
page_number   int nullable   # set for pdf, null for screenshot
embedding     vector(384)
created_at    timestamptz
```

### CRITICAL RULE
Every single vector query MUST include:
```python
.where(File.user_id == user_id)   # joined through Chunk.file_id
```
No exceptions. Client data must never leak across users.

### Key Methods (VectorSearchService)
```
store_chunk(file_id, content, page_number, embedding)
similarity_search(user_id, query_embedding, top_k, source_type=None)
get_chunks_by_file(file_id)
```

---

## SECTION 5 — CONTENT SOURCE TYPES

- File: `backend/models.py` (`File.source_type` enum) + services above
- The `File` table is shared across both content types, distinguished
  by `source_type`

### Source Types
```
pdf         - parsed via PdfService (pdfplumber/pypdf), page-mapped chunks
screenshot  - parsed via OcrService (pytesseract), auto-tagged via LlmService
```

### Per-Type Processing Profile
```json
{
  "source_type": "pdf",
  "extraction_service": "pdf_service",
  "chunking": "page-aware, chunk_size/overlap from constants.py",
  "post_processing": ["summarization", "topic_extraction", "qa_citations"]
}
```
```json
{
  "source_type": "screenshot",
  "extraction_service": "ocr_service",
  "chunking": "flat, no page_number",
  "post_processing": ["tag_generation"]
}
```

### Source Type to Feature Mapping
```
PDF        → summarization, topic extraction, Q&A with citations (file + page)
SCREENSHOT → AI tag generation, OCR text embedding into same chunks table
```

---

## SECTION 6 — COMPLETE TECH STACK

### Backend
```
Language:      Python 3.11
Framework:     FastAPI (async)
Background:    FastAPI BackgroundTasks (MVP) — Celery+Redis Phase 8 stretch
Database:      PostgreSQL + pgvector (via Supabase)
ORM:           SQLAlchemy 2.0 async + Alembic migrations
HTTP Client:   httpx (async)
Validation:    Pydantic v2
Auth:          JWT via python-jose + passlib[bcrypt]
```

### LLM, OCR & Parsing
```
LLM:           Google Gemini — gemini-1.5-flash (google-generativeai SDK, async only)
Embeddings:    sentence-transformers all-MiniLM-L6-v2 (local, free)
OCR:           pytesseract (Tesseract binary) + Pillow
PDF parsing:   pdfplumber (preferred) or pypdf
```

### Vector & Storage
```
Vector store:  PostgreSQL + pgvector extension (single DB, no separate vector DB)
File storage:  Supabase Storage
```

### Frontend
```
Framework:   React 18 + Vite
Language:    TypeScript
Styling:     TailwindCSS
State:       Zustand
Routing:     React Router v6
HTTP:        Axios
Graph (Phase 7): D3.js / react-force-graph
```

### Infrastructure
```
Backend host:   Render
Frontend host:  Vercel
PostgreSQL:     Supabase (Postgres + pgvector + Storage)
Secrets:        .env via python-dotenv (never committed)
```

---

## SECTION 7 — FOLDER STRUCTURE

```
memoryos-core/
├── backend/
│   ├── main.py                       # FastAPI app entry point
│   ├── config.py                     # env loading, settings object
│   ├── models.py                     # SQLAlchemy models
│   ├── constants.py                  # chunk size, top_k, thresholds, enums
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── files.py
│   │   └── search.py
│   ├── routes/
│   │   ├── auth.py
│   │   ├── files.py                  # upload/list/delete for pdf + screenshot
│   │   ├── search.py                 # universal search + Q&A
│   │   └── recommendations.py
│   ├── services/
│   │   ├── pdf_service.py            # text extraction, page mapping
│   │   ├── ocr_service.py            # tesseract wrapper
│   │   ├── embedding_service.py      # sentence-transformers wrapper
│   │   ├── llm_service.py            # gemini async wrapper (summarize/qa/tags)
│   │   └── vector_search_service.py  # pgvector similarity queries
│   ├── auth/
│   │   ├── jwt_handler.py
│   │   └── dependencies.py           # get_current_user
│   ├── db/
│   │   └── session.py                # async engine/session factory
│   └── alembic/                      # migrations
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       │   ├── Landing.tsx
│       │   ├── Login.tsx
│       │   ├── Register.tsx
│       │   ├── Dashboard.tsx
│       │   ├── PdfLibrary.tsx
│       │   ├── ScreenshotLibrary.tsx
│       │   ├── UniversalSearch.tsx
│       │   ├── AiChat.tsx
│       │   ├── KnowledgeGraph.tsx
│       │   ├── Profile.tsx
│       │   └── Settings.tsx
│       ├── store/                    # Zustand stores
│       ├── hooks/
│       └── services/                 # axios instance + API calls
├── .env
├── .env.example
├── .gitignore                        # must include .env
├── docker-compose.yml                # local Postgres+pgvector
├── requirements.txt
└── README.md
```

---

## SECTION 8 — CONSTANTS (PROPOSED VALUES)

> Note: unlike Sentinel, MemoryOS's source docs establish that these
> live in `constants.py` (Task 0.3 / code-style rule #14) but don't
> pin exact numbers yet. These are sensible MVP defaults — confirm
> or adjust them when Task 0.3 is actually built, then treat this
> block as the source of truth going forward.

```python
EMBEDDING_DIM           = 384
EMBEDDING_MODEL         = "all-MiniLM-L6-v2"
CHUNK_SIZE              = 500          # chars/tokens per chunk — tune in Task 2.2
CHUNK_OVERLAP           = 50
TOP_K_RETRIEVAL         = 5
SIMILARITY_THRESHOLD    = 0.7
MAX_UPLOAD_MB           = 20
JWT_EXPIRE_MINUTES      = 60

class SourceType:
    PDF = "pdf" | SCREENSHOT = "screenshot"

class FileStatus:
    UPLOADING = "uploading" | PROCESSING = "processing"
    READY = "ready" | FAILED = "failed"

class LLMModel:
    GEMINI_FLASH = "gemini-1.5-flash"

class GeminiTask:
    SUMMARIZE = "summarize" | QA = "qa"
    TOPIC_EXTRACT = "topic_extraction" | TAG_GENERATE = "tag_generation"
```

---

## SECTION 9 — DATABASE SCHEMA

### Tables
```
users            — id, email, hashed_password, created_at
files            — id, user_id(FK), source_type[pdf|screenshot],
                    filename, storage_path, status, summary(nullable), created_at
chunks           — id, file_id(FK), content, page_number(nullable),
                    embedding vector(384), created_at
tags             — id, name(unique)
file_tags        — file_id(FK), tag_id(FK)     # many-to-many
search_history   — id, user_id(FK), query, created_at
```

---

## SECTION 10 — PROCESSING STATUS SYSTEM

MemoryOS uses status-field polling rather than a live event stream
(no WebSocket layer is currently in scope — that's a candidate for
a future phase, unlike Sentinel's real-time war-room dashboard).

- Frontend polls `GET /files/{id}` (or a list endpoint) and reads
  `status` to drive progress UI
- Backend never leaves a file silently stuck in `processing` — a
  failed OCR/embedding job must set `status=failed` with an error
  message

### Status Values
```
uploading  → file received, DB record created
processing → background_task running (extract → chunk → embed → [summarize])
ready      → chunks + embeddings stored, searchable
failed     → error stored on the File record, surfaced to the user
```

---

## SECTION 11 — NAMING CONVENTIONS

NEVER deviate from these. Ever.

```
Classes:              PascalCase              User, FileRecord, ChunkSchema
Pydantic schemas:     PascalCase + Schema     UserCreateSchema, SearchResultSchema
Functions:            snake_case              extract_text, generate_embedding
Async functions:      snake_case              async def run_ocr
Variables:            snake_case              file_id, user_id, chunk_text
Constants:            UPPER_SNAKE_CASE        MAX_UPLOAD_MB, EMBEDDING_DIM
Env variables:        UPPER_SNAKE_CASE        DATABASE_URL, GEMINI_API_KEY, JWT_SECRET
Python files:         snake_case.py           pdf_service.py, ocr_service.py
React components:     PascalCase.tsx          Dashboard.tsx, PdfLibrary.tsx
Zustand stores:       camelCase + Store.ts    authStore.ts, searchStore.ts
React hooks:          use + PascalCase.ts     useAuth.ts, useSearch.ts
DB tables:            snake_case, plural      users, files, chunks, tags, file_tags, search_history
```

---

## SECTION 12 — CODE RULES

Every single file generated must follow these:

```
1.  Every function/class has a docstring
2.  Every function parameter has a type hint
3.  Every function has a return type hint
4.  Use Pydantic v2 models for ALL request/response bodies — never raw dicts
5.  Use async/await for ALL I/O (DB, HTTP, Gemini calls, file storage)
6.  Never hardcode a value that belongs in constants.py or .env — always import/read it
7.  Never hardcode the Gemini key — always read from env via get_settings()/config
8.  Every DB-touching function goes through SQLAlchemy async session, never raw psycopg calls
9.  Every vector search query MUST filter by user_id — no cross-user data leakage, no exceptions
10. All error handling uses try/except with specific exception types, never bare except
11. Use the Python logging module everywhere — never print()
12. Call load_dotenv() once at app startup (backend/config.py), not scattered across files
13. Imports order: stdlib → third-party → local
14. All magic numbers (chunk size, top-k, similarity threshold) live in constants.py
```

---

## SECTION 13 — SECURITY RULES (NON-NEGOTIABLE)

```
1. JWT required on every route except /auth/register, /auth/login, /health
2. Passwords never stored or logged in plaintext
3. .env file never committed to GitHub under any circumstances
4. Uploaded file size/type validated server-side before storage (not just frontend)
5. API keys never pasted into chat, Discord, WhatsApp, or committed to a public repo
6. G-OS / Genessence Solutions internal work is a separate, confidential project
   and must never be referenced, copied, or mixed into MemoryOS code, commits,
   or documentation
```

---

## SECTION 14 — BASE SERVICE PATTERN

MemoryOS doesn't use a class-inheritance agent model like Sentinel's
`BaseAgent` — services are async functions in dedicated modules. Every
service module should still follow one consistent pattern, derived
from the code-style rules in Section 12:

```python
# backend/services/<name>_service.py
import logging
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

async def <primary_action>(...) -> <TypedResult>:
    """Docstring is required on every service function."""
    try:
        ...
    except SpecificException as exc:
        logger.error("...", exc_info=exc)
        raise

# Every service module follows:
# - logging.getLogger(__name__) — never print()
# - get_settings() from config.py for secrets/env — never scattered os.getenv()
# - SQLAlchemy async session injected via dependency, never module-level connections
# - try/except with specific exception types around external calls
#   (Gemini API, Tesseract, PDF parsing)
```

---

## SECTION 15 — CURRENT BUILD STATUS

Phases 0–4 are the MVP (auth, PDF pipeline, search, basic AI Q&A).
Phases 5–7 (screenshots/OCR, recommendations, knowledge graph) are
differentiators if time allows. Phase 8 (deploy/polish) should not
be skipped even if it means cutting Phase 6/7.

```
Phase 0: Foundation (repo scaffold, DB schema, Alembic, health-check)
Phase 1: Authentication (JWT endpoints + frontend auth pages)
Phase 2: PDF Knowledge Engine (upload, extract, chunk, embed, search, Q&A)
Phase 3: Frontend for PDFs (dashboard, library, search results UI)
Phase 4: Universal Search + AI Assistant  ← MVP-complete point
Phase 5: Screenshot Intelligence (OCR, tags, embed, search, UI)
Phase 6: Smart Recommendations (related content, recently viewed)
Phase 7: Knowledge Graph (bonus, cut first if time-constrained)
Phase 8: Polish & Deploy (theming, Render+Vercel+Supabase, README/demo)
```

---

## HOW TO USE THIS BIBLE

You are the project guide for MemoryOS.
The full architecture, stack, and conventions are above.

When I ask you for a coding-agent prompt, generate it in
this exact three-part format:

---
PART 1 — PRE-CHECK
List everything that must be verified before running
this prompt. Include exact terminal commands to verify.

PART 2 — AGENT PROMPT
The complete, detailed prompt to paste into Antigravity
(or Cursor Composer).
Must include:
- Exact file paths for all generated files
- Explicit imports from constants.py
- Type hints on everything
- Docstrings on every class and function
- Specific method signatures
- Error handling requirements
- Logging requirements
- Explicit "out of scope" items so the task doesn't creep
Detailed enough that the agent generates 100% complete
working code with zero guesswork or missing pieces.

PART 3 — VALIDATION
Exact commands to run after the agent generates the code.
Must confirm the code works before moving to the next task.
---

My task is: [TASK NUMBER OR NAME GOES HERE]
