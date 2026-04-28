import React, { useState, useEffect } from "react";
import axios from "axios";
import RAGPanel from "./components/RAGPanel";
import AnalysisPanel from "./components/AnalysisPanel";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface Document {
  id: string;
  filename: string;
  chunks: number;
  uploaded_at: string;
}

const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/documents/list`);
      setDocuments(res.data.documents || []);
    } catch {
      // endpoint might not exist in original — silently ignore
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <div className={`app-root ${theme}`}>
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">◈</span>
          <span className="brand-name">DocLens</span>
          <span className="brand-tag">AI Document Intelligence</span>
        </div>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? "☀" : "◐"}
        </button>
      </header>

      <main className="app-main">
        <RAGPanel apiUrl={API_URL} onDocumentUploaded={fetchDocuments} />
        <AnalysisPanel apiUrl={API_URL} documents={documents} />
      </main>
    </div>
  );
};

export default App;
