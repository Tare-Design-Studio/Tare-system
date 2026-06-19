"use client";

import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/atoms";

type Recipient = {
  user_id: string;
  is_acknowledged: boolean;
  users: { id: string; full_name: string } | null;
};

type Broadcast = {
  id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  users: { id: string; full_name: string } | null;
  owner_broadcast_recipients: Recipient[];
};

type TeamMember = { id: string; full_name: string };
type BroadcastProject = { id: string; name: string; memberIds: string[] };

interface Props {
  broadcasts: Broadcast[];
  teamMembers: TeamMember[];
  projects?: BroadcastProject[];
  canCompose: boolean;
  currentUserId: string;
  refreshLimit?: number;
  nowMs: number;
}

// `nowMs` (server clock) is passed in so the relative time renders identically
// on server and client — calling Date.now() here would break hydration.
function timeAgo(iso: string, nowMs: number) {
  const diff = nowMs - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BroadcastsPanel({ broadcasts: initial, teamMembers, projects = [], canCompose, currentUserId, refreshLimit = 10, nowMs }: Props) {
  const [broadcasts, setBroadcasts] = useState(initial);
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const namesRef = useRef<HTMLDivElement>(null);

  // Close the names dropdown on outside click / Escape.
  useEffect(() => {
    if (!namesOpen) return;
    function onDocClick(e: MouseEvent) {
      if (namesRef.current && !namesRef.current.contains(e.target as Node)) setNamesOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setNamesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [namesOpen]);

  function startEdit(b: Broadcast) {
    setEditingId(b.id);
    setEditDraft(b.body);
  }

  async function saveEdit(id: string) {
    if (!editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    const res = await fetch(`/api/broadcasts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editDraft.trim() }),
    });
    setSavingEdit(false);
    if (res.ok) {
      setBroadcasts(prev => prev.map(b =>
        b.id === id ? { ...b, body: editDraft.trim(), edited_at: new Date().toISOString() } : b
      ));
      setEditingId(null);
    }
  }

  function toggleMember(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Picking a project preselects only its assigned members (that exist in the pill
  // list), so the owner can broadcast straight to a project team.
  function selectProject(projectId: string) {
    if (!projectId) { setSelected([]); return; }
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    const known = new Set(teamMembers.map(m => m.id));
    setSelected(proj.memberIds.filter(id => known.has(id)));
  }

  async function sendBroadcast() {
    if (!body.trim() || selected.length === 0) return;
    setSending(true);
    const res = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), recipient_ids: selected }),
    });
    if (res.ok) {
      setSent(true);
      setBody("");
      setSelected([]);
      setTimeout(() => setSent(false), 3000);
      // Refresh list
      const listRes = await fetch(`/api/broadcasts?limit=${refreshLimit}`);
      if (listRes.ok) {
        const { broadcasts: fresh } = await listRes.json();
        setBroadcasts(fresh);
      }
    }
    setSending(false);
  }

  async function ack(broadcastId: string) {
    await fetch(`/api/broadcasts/${broadcastId}/ack`, { method: "PATCH" });
    setBroadcasts(prev => prev.map(b => b.id === broadcastId ? {
      ...b,
      owner_broadcast_recipients: b.owner_broadcast_recipients.map(r =>
        r.user_id === currentUserId ? { ...r, is_acknowledged: true } : r
      ),
    } : b));
  }

  const myUnacked = broadcasts.filter(b =>
    b.owner_broadcast_recipients.some(r => r.user_id === currentUserId && !r.is_acknowledged)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Compose (Owner only) */}
      {canCompose && (
        <div style={{ padding: "14px", borderRadius: 12, background: "#cce5e0", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>Compose Broadcast</div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Type your broadcast…"
            rows={2}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-line)",
              background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
              resize: "none", lineHeight: 1.5, boxSizing: "border-box", color: "#000",
            }}
          />
          {projects.length > 0 && (
            <select
              defaultValue=""
              onChange={e => selectProject(e.target.value)}
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-line)",
                background: "var(--color-paper-light)", fontSize: 12, fontFamily: "inherit", color: "#000",
              }}
            >
              <option value="">Send to a project team…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {/* Recipients dropdown — multi-select by name instead of a long pill row */}
          <div ref={namesRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setNamesOpen(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-line)",
                background: "var(--color-paper-light)", fontSize: 12, fontFamily: "inherit", color: "#000", cursor: "pointer",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selected.length === 0
                  ? "Select recipients…"
                  : selected.length === teamMembers.length
                    ? "Everyone"
                    : `${selected.length} selected`}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {namesOpen && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
                  maxHeight: 220, overflowY: "auto", padding: 6, borderRadius: 10,
                  background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
                  boxShadow: "0 8px 24px -8px rgba(30,28,24,.28)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelected(selected.length === teamMembers.length ? [] : teamMembers.map(m => m.id))}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 7,
                    border: "none", background: "transparent", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    color: "var(--color-forest)", cursor: "pointer",
                  }}
                >
                  {selected.length === teamMembers.length ? "Clear all" : "Select all"}
                </button>
                {teamMembers.map(m => {
                  const on = selected.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                        padding: "7px 8px", borderRadius: 7, border: "none", background: "transparent",
                        fontSize: 12, fontFamily: "inherit", color: "#000", cursor: "pointer",
                      }}
                    >
                      <span style={{
                        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                        border: on ? "none" : "1px solid var(--color-line)",
                        background: on ? "var(--color-ink)" : "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </span>
                      {m.full_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            onClick={sendBroadcast}
            disabled={sending || !body.trim() || selected.length === 0}
            style={{
              alignSelf: "flex-start", padding: "7px 14px", borderRadius: 9, background: "var(--color-ink)",
              color: "#F3EFE7", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
              opacity: (sending || !body.trim() || selected.length === 0) ? 0.5 : 1,
            }}
          >
            {sending ? "Sending…" : "Send Broadcast"}
          </button>
          {sent && <div style={{ fontSize: 12, color: "var(--color-forest)" }}>Broadcast sent.</div>}
        </div>
      )}

      {/* Unacked (recipient view) */}
      {myUnacked.length > 0 && !canCompose && (
        <div>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Requires Acknowledgment</div>
          {myUnacked.map(b => (
            <div key={b.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#FEF3C7", border: "1px solid #FCD34D", marginBottom: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{b.body}</div>
              <button
                onClick={() => ack(b.id)}
                style={{ padding: "10px 16px", minHeight: 44, borderRadius: 7, background: "var(--color-ink)", color: "#F3EFE7", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {broadcasts.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic" }}>No broadcasts yet.</div>
        )}
        {broadcasts.map(b => {
          const acked = b.owner_broadcast_recipients.filter(r => r.is_acknowledged).length;
          const total = b.owner_broadcast_recipients.length;
          const myRow = b.owner_broadcast_recipients.find(r => r.user_id === currentUserId);
          const isMine = b.users?.id === currentUserId;
          const isEditing = editingId === b.id;
          return (
            <div key={b.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)" }}>
              {isEditing ? (
                <div style={{ marginBottom: 6 }}>
                  <textarea
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    rows={2}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--color-line)", fontSize: 13, fontFamily: "inherit",
                      resize: "vertical", lineHeight: 1.5,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={savingEdit}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--color-line)", background: "transparent", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(b.id)}
                      disabled={savingEdit}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: "var(--color-ink)", color: "#F3EFE7", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                    >
                      {savingEdit ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, marginBottom: 6, fontWeight: 500 }}>{b.body}</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>
                  {timeAgo(b.created_at, nowMs)}{b.edited_at ? " · edited" : ""}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {isMine && !isEditing && (
                    <button
                      onClick={() => startEdit(b)}
                      style={{ padding: "3px 8px", borderRadius: 7, border: "1px solid var(--color-line)", background: "transparent", fontSize: 10, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "var(--color-tan)" }}
                    >
                      Edit
                    </button>
                  )}
                  {myRow && !myRow.is_acknowledged && !canCompose && (
                    <button
                      onClick={() => ack(b.id)}
                      style={{ padding: "8px 12px", minHeight: 44, borderRadius: 7, background: "var(--color-amber)", color: "#FFF", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer" }}
                    >
                      Ack
                    </button>
                  )}
                  {total > 0 && (
                    <Chip label={`${acked}/${total} ack`} tone={acked === total ? "mint" : "amber"} size="sm" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
