import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

interface Props {
  apiUrl: string;
  onDocumentUploaded: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const RAGPanel: React.FC<Props> = ({ apiUrl, onDocumentUploaded }) => {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUpload = async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${apiUrl}/api/documents/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const docId = res.data.document_id || res.data.id;
      setDocumentId(docId);
      setFilename(file.name);
      setMessages([
        {
          role: "assistant",
          content: `✓ **${file.name}** uploaded — ${res.data.chunks_count || res.data.total_chunks || "?"} chunks indexed.\n\nAsk me anything about this document.`,
        },
      ]);
      onDocumentUploaded();
    } catch (e: any) {
      alert(`Upload failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !documentId) return;
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await axios.post(`${apiUrl}/api/chat`, {
        document_id: documentId,
        message: text,
      });
      setMessages([...next, { role: "assistant", content: res.data.response || res.data.answer }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `⚠ Error: ${e?.response?.data?.detail || e.message}` }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">Document Chat</div>
        <div className="panel-subtitle">RAG-powered Q&amp;A · Upload a PDF to begin</div>
      </div>

      <div className="panel-body">
        {/* Upload zone */}
        <label
          className={`upload-zone ${dragOver ? "drag-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
          />
          {uploading ? (
            <><div className="spinner" style={{ width: 24, height: 24, margin: "0 auto 8px" }} /><div className="upload-label">Processing…</div></>
          ) : (
            <>
              <div className="upload-icon">📄</div>
              <div className="upload-label">
                {filename ? `Current: ${filename}` : "Drop PDF here or click to upload"}
              </div>
              <div className="upload-sublabel">Replaces current document</div>
            </>
          )}
        </label>

        {documentId && (
          <div style={{ marginBottom: 8 }}>
            <span className="doc-chip">
              <span className="doc-chip-dot" />
              {filename}
            </span>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div className="empty-title">No conversation yet</div>
              <div className="empty-desc">Upload a PDF and start asking questions.</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role === "user" ? "user" : ""}`}>
              <div className={`msg-avatar ${m.role === "user" ? "usr" : "ai"}`}>
                {m.role === "user" ? "U" : "AI"}
              </div>
              <div className="msg-bubble">{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="chat-message">
              <div className="msg-avatar ai">AI</div>
              <div className="msg-bubble" style={{ opacity: 0.6 }}>
                <span className="spinner" style={{ width: 14, height: 14, display: "inline-block", verticalAlign: "middle" }} />
                {" "}Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          rows={2}
          placeholder={documentId ? "Ask anything about the document…" : "Upload a PDF first"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!documentId || sending}
        />
        <button className="icon-btn" onClick={sendMessage} disabled={!documentId || sending || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
};

export default RAGPanel;
