from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import documents, chat, podcast, analysis

app = FastAPI(
    title="NotebookLM Clone API",
    description="API for RAG-based document chat, analysis, and podcast generation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routers
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(podcast.router, prefix="/api/podcast", tags=["podcast"])

# IMPORTANT:
# analysis.py already uses prefix="/api/analysis"
# so do NOT add another prefix here
app.include_router(analysis.router)


@app.get("/")
async def root():
    return {
        "message": "NotebookLM Clone API",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }