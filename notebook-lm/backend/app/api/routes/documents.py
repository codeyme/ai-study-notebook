import hashlib
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from app.core.config import settings
from app.models.schemas import DocumentUploadResponse
from app.services.pdf_processor import PDFProcessor
from app.services.vector_store import VectorStore

router = APIRouter()

pdf_processor = PDFProcessor(
    chunk_size=settings.chunk_size,
    chunk_overlap=settings.chunk_overlap
)

vector_store = VectorStore(
    embedding_model=settings.embedding_model,
    vector_db_dir=settings.vector_db_dir
)


def compute_document_id(file_path: Path) -> str:
    """
    Match the exact document_id logic used by PDFProcessor.process_pdf():
    SHA-256 hash of file bytes, first 16 hex chars.
    """
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / file.filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        document_id, chunks = pdf_processor.process_pdf(file_path)
        chunks_count = vector_store.add_document(document_id, chunks)

        return DocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            chunks_count=chunks_count,
            message="Document uploaded and processed successfully"
        )

    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@router.get("/documents/{document_id}/exists")
async def check_document_exists(document_id: str):
    exists = vector_store.document_exists(document_id)
    return {
        "exists": exists,
        "document_id": document_id
    }


@router.get("/list")
async def list_documents():
    """
    Return document IDs that match the vector store IDs.
    This is what the analysis tabs need.
    """
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    documents = []

    for pdf_file in upload_dir.glob("*.pdf"):
        try:
            document_id = compute_document_id(pdf_file)
            indexed = vector_store.document_exists(document_id)

            documents.append({
                "id": document_id,
                "filename": pdf_file.name,
                "chunks": 0,
                "uploaded_at": pdf_file.stat().st_mtime,
                "indexed": indexed
            })
        except Exception as e:
            documents.append({
                "id": None,
                "filename": pdf_file.name,
                "chunks": 0,
                "uploaded_at": pdf_file.stat().st_mtime,
                "indexed": False,
                "error": str(e)
            })

    documents.sort(key=lambda x: x["uploaded_at"], reverse=True)

    return {
        "documents": documents
    }