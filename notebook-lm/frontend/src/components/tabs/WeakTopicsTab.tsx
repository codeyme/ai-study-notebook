import React, { useState } from "react";
import axios from "axios";
import { Document } from "../../App";
import { useDocSelector } from "../../hooks/useDocSelector";

interface Props { apiUrl: string; documents: Document[]; }

interface WeakTopic {
  topic: string;
  reason: string;
  coverage_score: number;
  doc_source: string;
}

const scoreColor = (score: number) => {
  if (score <= 2) return "var(--accent4)";
  if (score <= 4) return "var(--accent3)";
  if (score <= 6) return "#60a5fa";
  return "var(--accent2)";
};

const WeakTopicsTab: React.FC<Props> = ({ apiUrl, documents }) => {
  const { selectedIds, DocSelector } = useDocSelector(documents);
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState<WeakTopic[]>([]);
  const [recommendation, setRecommendation] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    if (selectedIds.length === 0) { setError("Select at least one document."); return; }
    setError(""); setLoading(true); setTopics([]);
    try {
      const res = await axios.post(`${apiUrl}/api/analysis/weak-topics`, {
        document_ids: selectedIds,
      });
      setTopics(res.data.weak_topics || []);
      setRecommendation(res.data.recommendation || "");
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  const docName = (id: string) => documents.find(d => d.id === id)?.filename || id;

  return (
    <div>
      <DocSelector />
      {error && <div style={{ color: "var(--accent4)", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      <button className="run-btn" onClick={run} disabled={loading || selectedIds.length === 0}>
        {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Analysing…</> : "⚡ Find Weak Topics"}
      </button>

      {loading && <div className="loader"><div className="spinner" />Scanning coverage depth…</div>}

      {topics.length > 0 && (
        <>
          {recommendation && (
            <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid var(--accent)", borderRadius: "0 10px 10px 0" }}>
              <div className="card-label">Recommendation</div>
              {recommendation}
            </div>
          )}

          <div className="result-section">
            <div className="result-section-title">Weak Coverage Areas ({topics.length})</div>
            {topics
              .sort((a, b) => a.coverage_score - b.coverage_score)
              .map((t, i) => (
                <div key={i} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{t.topic}</div>
                    <span className="pill" style={{
                      background: `${scoreColor(t.coverage_score)}22`,
                      color: scoreColor(t.coverage_score),
                    }}>
                      {t.coverage_score}/10
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
                    {docName(t.doc_source)}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>{t.reason}</div>
                  <div className="coverage-bar">
                    <div
                      className="coverage-fill"
                      style={{
                        width: `${t.coverage_score * 10}%`,
                        background: scoreColor(t.coverage_score),
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {!loading && topics.length === 0 && selectedIds.length > 0 && (
        <div className="empty-state">
          <div className="empty-icon">⚡</div>
          <div className="empty-title">No results yet</div>
          <div className="empty-desc">Click the button above to scan for weak coverage areas.</div>
        </div>
      )}
    </div>
  );
};

export default WeakTopicsTab;
