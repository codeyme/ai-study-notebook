import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.services.vector_store import VectorStore
from app.services.rag_service import RAGService

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    document_ids: List[str]
    focus: Optional[str] = None


vector_store = VectorStore(
    embedding_model=settings.embedding_model,
    vector_db_dir=settings.vector_db_dir
)

rag_service = RAGService(
    vector_store=vector_store,
    groq_api_key=settings.groq_api_key,
    ollama_base_url=settings.ollama_base_url,
    ollama_model=settings.ollama_model
)


def get_doc_context(
    document_id: str,
    query: str = "summary key topics methods conclusions important concepts",
    top_k: int = 6,
    max_chars: int = 3000
) -> str:
    """
    Pull a limited amount of text from the vector store so prompts stay small.
    """
    try:
        results = vector_store.search(document_id, query, top_k)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error searching vector store for {document_id}: {str(e)}"
        )

    if not results:
        return ""

    context_parts = []
    total_chars = 0

    for item in results:
        if isinstance(item, (list, tuple)) and len(item) >= 1:
            chunk = str(item[0])
        else:
            chunk = str(item)

        remaining = max_chars - total_chars
        if remaining <= 0:
            break

        chunk = chunk[:remaining]
        context_parts.append(chunk)
        total_chars += len(chunk)

    return "\n\n".join(context_parts)


def call_llm(prompt: str) -> str:
    """
    Use the existing RAG service's LLM client.
    """
    try:
        if hasattr(rag_service, "llm") and rag_service.llm is not None:
            response = rag_service.llm.invoke(prompt)
            if hasattr(response, "content"):
                return response.content
            return str(response)

        if hasattr(rag_service, "_query_ollama"):
            return rag_service._query_ollama(prompt)

        raise Exception("No usable LLM method found on RAGService")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")


def parse_json_response(text: str):
    """
    Robust JSON parsing for LLM output.
    """
    cleaned = text.strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = cleaned[start:end + 1]
            try:
                return json.loads(candidate)
            except Exception:
                pass

        raise HTTPException(
            status_code=500,
            detail=f"Model did not return valid JSON. Raw response: {text}"
        )


@router.post("/quiz")
async def generate_quiz(req: AnalysisRequest):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document.")

    contexts = []
    for doc_id in req.document_ids:
        context = get_doc_context(
            document_id=doc_id,
            query=req.focus or "summary key topics methods conclusions important concepts",
            top_k=5,
            max_chars=2200
        )
        if context:
            contexts.append(f"DOCUMENT {doc_id}:\n{context}")

    if not contexts:
        raise HTTPException(
            status_code=404,
            detail="No indexed document content found for the selected document(s)."
        )

    prompt = f"""
You are generating a study quiz from documents.

Return valid JSON only.

Required JSON shape:
{{
  "items": [
    {{
      "question": "string",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "answer": "A",
      "explanation": "string",
      "doc_source": "document id",
      "type": "mcq"
    }},
    {{
      "question": "string",
      "options": [],
      "answer": "string",
      "explanation": "string",
      "doc_source": "document id",
      "type": "flashcard"
    }}
  ]
}}

Rules:
- Return exactly 6 items total
- 4 items must be type "mcq"
- 2 items must be type "flashcard"
- Use only the selected documents
- Focus area: {req.focus or "general understanding"}
- Make the quiz useful and specific to the material
- For MCQ, answer must be only one of: A, B, C, D
- Keep explanations concise
- Do not include markdown fences
- Do not include commentary before or after JSON

Context:
{chr(10).join(contexts)}
"""
    result_text = call_llm(prompt)
    return parse_json_response(result_text)


@router.post("/compare")
async def compare_documents(req: AnalysisRequest):
    if len(req.document_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 documents.")

    selected_ids = req.document_ids[:2]
    contexts = []

    for doc_id in selected_ids:
        context = get_doc_context(
            document_id=doc_id,
            query=req.focus or "summary key topics methods conclusions contributions limitations",
            top_k=4,
            max_chars=2200
        )

        if context:
            context = context[:2200]
            contexts.append(f"DOCUMENT {doc_id}:\n{context}")

    if len(contexts) < 2:
        raise HTTPException(
            status_code=404,
            detail="Could not load enough indexed content for comparison."
        )

    prompt = f"""
Compare the two documents below.

Return valid JSON only.

Required JSON shape:
{{
  "summary": "string",
  "similarities": ["string", "string"],
  "differences": [
    {{
      "topic": "string",
      "doc_a": "string",
      "doc_b": "string"
    }}
  ],
  "unique_to": {{
    "{selected_ids[0]}": ["string", "string"],
    "{selected_ids[1]}": ["string", "string"]
  }}
}}

Rules:
- Compare the two documents meaningfully
- Focus area: {req.focus or "general comparison"}
- Be specific, not generic
- Keep output concise
- Limit similarities to 4 items
- Limit differences to 5 items
- Limit unique_to to 4 items per document
- Do not include markdown fences
- Do not include commentary before or after JSON

Context:
{chr(10).join(contexts)}
"""
    result_text = call_llm(prompt)
    return parse_json_response(result_text)


@router.post("/weak-topics")
async def weak_topics(req: AnalysisRequest):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document.")

    contexts = []
    for doc_id in req.document_ids:
        context = get_doc_context(
            document_id=doc_id,
            query=req.focus or "weak topics unclear areas shallow explanation limitations open questions",
            top_k=5,
            max_chars=2200
        )
        if context:
            contexts.append(f"DOCUMENT {doc_id}:\n{context}")

    if not contexts:
        raise HTTPException(
            status_code=404,
            detail="No indexed document content found for the selected document(s)."
        )

    prompt = f"""
Analyze the documents and identify weakly covered topics, unclear areas, shallow explanation areas, or places where a learner may still struggle.

Return valid JSON only.

Required JSON shape:
{{
  "weak_topics": [
    {{
      "topic": "string",
      "reason": "string",
      "coverage_score": 0,
      "doc_source": "document id"
    }}
  ],
  "recommendation": "string"
}}

Rules:
- coverage_score must be an integer from 0 to 10
- Lower score = weaker coverage
- Focus area: {req.focus or "overall coverage"}
- Keep the list concise
- Do not include markdown fences
- Do not include commentary before or after JSON

Context:
{chr(10).join(contexts)}
"""
    result_text = call_llm(prompt)
    return parse_json_response(result_text)


@router.post("/concept-graph")
async def concept_graph(req: AnalysisRequest):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document.")

    contexts = []
    for doc_id in req.document_ids:
        context = get_doc_context(
            document_id=doc_id,
            query=req.focus or "important concepts entities relationships methods results",
            top_k=5,
            max_chars=2000
        )
        if context:
            contexts.append(f"DOCUMENT {doc_id}:\n{context}")

    if not contexts:
        raise HTTPException(
            status_code=404,
            detail="No indexed document content found for the selected document(s)."
        )

    prompt = f"""
Extract a concept graph from the document content.

Return valid JSON only.

Required JSON shape:
{{
  "nodes": [
    {{
      "id": "string",
      "label": "string",
      "group": "string",
      "weight": 1
    }}
  ],
  "edges": [
    {{
      "source": "string",
      "target": "string",
      "label": "relates_to",
      "weight": 0.8
    }}
  ]
}}

Rules:
- Keep node ids simple and unique
- Return 5 to 15 nodes if possible
- Return meaningful relations
- Focus area: {req.focus or "key concepts"}
- Do not include markdown fences
- Do not include commentary before or after JSON

Context:
{chr(10).join(contexts)}
"""
    result_text = call_llm(prompt)
    return parse_json_response(result_text)


@router.post("/gaps")
async def gaps(req: AnalysisRequest):
    if not req.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one document.")

    contexts = []
    for doc_id in req.document_ids:
        context = get_doc_context(
            document_id=doc_id,
            query=req.focus or "missing topics shallow areas gaps limitations unanswered questions",
            top_k=5,
            max_chars=2200
        )
        if context:
            contexts.append(f"DOCUMENT {doc_id}:\n{context}")

    if not contexts:
        raise HTTPException(
            status_code=404,
            detail="No indexed document content found for the selected document(s)."
        )

    prompt = f"""
Analyse what is NOT covered or is only barely covered in these documents.

Return valid JSON only.

Required JSON shape:
{{
  "gaps": [
    "topic completely absent 1",
    "topic completely absent 2"
  ],
  "related_but_shallow": [
    "topic mentioned but needs more depth"
  ],
  "suggested_questions": [
    "Question you cannot answer from these docs 1",
    "Question you cannot answer from these docs 2"
  ]
}}

Rules:
- gaps: 5 to 8 short strings
- related_but_shallow: 3 to 5 short strings
- suggested_questions: exactly 5 strings
- every array item must be plain text
- no objects
- no severity scores
- no recommendations field
- Focus area: {req.focus or "knowledge gaps"}
- Keep the output concise
- Do not include markdown fences
- Do not include commentary before or after JSON

Context:
{chr(10).join(contexts)}
"""
    result_text = call_llm(prompt)
    return parse_json_response(result_text)