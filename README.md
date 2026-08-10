# MemoryOS - Personal Knowledge Engine

MemoryOS is a premium **Personal Knowledge Engine** that acts as your digital mind. It allows you to upload document libraries (PDFs and images/screenshots), semantically search across them using vector embeddings, chat with your knowledge base using grounded Retrieval-Augmented Generation (RAG) with inline citations, and visualize your files in an interactive similarity-based knowledge graph.

---

## 🚀 Key Features

- **Document Ingestion & OCR**: Supports raw PDF uploads and image uploads (screenshots, JPG, PNG). Includes automatic text-extraction, smart sentence-boundary chunking, and a robust OCR fallback (using Tesseract + Pillow preprocessing) for scanned PDFs and image screenshots.
- **Grounded Conversational Q&A**: A chat interface that reformulates query histories and uses Google Gemini Flash (with automatic failover to Groq Llama 3.3) to output accurate markdown responses grounded with clickable source citations.
- **Dynamic Knowledge Graph**: Multi-document relationship maps rendered with interactive SVG and D3 force-directed simulations based on document centroid similarities.
- **Full-featured Search**: Custom semantic search queries with tunable thresholds and instant response capabilities.
- **Premium Dark UI**: A responsive dashboard, PDF/Image grid libraries, conversation management, settings configuration panels, and browser autocompletion support.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v3, D3.js (for the knowledge graph), Lucide Icons, and React Router.
- **Backend**: Python 3.10+, FastAPI (Asynchronous Web Framework), SQLAlchemy 2.0 (Async ORM), Alembic (Database migrations).
- **Database & Storage**: PostgreSQL + `pgvector` for embedding store, Supabase Storage for raw file hosting.
- **Models**:
  - Embedding Generator: `all-MiniLM-L6-v2` (384-dimensions)
  - Reranker: `ms-marco-MiniLM-L-6-v2`
  - Language Models: Google Gemini Flash (primary) & Groq Llama-3.3-70b-versatile (fallback)

---

## 📋 Prerequisites

To run MemoryOS locally, ensure you have:
1. **Python 3.10+** and **Node.js 18+** installed.
2. **PostgreSQL** with the `pgvector` extension enabled. (Alternatively, a Supabase database instance).
3. **Tesseract OCR** installed on your system:
   - **macOS**: `brew install tesseract`
   - **Ubuntu/Linux**: `sudo apt-get install tesseract-ocr`
   - **Windows**: Install via binary installer and add it to your system PATH.

---

## ⚙️ Setup & Installation

### 1. Database & Storage Setup
1. Create a PostgreSQL database and run `CREATE EXTENSION IF NOT EXISTS vector;`
2. Create a private bucket named `memoryos-files` inside your Supabase Storage dashboard.

---

### 2. Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file based on `.env.example`:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/memoryos
   SUPABASE_STORAGE_URL=https://your-project.supabase.co
   SUPABASE_STORAGE_KEY=your-supabase-service-role-key
   GEMINI_API_KEY=your-google-gemini-api-key
   GROQ_API_KEY=your-groq-api-key
   JWT_SECRET=your-secret-key-for-jwt-signing
   ```
5. Apply database migrations:
   ```bash
   alembic upgrade head
   ```
6. Start the FastAPI development server:
   ```bash
   python -m uvicorn main:app --reload
   ```
   The backend will be available at `http://localhost:8000`.

---

### 3. Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```env
   VITE_API_URL=http://localhost:8000/api/v1
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser to access the app.

---

## 📂 Project Structure

```
MemoryOS/
├── backend/
│   ├── auth/              # JWT and OAuth helper modules
│   ├── db/                # Session and connection pooling
│   ├── routes/            # FastAPI API routers (auth, search, chat, etc.)
│   ├── services/          # Business logic (LLM, OCR, PDF chunking, Reranking)
│   ├── models.py          # SQLAlchemy declarations
│   ├── main.py            # FastAPI application entrypoint
│   └── alembic/           # Alembic migration scripts
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable components (AppShell, FileUploader, Graph)
│   │   ├── pages/         # View layers (Dashboard, Chat, KnowledgeGraph, Settings)
│   │   ├── services/      # Axios API configuration
│   │   └── store/         # State management stores
│   ├── tailwind.config.js # Custom dark-theme Tailwind configuration
│   └── index.html
├── README.md              # Project setup and overview guide
└── TECHNICAL_DETAILS.md   # Architectural design and database schemas
```

---

## 📖 For Detailed Architecture

For a deep dive into the RAG pipeline, the semantic chunker rules, OCR image preprocessing steps, and database schemas, check out [TECHNICAL_DETAILS.md](TECHNICAL_DETAILS.md).
