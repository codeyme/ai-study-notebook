import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Document } from "../../App";
import { useDocSelector } from "../../hooks/useDocSelector";

interface Props { apiUrl: string; documents: Document[]; }

interface Node { id: string; label: string; group: string; weight: number; }
interface Edge { source: string; target: string; label: string; weight: number; }

// Minimal force simulation — no D3 dependency needed
function useForceGraph(nodes: Node[], edges: Edge[], width: number, height: number) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (nodes.length === 0) return;

    // Initialise positions in a circle
    const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos[n.id] = {
        x: width / 2 + (width * 0.35) * Math.cos(angle),
        y: height / 2 + (height * 0.35) * Math.sin(angle),
        vx: 0, vy: 0,
      };
    });

    const K = 80;
    const REPEL = 3000;
    const DAMP = 0.8;
    const ITERS = 200;

    for (let iter = 0; iter < ITERS; iter++) {
      // repulsion
      const ids = Object.keys(pos);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pos[ids[i]], b = pos[ids[j]];
          const dx = b.x - a.x || 0.1;
          const dy = b.y - a.y || 0.1;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = REPEL / (dist * dist);
          a.vx -= (dx / dist) * force;
          a.vy -= (dy / dist) * force;
          b.vx += (dx / dist) * force;
          b.vy += (dy / dist) * force;
        }
      }
      // attraction along edges
      edges.forEach(e => {
        const src = typeof e.source === "string" ? e.source : (e.source as any).id;
        const tgt = typeof e.target === "string" ? e.target : (e.target as any).id;
        const a = pos[src], b = pos[tgt];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - K) * 0.05 * (e.weight || 0.5);
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      });
      // gravity toward centre
      ids.forEach(id => {
        const p = pos[id];
        p.vx += (width / 2 - p.x) * 0.003;
        p.vy += (height / 2 - p.y) * 0.003;
        p.x = Math.max(30, Math.min(width - 30, p.x + p.vx * DAMP));
        p.y = Math.max(20, Math.min(height - 20, p.y + p.vy * DAMP));
        p.vx *= DAMP;
        p.vy *= DAMP;
      });
    }

    const result: Record<string, { x: number; y: number }> = {};
    Object.entries(pos).forEach(([id, v]) => { result[id] = { x: v.x, y: v.y }; });
    setPositions(result);
  }, [nodes, edges, width, height]);

  return positions;
}

const GROUP_COLORS = [
  "#7c6af7", "#4ec9b0", "#f5c842", "#e8526a",
  "#60a5fa", "#f97316", "#a78bfa", "#34d399",
];

const ConceptGraphTab: React.FC<Props> = ({ apiUrl, documents }) => {
  const { selectedIds, DocSelector } = useDocSelector(documents);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 700, H = 480;
  const positions = useForceGraph(nodes, edges, W, H);

  const run = async () => {
    if (selectedIds.length === 0) { setError("Select at least one document."); return; }
    setError(""); setLoading(true); setNodes([]); setEdges([]);
    try {
      const res = await axios.post(`${apiUrl}/api/analysis/concept-graph`, {
        document_ids: selectedIds,
      });
      setNodes(res.data.nodes || []);
      setEdges(res.data.edges || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message);
    } finally { setLoading(false); }
  };

  // Build group → colour map
  const groups = Array.from(new Set(nodes.map(n => n.group)));
  const groupColor = (g: string) => GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length];

  const nodePos = (id: string) => positions[id] || { x: W / 2, y: H / 2 };

  return (
    <div>
      <DocSelector />
      {error && <div style={{ color: "var(--accent4)", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
      <button className="run-btn" onClick={run} disabled={loading || selectedIds.length === 0}>
        {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Building…</> : "◎ Build Concept Graph"}
      </button>

      {loading && <div className="loader"><div className="spinner" />Extracting concepts and relationships…</div>}

      {nodes.length > 0 && Object.keys(positions).length > 0 && (
        <>
          <div className="graph-container">
            <svg ref={svgRef} className="graph-svg" viewBox={`0 0 ${W} ${H}`}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0,8 3,0 6" fill="var(--border2)" />
                </marker>
              </defs>

              {/* edges */}
              {edges.map((e, i) => {
                const src = typeof e.source === "string" ? e.source : (e.source as any).id;
                const tgt = typeof e.target === "string" ? e.target : (e.target as any).id;
                const a = nodePos(src), b = nodePos(tgt);
                const highlighted = hovered && (src === hovered || tgt === hovered);
                return (
                  <g key={i}>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={highlighted ? "var(--accent)" : "var(--border2)"}
                      strokeWidth={highlighted ? 2 : 1}
                      strokeOpacity={highlighted ? 0.9 : 0.4}
                      markerEnd="url(#arrow)"
                    />
                    {highlighted && e.label && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 4}
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--text3)"
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* nodes */}
              {nodes.map(n => {
                const p = nodePos(n.id);
                const r = 6 + n.weight * 3;
                const col = groupColor(n.group);
                const isHov = hovered === n.id;
                return (
                  <g
                    key={n.id}
                    className="graph-node"
                    transform={`translate(${p.x},${p.y})`}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <circle
                      r={isHov ? r + 3 : r}
                      fill={col}
                      fillOpacity={isHov ? 0.95 : 0.7}
                      stroke={col}
                      strokeWidth={isHov ? 2 : 1}
                    />
                    <text
                      dy={r + 12}
                      textAnchor="middle"
                      fontSize={isHov ? "11" : "9"}
                      fill={isHov ? "var(--text)" : "var(--text2)"}
                      fontWeight={isHov ? "600" : "400"}
                    >
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="graph-legend">
            {groups.map((g, i) => (
              <div key={g} className="graph-legend-item">
                <div className="legend-dot" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                {documents.find(d => d.id === g)?.filename || g}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ConceptGraphTab;
