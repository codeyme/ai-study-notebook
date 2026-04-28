# DocLens Upgrade — Change Guide

Complete record of every bug fix, modified file, new file, and deployment step
to transform the NotebookLM clone into the DocLens Intelligence Studio.

---

## 🐛 Bugs in the Original Repo

### 1. `podcast.py` — Missing file-existence check on download
**File:** `notebook-lm/backend/app/api/routes/podcast.py`

The `/api/podcast/download/{document_id}` endpoint calls `FileResponse(audio_path, ...)`
without checking if the file exists first. This raises an unhandled 500 instead of a 404.

**Fix:**
```python
if not os.path.exists(audio_path):
    raise HTTPException(status_code=404, detail="Podcast not found. Generate it first.")
```

---

### 2. `main.py` — CORS wildcard breaks credentialed requests in production
**File:** `notebook-lm/backend/app/main.py`

`allow_origins=["*"]` is incompatible with `allow_credentials=True` on most browsers
in production and will cause pre-flight failures.

**Fix:** Read allowed origins from an environment variable:
```python
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, ...)
```

---

### 3. `start_backend.sh` — `--reload` flag breaks on Render / production
**File:** `notebook-lm/start_backend.sh`

The script passes `--reload` to uvicorn unconditionally.
Render's start command should not use `--reload` (hot-reload watches the filesystem
which is unavailable on ephemeral containers and wastes memory).

**Fix:** The `render.yaml` start command deliberately omits `--reload`.

---

### 4. No `/api/documents/list` endpoint
The frontend has no way to discover which documents are uploaded — it relies on
in-memory state that resets on page refresh. The new analysis features need a
persistent list of available documents.

**Fix:** Add the endpoint (see `main_patch.py`).

---

### 5. `rag_service.py` — No public accessor for stored chunks
The new analysis routes need to read all chunks for one or more documents, but
`RAGService` has no method for this.

**Fix:** Add `get_chunks_for_document(document_id)` (see `rag_service_patch.py`).

---

## 📂 Files to Modify

### `notebook-lm/backend/app/main.py`
1. Replace `allow_origins=["*"]` with env-var-driven list (see `main_patch.py`).
2. Add after existing router includes:
   ```python
   from app.api.routes.analysis import router as analysis_router
   app.include_router(analysis_router)
   ```
3. Add the `/api/documents/list` GET endpoint (code in `main_patch.py`).

---

### `notebook-lm/backend/app/services/rag_service.py`
Add the `get_chunks_for_document` method from `rag_service_patch.py` inside
the `RAGService` class.

> The exact internal structure of the metadata dict may differ slightly
> depending on how the original code stores it. Adjust the key names
> (`"text"`, `"metadata"`) to match what the existing `_save_vector_store`
> method writes.

---

### `notebook-lm/backend/app/api/routes/podcast.py`
Apply the file-existence guard fix described in Bug #1.

---

### `notebook-lm/frontend/src/App.tsx`
**Replace entirely** with the new `App.tsx` provided.
The podcast panel is removed; `AnalysisPanel` is added.

---

### `notebook-lm/frontend/src/App.css`
**Replace entirely** with the new `App.css` provided.

---

## 📂 New Files to Add

| Destination path | Source file in this bundle |
|---|---|
| `notebook-lm/backend/app/api/routes/analysis.py` | `backend/app/api/routes/analysis.py` |
| `notebook-lm/frontend/src/components/AnalysisPanel.tsx` | `frontend/src/components/AnalysisPanel.tsx` |
| `notebook-lm/frontend/src/components/RAGPanel.tsx` | `frontend/src/components/RAGPanel.tsx` |
| `notebook-lm/frontend/src/components/tabs/CompareTab.tsx` | `frontend/src/components/tabs/CompareTab.tsx` |
| `notebook-lm/frontend/src/components/tabs/QuizTab.tsx` | `frontend/src/components/tabs/QuizTab.tsx` |
| `notebook-lm/frontend/src/components/tabs/WeakTopicsTab.tsx` | `frontend/src/components/tabs/WeakTopicsTab.tsx` |
| `notebook-lm/frontend/src/components/tabs/ConceptGraphTab.tsx` | `frontend/src/components/tabs/ConceptGraphTab.tsx` |
| `notebook-lm/frontend/src/components/tabs/GapsTab.tsx` | `frontend/src/components/tabs/GapsTab.tsx` |
| `notebook-lm/frontend/src/hooks/useDocSelector.tsx` | `frontend/src/hooks/useDocSelector.tsx` |
| `render.yaml` (repo root) | `render.yaml` |

---

## 🚀 Deploying to Render

### Prerequisites
- GitHub account with the repo pushed
- Render account (free at render.com)
- Groq API key

### Steps

1. **Copy `render.yaml` to the root of your repository** (same level as `notebook-lm/`).

2. **In Render dashboard → New → Blueprint**
   - Connect your GitHub repo.
   - Render will detect `render.yaml` and preview two services.

3. **Set secrets in Render dashboard** (never commit these):
   - `doclens-backend` → Environment Variables → Add:
     - `GROQ_API_KEY` = your key

4. **Deploy.** Wait ~3 minutes for both services to build.

5. **Update CORS_ORIGINS** in the backend service env vars:
   - After frontend deploys, copy its URL (e.g. `https://doclens-frontend.onrender.com`)
   - Set `CORS_ORIGINS` on the backend service to that URL
   - Trigger a manual redeploy of the backend

6. **Update REACT_APP_API_URL** in `render.yaml` with your actual backend URL,
   commit and push to trigger a frontend rebuild. Or set it in the Render dashboard.

### ⚠ Render Free-Tier Caveats
- Services spin down after 15 minutes of inactivity → cold-start ~30s on first request.
- `/tmp` storage is **ephemeral** — uploaded PDFs and FAISS indices are lost on restart.
- For persistence: add a Render Disk ($1/GB/month) and point `UPLOAD_DIR` / `VECTOR_DB_DIR`
  to a mounted path like `/data/uploads`, `/data/vector_db`.

---

## 💡 Feature Overview

### ⇄ Compare Documents
Send 2+ document IDs to `/api/analysis/compare`. Returns:
- Shared themes (similarities)
- Side-by-side differences per topic
- Topics unique to each document
- Summary paragraph

### ? Quiz & Flashcards
`/api/analysis/quiz` generates 6 MCQ + 4 flashcard items.
Frontend: MCQ cards reveal correct/wrong with colour feedback;
flashcards flip on click with a CSS 3D transform.

### ⚡ Weak Topics
`/api/analysis/weak-topics` scores each identified topic 1–10 on coverage depth.
Scores 1–5 surface as "weak". Coverage bars animate in on render.

### ◎ Concept Graph
`/api/analysis/concept-graph` returns nodes (concepts) and edges (relationships).
Frontend runs a minimal JavaScript force simulation (no D3 dependency) and renders
a fully interactive SVG — hover a node to highlight all its connections.

### ◻ Coverage Gaps
`/api/analysis/gaps` identifies:
- Topics entirely absent from the documents
- Topics mentioned but underdeveloped
- Questions the documents cannot answer
