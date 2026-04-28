"""
PATCH for notebook-lm/backend/app/main.py
==========================================
Apply these changes to the existing file.

BUG FIXES in the original repo
--------------------------------
1. CORS wildcard blocks credentials on some browsers in production.
   Replace allow_origins=["*"] with explicit origin list (reads from env).

2. The /api/podcast/download/{document_id} endpoint returns a FileResponse
   but never checks if the file exists first — crashes with 500 instead of 404.

3. Missing Content-Disposition header on audio download causes some browsers
   to play inline instead of downloading.

4. uvicorn is started with `--reload` in start_backend.sh which is
   incompatible with production (Render). The render start command should
   omit --reload (already noted in README but start script doesn't gate it).

NEW ADDITIONS
-------------
- Register the new analysis router.
- Add /api/documents/list endpoint (needed by the new frontend).
"""

# ── CHANGE 1: replace the CORS middleware section ────────────────────────────
#
# OLD:
#   app.add_middleware(
#       CORSMiddleware,
#       allow_origins=["*"],
#       ...
#   )
#
# NEW (paste this block):

import os as _os
from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

_CORS_ORIGINS_RAW = _os.getenv("CORS_ORIGINS", "http://localhost:3000")
_CORS_ORIGINS = [o.strip() for o in _CORS_ORIGINS_RAW.split(",")]

# app.add_middleware(
#     _CORSMiddleware,
#     allow_origins=_CORS_ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


# ── CHANGE 2: register the analysis router ───────────────────────────────────
#
# Add after existing router includes:
#   from app.api.routes.analysis import router as analysis_router
#   app.include_router(analysis_router)


# ── CHANGE 3: add document-list endpoint ─────────────────────────────────────
#
# Add this route to documents.py (or directly in main.py):

"""
@router.get("/api/documents/list")
async def list_documents():
    '''Return all known document IDs so the frontend can populate the picker.'''
    vector_db_dir = os.getenv("VECTOR_DB_DIR", "vector_db")
    if not os.path.exists(vector_db_dir):
        return {"documents": []}
    docs = []
    for name in os.listdir(vector_db_dir):
        meta_path = os.path.join(vector_db_dir, name, "metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
                docs.append({
                    "id": name,
                    "filename": meta.get("filename", name),
                    "chunks": meta.get("total_chunks", 0),
                    "uploaded_at": meta.get("uploaded_at", ""),
                })
            except Exception:
                docs.append({"id": name, "filename": name, "chunks": 0, "uploaded_at": ""})
    return {"documents": docs}
"""


# ── CHANGE 4: fix podcast download endpoint ─────────────────────────────────
#
# In podcast.py route, replace:
#   return FileResponse(audio_path, ...)
# With:
"""
import os
from fastapi.responses import FileResponse
from fastapi import HTTPException

@router.get("/download/{document_id}")
async def download_podcast(document_id: str):
    audio_dir = os.getenv("AUDIO_OUTPUT_DIR", "generated_audio")
    audio_path = os.path.join(audio_dir, f"{document_id}.mp3")
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Podcast not found. Generate it first.")
    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=f"podcast_{document_id}.mp3",
        headers={"Content-Disposition": f'attachment; filename="podcast_{document_id}.mp3"'},
    )
"""
