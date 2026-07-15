# MemoryOS — Build Plan & Context Pack

Paste this whole file into any new chat (with Antigravity or Claude) before starting a task.
It gives full context so you never have to re-explain the project.

---

## 0. Project Snapshot (paste this into any new chat)

> **MemoryOS** is an AI-powered personal knowledge engine. Users upload PDFs and
> screenshots; the system extracts text (parsing + OCR), chunks and embeds it,
> and lets users retrieve information with natural-language semantic search
> instead of folders/filenames — "Google searches the web, MemoryOS searches
> your own knowledge."
>
> **Locked tech stack:**
> - Frontend: React 18 + Vite + TypeScript + TailwindCSS + React Router + Axios + Zustand
> - Backend: FastAPI (Python 3.11), async, Pydantic v2, SQLAlchemy 2.0 async, Alembic
> - DB: PostgreSQL + **pgvector** extension (single DB for relational + vector data — Qdrant dropped to cut infra complexity)
> - Embeddings: **sentence-transformers (all-MiniLM-L6-v2)**, local, free, no rate limits
> - LLM: **Google Gemini (gemini-1.5-flash)** via `google-generativeai`, async calls only
> - OCR: **Tesseract** (`pytesseract`) — swap to PaddleOCR later only if accuracy is a problem
> - Auth: JWT (`python-jose`) + `passlib` for hashing
> - Background jobs: FastAPI `BackgroundTasks` for MVP (Celery+Redis is a Phase 8 stretch goal, not a blocker)
> - Deployment target: Vercel (frontend), Render (backend), Supabase (Postgres+pgvector+Storage)
>
> Full original feature spec is in `MemoryOS_Project_Bible.md` (attach if needed) —
> this plan is the source of truth for *scope per task*, the Bible is the
> source of truth for *feature vision, architecture, and standing rules*.

---

## 1. How every task will be given to you

Every task in this project will be handed to you in **exactly this 3-part format**:

```
### TASK <phase>.<n>: <short name>

**Requirements to be met**
- Bullet list of what must exist/work when this task is done
- Explicit inputs/outputs, file names, endpoint names
- Explicit "out of scope" items so the task doesn't creep

**Main Prompt (paste into Antigravity)**
> A single, self-contained, copy-pasteable prompt written for a coding agent.
> Includes: what to build, exact file paths, tech constraints from the
> .cursorrules, and what NOT to touch.

**Verification steps**
- Concrete, runnable checks (commands, curl calls, UI clicks) to confirm the
  task is actually done — not just "looks right"
```

You never need to reformat anything — just say "give me task 2.3" and it comes back in this shape.

---

## 2. Phase-wise Task Breakdown

Each phase is a working, demoable slice. Rough order matches dependency, not necessarily calendar time — but the recommended cut for a **tight placement timeline** is: **Phases 0–4 are the MVP** (auth, PDF pipeline, search, basic AI Q&A). Phases 5–7 (screenshots/OCR, recommendations, knowledge graph) are what differentiate the project further if time allows. Phase 8 is deploy/polish and should not be skipped even if it means cutting Phase 6/7.

### Phase 0 — Foundation
- 0.1 Repo scaffold (frontend + backend folders, Docker Compose for local Postgres+pgvector)
- 0.2 DB schema v1 (users, files, chunks, embeddings, tags, search_history) + Alembic migration
- 0.3 `.env` / `.env.example` + config loader + CORS + health-check endpoint + `backend/constants.py` (chunk size/overlap, top_k, similarity threshold, embedding dim, upload limit, JWT expiry, SourceType/FileStatus/LLMModel/GeminiTask enums)

### Phase 1 — Authentication
- 1.1 Register/login/JWT endpoints + password hashing
- 1.2 Frontend auth pages + protected route wrapper + Axios interceptor for JWT

### Phase 2 — PDF Knowledge Engine
- 2.1 PDF upload endpoint (storage + DB record) + background text extraction
- 2.2 Chunking + embedding generation + pgvector storage
- 2.3 Semantic search endpoint over PDF chunks (top-k similarity)
- 2.4 Summarization + topic extraction per PDF (Gemini call)
- 2.5 Q&A-with-citations endpoint (retrieve chunks → Gemini answer → return source+page)

### Phase 3 — Frontend for PDFs
- 3.1 Dashboard shell (stats cards, recent files, search bar)
- 3.2 PDF library page (upload, list, preview, delete)
- 3.3 Search results page (answer + sources + highlighted snippet)

### Phase 4 — Universal Search + AI Assistant (MVP-complete point)
- 4.1 Unified search endpoint (PDFs, ranked, confidence score)
- 4.2 AI Chat page (conversation UI hitting the Q&A endpoint)

### Phase 5 — Screenshot Intelligence
- 5.1 Screenshot upload + Tesseract OCR extraction (background job)
- 5.2 AI tag generation from OCR text (Gemini)
- 5.3 Embed OCR text into same pgvector table (typed by `source_type`)
- 5.4 Extend universal search to include screenshots
- 5.5 Screenshot library UI

### Phase 6 — Smart Recommendations
- 6.1 "Related content" endpoint (vector similarity to a given file)
- 6.2 Recently viewed + frequently searched tracking + UI widgets

### Phase 7 — Knowledge Graph (bonus, cut first if time-constrained)
- 7.1 Graph-data endpoint (nodes: topics/docs/screenshots; edges: similarity above threshold)
- 7.2 D3.js/React-force-graph interactive viewer page

### Phase 8 — Polish & Deploy
- 8.1 Dark/light theme, loading states, empty states, error boundaries
- 8.2 Deploy backend (Render) + frontend (Vercel) + DB (Supabase) + smoke test in prod
- 8.3 README + resume bullet alignment + demo script/video

---

## 3. Worked Examples (first three tasks, fully filled in)

### TASK 0.1: Repo scaffold

**Requirements to be met**
- Monorepo with `frontend/` (Vite React+TS) and `backend/` (FastAPI) folders
- `docker-compose.yml` running Postgres with `pgvector` extension enabled on startup
- Backend has a `/health` endpoint returning `{"status": "ok"}`
- Frontend has a blank page that successfully calls `/health` and shows the result
- Out of scope: auth, any DB models, any AI calls

**Main Prompt (paste into Antigravity)**
> Create a monorepo for a project called MemoryOS with two folders: `frontend/`
> (React 18 + Vite + TypeScript + TailwindCSS, using React Router and Axios)
> and `backend/` (FastAPI, Python 3.11, async, using SQLAlchemy 2.0 async and
> Pydantic v2). Add a `docker-compose.yml` at the root that runs a
> `pgvector/pgvector:pg16` Postgres image on port 5432 with a named volume.
> In the backend, add a single `/health` GET endpoint returning
> `{"status": "ok"}`, wired with CORS allowing `http://localhost:5173`. In the
> frontend, create a single home page that calls `/health` via Axios on mount
> and displays the JSON response. Add `.env.example` files in both folders for
> `DATABASE_URL` and `VITE_API_BASE_URL`. Do not add any authentication, DB
> models, or AI/embedding code yet — this task is scaffolding only. Follow the
> naming conventions and folder structure defined in the project's
> `.cursorrules` file.

**Verification steps**
- `docker compose up -d` starts Postgres with no errors
- `psql` into the container and run `CREATE EXTENSION IF NOT EXISTS vector;` succeeds
- `uvicorn main:app --reload` starts backend; `curl http://localhost:8000/health` returns `{"status":"ok"}`
- `npm run dev` starts frontend; browser shows the health-check JSON on the home page with no CORS errors in console

---

### TASK 0.2: DB schema v1 + migration

**Requirements to be met**
- SQLAlchemy models for: `User`, `File` (pdf/screenshot, shared table via `source_type`, status enum `[uploading, processing, ready, failed]`), `Chunk` (text + `vector(384)` embedding column, FK to File), `Tag`, `FileTag` (many-to-many), `SearchHistory`
- Alembic configured and one migration generated + applied
- Out of scope: any API routes using these models (that's Phase 1/2)

**Main Prompt (paste into Antigravity)**
> In the `backend/` FastAPI project, add SQLAlchemy 2.0 async models in
> `backend/models.py`: `User(id uuid pk, email unique, hashed_password,
> created_at)`, `File(id uuid pk, user_id fk, source_type enum[pdf,screenshot],
> filename, storage_path, status enum[uploading,processing,ready,failed], summary text
> nullable, created_at)`, `Chunk(id uuid pk, file_id fk, content text, page_number
> int nullable, embedding vector(384), created_at)` — use the `pgvector`
> SQLAlchemy type for the embedding column, `Tag(id uuid pk, name unique)`,
> `FileTag(file_id fk, tag_id fk)`, `SearchHistory(id uuid pk, user_id fk, query
> text, created_at)`. Set up Alembic for async migrations pointed at
> `DATABASE_URL` from `.env`, generate the initial migration, and apply it.
> Every model needs type hints and a docstring per the `.cursorrules` code
> style rules. Do not create any API routes in this task.

**Verification steps**
- `alembic upgrade head` runs cleanly against the docker-compose Postgres
- `\dt` in psql shows all 6 tables; `\d chunk` shows the `embedding` column as `vector(384)`
- `alembic downgrade -1` then `upgrade head` again works without errors (migration is reversible)

---

### TASK 1.1: Auth endpoints

**Requirements to be met**
- `POST /auth/register` (email + password → hashed, user created, JWT returned)
- `POST /auth/login` (email + password → JWT returned)
- `GET /auth/me` (JWT required → current user info)
- Passwords hashed with `passlib[bcrypt]`, JWT via `python-jose`, secret from `.env`
- Out of scope: password reset, frontend pages

**Main Prompt (paste into Antigravity)**
> In `backend/auth/`, implement JWT authentication for the `User` model
> already defined in `backend/models.py`. Add `POST /auth/register` (validates
> email uniqueness, hashes password with passlib bcrypt, creates user, returns
> an access token), `POST /auth/login` (verifies credentials, returns access
> token), and `GET /auth/me` (protected by a FastAPI dependency that decodes
> the JWT and loads the current user). Use `python-jose` for JWT encode/decode,
> read `JWT_SECRET` and `JWT_EXPIRE_MINUTES` from `.env` via `load_dotenv()`.
> All request/response bodies must be Pydantic v2 schemas in
> `backend/schemas/auth.py`. Add specific exception handling (e.g. raise
> `HTTPException(401)` for bad credentials, `HTTPException(409)` for duplicate
> email) — no bare `except:`. Do not build any frontend pages in this task.

**Verification steps**
- `curl -X POST /auth/register` with a new email returns 200 + token
- Repeating the same register call returns 409
- `curl -X POST /auth/login` with correct/incorrect password returns 200/401 respectively
- `curl /auth/me` with the returned token in `Authorization: Bearer <token>` returns the user; with no header returns 401

---

## 4. Template you paste for every future task (blank)

```
### TASK <phase>.<n>: <name>

**Requirements to be met**
-
-

**Main Prompt (paste into Antigravity)**
>

**Verification steps**
-
-
```

Just tell me the task number/name and I'll fill this in fully each time.
