import React, { useState } from "react";
import { Document } from "../App";
import CompareTab from "./tabs/CompareTab";
import QuizTab from "./tabs/QuizTab";
import WeakTopicsTab from "./tabs/WeakTopicsTab";
import ConceptGraphTab from "./tabs/ConceptGraphTab";
import GapsTab from "./tabs/GapsTab";

interface Props {
  apiUrl: string;
  documents: Document[];
}

const TABS = [
  { id: "compare",  label: "Compare",       icon: "⇄" },
  { id: "quiz",     label: "Quiz",          icon: "?" },
  { id: "weak",     label: "Weak Topics",   icon: "⚡" },
  { id: "graph",    label: "Concept Graph", icon: "◎" },
  { id: "gaps",     label: "Gaps",          icon: "◻" },
] as const;

type TabId = typeof TABS[number]["id"];

const AnalysisPanel: React.FC<Props> = ({ apiUrl, documents }) => {
  const [activeTab, setActiveTab] = useState<TabId>("compare");

  const renderTab = () => {
    switch (activeTab) {
      case "compare": return <CompareTab apiUrl={apiUrl} documents={documents} />;
      case "quiz":    return <QuizTab    apiUrl={apiUrl} documents={documents} />;
      case "weak":    return <WeakTopicsTab apiUrl={apiUrl} documents={documents} />;
      case "graph":   return <ConceptGraphTab apiUrl={apiUrl} documents={documents} />;
      case "gaps":    return <GapsTab    apiUrl={apiUrl} documents={documents} />;
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Intelligence Studio</div>
        <div className="panel-subtitle">AI-powered document analysis</div>
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {renderTab()}
      </div>
    </div>
  );
};

export default AnalysisPanel;
