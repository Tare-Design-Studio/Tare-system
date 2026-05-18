"use client";

import { useState } from "react";
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

interface Props {
  broadcasts: Broadcast[];
  teamMembers: TeamMember[];
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

export function BroadcastsPanel({ broadcasts: initial, teamMembers, canCompose, currentUserId, refreshLimit = 10, nowMs }: Props) {
  const [broadcasts, setBroadcasts] = useState(initial);
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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
              resize: "none", lineHeight: 1.5, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {teamMembers.map(m => (
              <button
                key={m.id}
                onClick={() => toggleMember(m.id)}
                style={{
                  padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 500, border: "none", cursor: "pointer",
                  background: selected.includes(m.id) ? "var(--color-ink)" : "var(--color-paper-light)",
                  color: selected.includes(m.id) ? "#F3EFE7" : "var(--color-ink)",
                }}
              >
                {m.full_name.split(" ")[0]}
              </button>
            ))}
            <button
              onClick={() => setSelected(teamMembers.map(m => m.id))}
              style={{ padding: "3px 8px", borderRadius: 8, fontSize: 11, border: "none", cursor: "pointer", background: "transparent", color: "var(--color-tan)", textDecoration: "underline" }}
            >
              All
            </button>
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
