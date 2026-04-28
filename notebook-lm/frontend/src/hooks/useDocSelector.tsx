import React, { useEffect, useMemo, useState } from "react";

type DocLike = {
  id?: string;
  document_id?: string;
  filename?: string;
  name?: string;
};

export function useDocSelector<T extends DocLike>(documents: T[]) {
  const getId = (doc: T) => String(doc.id ?? doc.document_id ?? "");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const validIds = documents.map(getId).filter(Boolean);

    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => validIds.includes(id));
      return filtered;
    });
  }, [documents]);

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedIds.includes(getId(doc))),
    [documents, selectedIds]
  );

  const DocSelector: React.FC = () => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Select documents</div>

      {documents.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 14 }}>No documents available.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map((doc) => {
            const id = getId(doc);
            const label = doc.filename || doc.name || id;

            return (
              <label
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(id)}
                  onChange={() => toggleDoc(id)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedDocs,
    DocSelector,
  };
}