import React, { useState } from "react";
import axios from "axios";
import { Document } from "../../App";
import { useDocSelector } from "../../hooks/useDocSelector";

interface Props { apiUrl: string; documents: Document[]; }

interface QuizItem {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  doc_source: string;
  type: "mcq" | "flashcard";
}

const MCQCard: React.FC<{ item: QuizItem; index: number }> = ({ item, index }) => {
  const [chosen, setChosen] = useState<string | null>(null);

  const optionClass = (opt: string) => {
    if (!chosen) return "quiz-option";
    const letter = opt.charAt(0);
    if (letter === item.answer) return "quiz-option correct revealed";
    if (letter === chosen) return "quiz-option wrong revealed";
    return "quiz-option revealed";
  };

  return (
    <div className="quiz-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span className="pill purple">Q{index + 1}</span>
        <span className="pill green" style={{ fontSize: 10 }}>MCQ</span>
      </div>
      <div className="quiz-question">{item.question}</div>
      <div className="quiz-options">
        {item.options.map((opt, i) => (
          <button
            key={i}
            className={optionClass(opt)}
            onClick={() => !chosen && setChosen(opt.charAt(0))}
          >
            {opt}
          </button>
        ))}
      </div>
      {chosen && <div className="quiz-explanation">💡 {item.explanation}</div>}
    </div>
  );
};

const FlashCard: React.FC<{ item: QuizItem; index: number }> = ({ item, index }) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(f => !f)}>
      <div className="flashcard-inner">
        <div className="flashcard-front">
          <div className="flashcard-label">Flashcard {index + 1} · Question</div>
          <div className="flashcard-text">{item.question}</div>
          <div className="flashcard-hint">Click to reveal answer →</div>
        </div>
        <div className="flashcard-back">
          <div className="flashcard-label">Answer</div>
          <div className="flashcard-text">{item.answer}</div>
          {item.explanation && <div className="flashcard-hint">{item.explanation}</div>}
        </div>
      </div>
    </div>
  );
};

const QuizTab: React.FC<Props> = ({ apiUrl, documents }) => {
  const { selectedIds, DocSelector } = useDocSelector(documents);
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "mcq" | "flashcard">("all");

  const run = async () => {
    if (selectedIds.length === 0) { setError("Select at least one document."); return; }
    setError(""); setLoading(true); setItems([]);
    try {
      const res = await axios.post(`${apiUrl}/api/analysis/quiz`, {
        document_ids: selectedIds,
        focus: focus || undefined,
      });
      setItems(res.data.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  return (
    <div>
      <DocSelector />
      <input
        className="focus-input"
        placeholder="Optional focus topic (e.g., 'chapter 3', 'key definitions')"
        value={focus}
        onChange={e => setFocus(e.target.value)}
      />
      {error && <div style={{ color: "var(--accent4)", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      <button className="run-btn" onClick={run} disabled={loading || selectedIds.length === 0}>
        {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : "? Generate Quiz & Flashcards"}
      </button>

      {loading && <div className="loader"><div className="spinner" />Building quiz questions…</div>}

      {items.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["all", "mcq", "flashcard"] as const).map(f => (
              <button
                key={f}
                className={`tab-btn ${filter === f ? "active" : ""}`}
                style={{ padding: "6px 14px", borderBottom: "none", border: "1px solid var(--border)", borderRadius: 6 }}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? `All (${items.length})` : f === "mcq" ? `MCQ (${items.filter(i => i.type === "mcq").length})` : `Flashcards (${items.filter(i => i.type === "flashcard").length})`}
              </button>
            ))}
          </div>
          {filtered.map((item, i) =>
            item.type === "mcq"
              ? <MCQCard key={i} item={item} index={i} />
              : <FlashCard key={i} item={item} index={i} />
          )}
        </>
      )}
    </div>
  );
};

export default QuizTab;
