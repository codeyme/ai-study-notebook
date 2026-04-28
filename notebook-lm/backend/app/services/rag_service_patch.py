"""
PATCH for backend/app/services/rag_service.py
Add this method inside the RAGService class.

The existing code already stores chunk text in self.vector_store.metadata.
This helper exposes those chunks so the new analysis routes can use them.
"""

# ── ADD THIS METHOD to the RAGService class ───────────────────────────────────

def get_chunks_for_document(self, document_id: str) -> list[str]:
    """
    Return all stored text chunks for a given document_id.
    Works with the existing FAISS + metadata storage pattern.
    """
    store = self._load_vector_store(document_id)
    if store is None:
        return []
    # metadata list stores {"text": "...", "chunk_id": n, ...}
    return [m.get("text", "") for m in store.get("metadata", []) if m.get("text")]


# ── ALSO PATCH main.py (or wherever routers are registered) ──────────────────
#
# In notebook-lm/backend/app/main.py, add these two lines:
#
#   from app.api.routes.analysis import router as analysis_router
#   app.include_router(analysis_router)
#
# Place them directly after the existing router includes.
