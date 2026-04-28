import React, { useState } from "react";
import axios from "axios";
import { Document } from "../../App";
import { useDocSelector } from "../../hooks/useDocSelector";

interface Props { apiUrl: string; documents: Document[]; }

interface GapsResult {
  gaps: string[];
  related_but_shallow: string[];
  suggested_questions: string[];
}

const GapsTab: React.FC<Props> = ({ apiUrl, documents }) => {
  const { selectedIds, DocSelector } = useDocSelector(documents);
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GapsResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (selectedIds.length === 0) { setError("Select at least one document."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await axios.post(`${apiUrl}/api/analysis/gaps`, {
        document_ids: selectedIds,
        focus: focus || undefined,
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <DocSelector />
      <input
        className="focus-input"
        placeholder="Optional domain context (e.g., 'machine learning', 'legal contracts')"
        value={focus}
        onChange={e => setFocus(e.target.value)}
      />
      {error && <div style={{ color: "var(--accent4)", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      <button className="run-btn" onClick={run} disabled={loading || selectedIds.length === 0}>
        {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Scanning…</> : "◻ Find Coverage Gaps"}
      </button>

      {loading && <div className="loader"><div className="spinner" />Mapping the boundaries of your documents…</div>}

      {result && (
        <>
          <div className="result-section">
            <div className="result-section-title">Not Covered At All</div>
            {result.gaps.map((g, i) => (
              <div key={i} className="gap-item">
                <span className="gap-bullet" style={{ color: "var(--accent4)" }}>✕</span>
                {g}
              </div>
            ))}
          </div>

          <div className="result-section">
            <div className="result-section-title">Mentioned But Too Shallow</div>
            {result.related_but_shallow.map((g, i) => (
              <div key={i} className="gap-item">
                <span className="gap-bullet" style={{ color: "var(--accent3)" }}>~</span>
                {g}
              </div>
            ))}
          </div>

          <div className="result-section">
            <div className="result-section-title">Questions You Can't Answer from These Docs</div>
            {result.suggested_questions.map((q, i) => (
              <div key={i} className="card" style={{ borderLeft: "3px solid var(--accent4)", borderRadius: "0 10px 10px 0" }}>
                <span style={{ color: "var(--text3)", marginRight: 8, fontFamily: "var(--mono)", fontSize: 12 }}>Q{i + 1}</span>
                {q}
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !result && (
        <div className="empty-state">
          <div className="empty-icon">◻</div>
          <div className="empty-title">Discover the unknown</div>
          <div className="empty-desc">Find what topics are missing, underdeveloped, or entirely absent from your documents.</div>
        </div>
      )}
    </div>
  );
};

export default GapsTab;
