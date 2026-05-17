"use client";

import { useState, useEffect } from "react";
import { Avatar } from "@/components/atoms";

type User = { id: string; full_name: string; role: string };

type Assignment = {
  id: string;
  role_on_project: string;
  contribution_pct: number | null;
  users: { id: string; full_name: string; role: string } | null;
};

const ROLES = [
  { value: "pm", label: "Project Manager" },
  { value: "lead_architect", label: "Lead Architect" },
  { value: "design_support", label: "Design Support" },
  { value: "drafting", label: "Drafting" },
  { value: "coordination", label: "Coordination" },
  { value: "team_member", label: "Team Member" },
  { value: "site_engineer", label: "Site Engineer" },
];

const SITE_ROLES = new Set(["site_engineer"]);

function cap(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

function initials(name: string) { return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(); }

const TONES = ["forest", "teal", "indigo", "amber", "rust", "mint"] as const;
type Tone = typeof TONES[number];
function tone(idx: number): Tone { return TONES[idx % TONES.length]; }

export default function TeamSection({
  projectId,
  initialAssignments,
  canManage,
}: {
  projectId: string;
  initialAssignments: Assignment[];
  canManage: boolean;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [tab, setTab] = useState<"team" | "site">("team");
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("team_member");
  const [pct, setPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (showAdd && users.length === 0) {
      fetch("/api/users").then(r => r.json()).then(d => setUsers(d.users ?? []));
    }
  }, [showAdd, users.length]);

  const teamMembers = assignments.filter(a => !SITE_ROLES.has(a.role_on_project));
  const siteEngineers = assignments.filter(a => SITE_ROLES.has(a.role_on_project));
  const displayed = tab === "team" ? teamMembers : siteEngineers;

  async function handleAdd() {
    if (!selectedUser) return;
    setSaving(true); setError(null);
    const body: Record<string, unknown> = { user_id: selectedUser, role_on_project: selectedRole };
    if (pct) body.contribution_pct = Number(pct);
    const res = await fetch(`/api/projects/${projectId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); setSaving(false); return; }
    // Re-fetch assignments
    const refresh = await fetch(`/api/projects/${projectId}/assignments`);
    if (refresh.ok) {
      const rd = await refresh.json();
      setAssignments(rd.assignments ?? []);
    }
    setSelectedUser(""); setPct(""); setShowAdd(false); setSaving(false);
  }

  async function handleRemove(assignmentId: string) {
    if (!confirm("Remove this assignment?")) return;
    await fetch(`/api/projects/${projectId}/assignments?assignment_id=${assignmentId}`, { method: "DELETE" });
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
  }

  const inputSm: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 9, border: "1px solid var(--color-line)",
    background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
    color: "var(--color-ink)", outline: "none",
  };

  return (
    <div>
      {/* Tab toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", background: "var(--color-bg)", borderRadius: 10, padding: 3, gap: 2 }}>
          {(["team", "site"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                background: tab === t ? "var(--color-paper-light)" : "transparent",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                color: tab === t ? "var(--color-ink)" : "var(--color-tan)",
              }}
            >
              {t === "team" ? `Team (${teamMembers.length})` : `Site Engineers (${siteEngineers.length})`}
            </button>
          ))}
        </div>
        {canManage && (
          <button
            onClick={() => { setShowAdd(v => !v); setSelectedRole(tab === "site" ? "site_engineer" : "team_member"); }}
            style={{ padding: "6px 14px", borderRadius: 9, background: "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            + Assign
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && canManage && (
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--color-bg)", border: "1px solid var(--color-line)", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} style={{ ...inputSm, flex: "1 1 160px" }}>
              <option value="">— Select person —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} style={{ ...inputSm, flex: "1 1 140px" }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input
              type="number" min="0" max="100" placeholder="% (opt)"
              value={pct} onChange={e => setPct(e.target.value)}
              style={{ ...inputSm, width: 90 }}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: "var(--color-rust)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} disabled={!selectedUser || saving} style={{ padding: "7px 16px", borderRadius: 9, background: (!selectedUser || saving) ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 12, fontWeight: 600, border: "none", cursor: (!selectedUser || saving) ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Assign"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", fontSize: 12, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Member list */}
      {displayed.length === 0 ? (
        <p style={{ color: "var(--color-tan)", fontSize: 13, fontStyle: "italic" }}>
          No {tab === "site" ? "site engineers" : "team members"} assigned.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayed.map((a, idx) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: idx < displayed.length - 1 ? "1px solid var(--color-line)" : "none" }}>
              <Avatar initials={initials(a.users?.full_name ?? "?")} tone={tone(idx)} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.users?.full_name ?? "Unknown"}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)" }}>{cap(a.role_on_project)}</div>
              </div>
              {a.contribution_pct !== null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--color-tan)" }}>{a.contribution_pct}%</span>
              )}
              {canManage && (
                <button
                  onClick={() => handleRemove(a.id)}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-tan)", fontSize: 11 }}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {teamMembers.length > 0 && tab === "team" && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>
          {assignments.reduce((s, a) => s + (a.contribution_pct ?? 0), 0).toFixed(0)}% total allocated
        </div>
      )}
    </div>
  );
}
