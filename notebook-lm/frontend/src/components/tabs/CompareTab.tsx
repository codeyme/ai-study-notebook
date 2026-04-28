import React, { useState } from "react";
import axios from "axios";
import { Document } from "../../App";
import { useDocSelector } from "../../hooks/useDocSelector";

interface Props { apiUrl: string; documents: Document[]; }

interface CompareResult {
  similarities: string[];
  differences: { topic: string; doc_a: string; doc_b: string }[];
  unique_to: Record<string, string[]>;
  summary: string;
}

const CompareTab: React.FC<Props> = ({ apiUrl, documents }) => {
  const { selectedIds, DocSelector } = useDocSelector(documents);
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    if (selectedIds.length < 2) { setError("Select at least 2 documents."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await axios.post(`${apiUrl}/api/analysis/compare`, {
        document_ids: selectedIds,
        focus: focus || undefined,
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  const docName = (id: string) => documents.find(d => d.id === id)?.filename || id;

  return (
    <div>
      <DocSelector />
      <input
        className="focus-input"
        placeholder="Optional focus (e.g., 'methodology', 'conclusions')"
        value={focus}
        onChange={e => setFocus(e.target.value)}
      />
      {error && <div style={{ color: "var(--accent4)", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      <button className="run-btn" onClick={run} disabled={loading || selectedIds.length < 2}>
        {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analysing…</> : "⇄ Compare Documents"}
      </button>

      {loading && (
        <div className="loader">
          <div className="spinner" />
          Comparing documents across dimensions…
        </div>
      )}

      {result && (
        <>
          <div className="result-section">
            <div className="result-section-title">Summary</div>
            <div className="card" style={{ fontSize: 14, color: "var(--text)" }}>{result.summary}</div>
          </div>

          <div className="result-section">
            <div className="result-section-title">Similarities</div>
            {result.similarities.map((s, i) => (
              <div key={i} className="gap-item">
                <span className="gap-bullet" style={{ color: "var(--accent2)" }}>✓</span>
                {s}
              </div>
            ))}
          </div>

          <div className="result-section">
            <div className="result-section-title">Differences by Topic</div>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Doc A</th>
                  <th>Doc B</th>
                </tr>
              </thead>
              <tbody>
                {result.differences.map((d, i) => (
                  <tr key={i}>
                    <td><span className="pill purple">{d.topic}</span></td>
                    <td>{d.doc_a}</td>
                    <td>{d.doc_b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.entries(result.unique_to).map(([docId, topics]) => (
            <div key={docId} className="result-section">
              <div className="result-section-title">Unique to {docName(docId)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topics.map((t, i) => <span key={i} className="pill amber">{t}</span>)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default CompareTab;
