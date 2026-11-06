"use client";

import { useState, useEffect } from "react";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--color-ink)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 6,
};

function cap(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function LinkProjectModal({
  customerId, onClose, onLinked,
}: {
  customerId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.json())
      .then(d => { setProjects(d.projects ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleLink() {
    if (!selected) return;
    setSaving(true); setError(null);
    const res = await fetch(`/api/projects/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to link"); setSaving(false); return; }
    onLinked();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 28, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Link Project</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", textAlign: "center", padding: "20px 0" }}>Loading projects…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Select Project</label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                style={{ ...inputStyle, appearance: "none" as const }}
              >
                <option value="">— Choose a project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({cap(p.status)})</option>
                ))}
              </select>
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleLink}
                disabled={!selected || saving}
                style={{ padding: "9px 20px", borderRadius: 10, background: (!selected || saving) ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: (!selected || saving) ? "not-allowed" : "pointer" }}
              >
                {saving ? "Linking…" : "Link Project"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
