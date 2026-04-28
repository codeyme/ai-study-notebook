"""
analysis.py  –  NEW FILE
Handles all the new intelligence features:
  - /api/analysis/compare        – cross-document comparison
  - /api/analysis/quiz           – quiz / flashcard generation
  - /api/analysis/weak-topics    – topics that appear thin or shallow
  - /api/analysis/concept-graph  – nodes + edges for concept map
  - /api/analysis/gaps           – what is NOT covered in these docs
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json, re

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# ── shared helpers ────────────────────────────────────────────────────────────

def _get_llm_client():
    """Return configured Groq or Ollama client (same pattern as existing code)."""
    import os
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        from groq import Groq
        return Groq(api_key=groq_key), "groq"
    return None, "ollama"


def _llm_chat(messages: list, max_tokens: int = 4096) -> str:
    """Fire a chat completion; returns raw text."""
    import os, httpx
    client, provider = _get_llm_client()

    if provider == "groq":
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content

    # Ollama fallback
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
    payload = {"model": model, "messages": messages, "stream": False}
    r = httpx.post(f"{ollama_url}/api/chat", json=payload, timeout=120)
    r.raise_for_status()
    return r.json()["message"]["content"]


def _load_rag_service():
    """Import the existing RAG service to reuse FAISS + text retrieval."""
    from app.services.rag_service import RAGService
    return RAGService()


def _get_all_chunks(document_ids: List[str], rag) -> dict:
    """
    Returns { doc_id: [chunk_text, ...] } for each document.
    Falls back gracefully if a doc doesn't exist.
    """
    result = {}
    for doc_id in document_ids:
        try:
            # RAGService stores metadata; retrieve top-N broad chunks
            chunks = rag.get_chunks_for_document(doc_id)
            result[doc_id] = chunks
        except Exception:
            result[doc_id] = []
    return result


def _summarise_doc(doc_id: str, chunks: List[str], max_chars=8000) -> str:
    text = " ".join(chunks)
    return text[:max_chars]


# ── request / response models ─────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    document_ids: List[str]
    focus: Optional[str] = None          # optional user hint


class CompareResponse(BaseModel):
    similarities: List[str]
    differences: List[dict]              # [{topic, doc_a, doc_b}]
    unique_to: dict                      # {doc_id: [topics]}
    summary: str


class QuizItem(BaseModel):
    question: str
    options: List[str]                   # 4 choices for MCQ, empty for flashcard
    answer: str
    explanation: str
    doc_source: str
    type: str                            # "mcq" | "flashcard"


class QuizResponse(BaseModel):
    items: List[QuizItem]


class WeakTopicItem(BaseModel):
    topic: str
    reason: str
    coverage_score: int                  # 1-10
    doc_source: str


class WeakTopicsResponse(BaseModel):
    weak_topics: List[WeakTopicItem]
    recommendation: str


class ConceptNode(BaseModel):
    id: str
    label: str
    group: str                           # doc_id or "shared"
    weight: int                          # 1-5 importance


class ConceptEdge(BaseModel):
    source: str
    target: str
    label: str
    weight: float


class ConceptGraphResponse(BaseModel):
    nodes: List[ConceptNode]
    edges: List[ConceptEdge]


class GapsResponse(BaseModel):
    gaps: List[str]
    related_but_shallow: List[str]
    suggested_questions: List[str]


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/compare", response_model=CompareResponse)
async def compare_documents(req: AnalysisRequest):
    if len(req.document_ids) < 2:
        raise HTTPException(400, "Provide at least 2 document_ids to compare.")

    rag = _load_rag_service()
    chunks_map = _get_all_chunks(req.document_ids, rag)

    summaries = {
        doc_id: _summarise_doc(doc_id, chunks)
        for doc_id, chunks in chunks_map.items()
    }

    doc_labels = [f"Document-{i+1} (id:{did})" for i, did in enumerate(req.document_ids)]
    summaries_text = "\n\n".join(
        f"=== {doc_labels[i]} ===\n{summaries[did]}"
        for i, did in enumerate(req.document_ids)
    )

    focus_hint = f"\nUser focus area: {req.focus}" if req.focus else ""
    prompt = f"""You are an expert document analyst. Compare the following documents and respond ONLY with valid JSON.{focus_hint}

{summaries_text}

Return JSON with this exact shape:
{{
  "similarities": ["<shared theme 1>", ...],
  "differences": [{{"topic": "...", "doc_a": "...", "doc_b": "..."}}],
  "unique_to": {{"<doc_id>": ["<topic>", ...]}},
  "summary": "<2-3 sentence overall comparison>"
}}
Replace doc_id keys with the actual document IDs provided."""

    raw = _llm_chat([{"role": "user", "content": prompt}])
    data = _parse_json(raw)
    return CompareResponse(**data)


@router.post("/quiz", response_model=QuizResponse)
async def generate_quiz(req: AnalysisRequest):
    rag = _load_rag_service()
    chunks_map = _get_all_chunks(req.document_ids, rag)

    all_text = ""
    for doc_id, chunks in chunks_map.items():
        all_text += f"\n--- Document {doc_id} ---\n" + " ".join(chunks[:30])

    all_text = all_text[:12000]
    focus_hint = f"\nFocus on: {req.focus}" if req.focus else ""

    prompt = f"""You are a quiz master. Create 10 items (6 MCQ + 4 flashcards) from the documents below.{focus_hint}
Respond ONLY with valid JSON.

DOCUMENTS:
{all_text}

Return JSON:
{{
  "items": [
    {{
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "...",
      "doc_source": "<document_id>",
      "type": "mcq"
    }},
    {{
      "question": "...",
      "options": [],
      "answer": "...",
      "explanation": "...",
      "doc_source": "<document_id>",
      "type": "flashcard"
    }}
  ]
}}"""

    raw = _llm_chat([{"role": "user", "content": prompt}], max_tokens=3000)
    data = _parse_json(raw)
    items = [QuizItem(**item) for item in data.get("items", [])]
    return QuizResponse(items=items)


@router.post("/weak-topics", response_model=WeakTopicsResponse)
async def find_weak_topics(req: AnalysisRequest):
    rag = _load_rag_service()
    chunks_map = _get_all_chunks(req.document_ids, rag)

    combined = ""
    for doc_id, chunks in chunks_map.items():
        combined += f"\n--- {doc_id} ---\n" + " ".join(chunks)
    combined = combined[:10000]

    prompt = f"""Identify topics that are mentioned but covered only superficially (weak coverage) in these documents.
Respond ONLY with valid JSON.

DOCUMENTS:
{combined}

Return JSON:
{{
  "weak_topics": [
    {{
      "topic": "...",
      "reason": "why coverage is weak",
      "coverage_score": 3,
      "doc_source": "<doc_id>"
    }}
  ],
  "recommendation": "overall learning recommendation"
}}
coverage_score is 1 (almost nothing) to 10 (thorough). Focus on scores 1-5."""

    raw = _llm_chat([{"role": "user", "content": prompt}])
    data = _parse_json(raw)
    return WeakTopicsResponse(**data)


@router.post("/concept-graph", response_model=ConceptGraphResponse)
async def build_concept_graph(req: AnalysisRequest):
    rag = _load_rag_service()
    chunks_map = _get_all_chunks(req.document_ids, rag)

    combined = ""
    for doc_id, chunks in chunks_map.items():
        combined += f"\n--- {doc_id} ---\n" + " ".join(chunks[:20])
    combined = combined[:8000]

    prompt = f"""Extract key concepts and their relationships from these documents to build a concept graph.
Respond ONLY with valid JSON.

DOCUMENTS:
{combined}

Return JSON:
{{
  "nodes": [
    {{"id": "node_1", "label": "Machine Learning", "group": "<doc_id or 'shared'>", "weight": 5}}
  ],
  "edges": [
    {{"source": "node_1", "target": "node_2", "label": "enables", "weight": 0.8}}
  ]
}}
Include 15-25 nodes and 20-35 edges. Weight nodes 1-5 by importance. Edge weight 0-1."""

    raw = _llm_chat([{"role": "user", "content": prompt}])
    data = _parse_json(raw)
    return ConceptGraphResponse(**data)


@router.post("/gaps", response_model=GapsResponse)
async def find_coverage_gaps(req: AnalysisRequest):
    rag = _load_rag_service()
    chunks_map = _get_all_chunks(req.document_ids, rag)

    combined = ""
    for doc_id, chunks in chunks_map.items():
        combined += f"\n--- {doc_id} ---\n" + " ".join(chunks)
    combined = combined[:10000]
    focus_hint = f"\nDomain/focus: {req.focus}" if req.focus else ""

    prompt = f"""Analyse what is NOT covered or barely mentioned in these documents.{focus_hint}
Respond ONLY with valid JSON.

DOCUMENTS:
{combined}

Return JSON:
{{
  "gaps": ["topic completely absent 1", "topic completely absent 2", ...],
  "related_but_shallow": ["topic mentioned but needs more depth", ...],
  "suggested_questions": ["Question you cannot answer from these docs 1", ...]
}}
gaps: 5-8 items. related_but_shallow: 3-5 items. suggested_questions: 5 items."""

    raw = _llm_chat([{"role": "user", "content": prompt}])
    data = _parse_json(raw)
    return GapsResponse(**data)


# ── util ──────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Extract and parse JSON from LLM output, stripping markdown fences."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    # find first { or [
    start = min(
        (text.find("{") if text.find("{") != -1 else len(text)),
        (text.find("[") if text.find("[") != -1 else len(text)),
    )
    text = text[start:]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"LLM returned invalid JSON: {e}\nRaw: {text[:300]}")
