"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/atoms";
import { useChatBadge, type ChatConversation } from "./ChatBadgeProvider";
import AttachmentView, { CHAT_ACCEPT, type Attachment } from "./AttachmentView";

// A floating launcher on the overview, opening a right-hand full-height drawer
// with DMs only.
//
// DM-only is the point, not a limitation: project threads have their own page
// at /bridge with project context around them, and reproducing that here would
// be a second implementation of the same screen. /bridge is untouched and still
// owns both kinds.
//
// The conversation list is NOT fetched here. ChatBadgeProvider already holds it
// for the nav badge, so the dock reads that context and costs one request for
// messages when a thread is actually opened. Closed, it is a button.

type Peer = { id: string; full_name: string; role: string };

type Message = {
  id: string;
  message_type: string;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  author_id: string;
  attachment_id: string | null;
  users: { id: string; full_name: string; role: string } | null;
  attachment: Attachment | null;
};

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ChatDock({ userId }: { userId: string }) {
  const { conversations, markRead, refresh } = useChatBadge();

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[] | null>(null);
  const [picking, setPicking] = useState(false);
  // The message being edited, and the working copy of its text. Held here
  // rather than per-bubble so opening a second edit closes the first.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());

  // DMs only — project threads stay on /bridge.
  const dms = useMemo(
    () => conversations.filter((c) => c.kind === "dm"),
    [conversations],
  );
  const active = useMemo(
    () => dms.find((c) => c.conversation_id === activeId) ?? null,
    [dms, activeId],
  );

  const dmUnread = useMemo(
    () => dms.reduce((sum, c) => sum + (c.unread ?? 0), 0),
    [dms],
  );

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/messages?conversation_id=${conversationId}`);
      if (!res.ok) throw new Error("load failed");
      const json = await res.json();
      setMessages(json.messages ?? []);
    } catch {
      setError("Could not load this conversation");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Opening a thread: zero the badge locally first so the number responds
  // immediately, then persist. Mirrors how /bridge marks a thread read.
  const openThread = useCallback(async (conversationId: string) => {
    setActiveId(conversationId);
    setPicking(false);
    setEditingId(null);
    setEditDraft("");
    markRead(conversationId);
    await loadMessages(conversationId);
    fetch("/api/chat/reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId }),
    }).catch(() => {});
  }, [markRead, loadMessages]);

  // Live messages for the thread on screen. The provider's own subscription
  // keeps the counts; this one appends to the open transcript, and only while
  // a thread is actually open.
  useEffect(() => {
    if (!open || !activeId) return;
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`chat_dock_${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT", schema: "public", table: "bridge_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        () => {
          // The realtime payload carries the raw row, without the joined author
          // or attachment the bubble needs, so this refetches rather than
          // guessing at those. Scoped to one open thread.
          loadMessages(activeId);
          fetch("/api/chat/reads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_id: activeId }),
          }).catch(() => {});
          markRead(activeId);
        },
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [open, activeId, loadMessages, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Escape closes the drawer, or steps back out of a thread first.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Innermost thing first: an open edit, then the thread, then the drawer.
      if (editingId) { cancelEdit(); return; }
      if (activeId) setActiveId(null);
      else setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeId, editingId]);

  function beginEdit(m: Message) {
    setEditingId(m.id);
    setEditDraft(m.body ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit() {
    const body = editDraft.trim();
    if (!editingId || !body || sending) return;
    // Nothing changed — close without a request so the message is not marked
    // edited for a no-op.
    const original = messages.find((m) => m.id === editingId);
    if (original && original.body === body) { cancelEdit(); return; }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: editingId, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Edit failed");
      cancelEdit();
      if (activeId) await loadMessages(activeId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not edit that message");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: activeId, body }),
      });
      if (!res.ok) throw new Error("send failed");
      setDraft("");
      await loadMessages(activeId);
      refresh();
    } catch {
      setError("Message not sent");
    } finally {
      setSending(false);
    }
  }

  async function upload(file: File) {
    if (!activeId) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("conversation_id", activeId);
      form.append("file", file);
      const up = await fetch("/api/chat/attachments", { method: "POST", body: form });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson.error ?? "Upload failed");

      // The route decides image-vs-file and says so, so the two halves cannot
      // disagree about message_type.
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeId,
          message_type: upJson.kind === "image" ? "image" : "file",
          attachment_id: upJson.data.id,
          body: draft.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Could not attach that file");
      setDraft("");
      await loadMessages(activeId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function startDm(peerId: string) {
    setError(null);
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_id: peerId }),
      });
      if (!res.ok) throw new Error("could not open");
      const { conversation_id: id } = await res.json();
      refresh();
      if (typeof id === "string") await openThread(id);
      else setPicking(false);
    } catch {
      setError("Could not start that conversation");
    }
  }

  function openPicker() {
    setPicking(true);
    setActiveId(null);
    if (peers === null) {
      fetch("/api/chat/peers")
        .then((r) => (r.ok ? r.json() : { peers: [] }))
        .then((j) => setPeers(j.peers ?? []))
        .catch(() => setPeers([]));
    }
  }

  const title = (c: ChatConversation) => c.title ?? "Direct message";

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close messages" : `Messages${dmUnread ? `, ${dmUnread} unread` : ""}`}
        className="chat-dock-launcher"
        style={{
          position: "fixed", right: 24, zIndex: 60,
          width: 52, height: 52, borderRadius: "50%",
          border: "1px solid var(--color-line)",
          background: "var(--color-ink)", color: "var(--color-paper-light)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 24px -8px rgba(27,26,23,.45)",
        }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-9 8.34 8.5 8.5 0 0 1-3.9-.94L3 20l1.1-4.1A8.38 8.38 0 0 1 3 11.5a8.5 8.5 0 0 1 9-8.34 8.38 8.38 0 0 1 9 8.34z" />
          </svg>
        )}
        {!open && dmUnread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 20, height: 20,
            padding: "0 5px", borderRadius: 20, background: "var(--color-rust)",
            color: "#FFF", fontSize: 11, fontWeight: 700, lineHeight: "20px",
            textAlign: "center", fontVariantNumeric: "tabular-nums",
            boxShadow: "0 0 0 2px var(--color-paper)",
          }}>{dmUnread > 99 ? "99+" : dmUnread}</span>
        )}
      </button>

      {!open ? null : (
        <aside
          aria-label="Messages"
          className="chat-dock-panel"
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 59,
            display: "flex", flexDirection: "column",
            background: "var(--color-paper-light)",
            borderLeft: "1px solid var(--color-line)",
            boxShadow: "-12px 0 32px -18px rgba(27,26,23,.4)",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "16px 16px 12px", borderBottom: "1px solid var(--color-line)",
          }}>
            {(activeId || picking) && (
              <button
                onClick={() => { setActiveId(null); setPicking(false); }}
                aria-label="Back to conversations"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-tan)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-serif" style={{ fontSize: 16, fontWeight: 600 }}>
                {picking ? "New message" : active ? title(active) : "Messages"}
              </div>
              {!activeId && !picking && (
                <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
                  {dmUnread > 0 ? `${dmUnread} unread` : "Direct messages"}
                </div>
              )}
            </div>
            {!activeId && !picking && (
              <button
                onClick={openPicker}
                aria-label="New message"
                style={{
                  width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                  border: "1px solid var(--color-line)", background: "var(--color-paper)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
          </div>

          {error && (
            <div style={{
              padding: "8px 16px", fontSize: 12,
              background: "var(--color-paper)", color: "var(--color-rust)",
            }}>{error}</div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: picking || !activeId ? 0 : "12px 16px" }}>
            {picking ? (
              peers === null ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--color-tan)" }}>Loading people…</div>
              ) : peers.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--color-tan)" }}>No one else here yet.</div>
              ) : (
                peers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startDm(p.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "10px 16px", background: "none", cursor: "pointer",
                      border: "none", borderBottom: "1px solid var(--color-line)", textAlign: "left",
                    }}
                  >
                    <Avatar initials={initialsOf(p.full_name)} tone="indigo" size={30} />
                    <span style={{ fontSize: 13 }}>{p.full_name}</span>
                  </button>
                ))
              )
            ) : !activeId ? (
              dms.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--color-tan)" }}>
                  No conversations yet. Use + to message someone.
                </div>
              ) : (
                dms.map((c) => (
                  <button
                    key={c.conversation_id}
                    onClick={() => openThread(c.conversation_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "12px 16px", background: "none", cursor: "pointer",
                      border: "none", borderBottom: "1px solid var(--color-line)", textAlign: "left",
                    }}
                  >
                    <Avatar initials={initialsOf(title(c))} tone="indigo" size={34} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: "block", fontSize: 13,
                        fontWeight: c.unread > 0 ? 700 : 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{title(c)}</span>
                      <span style={{
                        display: "block", fontSize: 11, color: "var(--color-tan)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{c.preview ?? "No messages yet"}</span>
                    </span>
                    {c.unread > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, padding: "0 5px", borderRadius: 18,
                        background: "var(--color-rust)", color: "#FFF", fontSize: 10,
                        fontWeight: 700, lineHeight: "18px", textAlign: "center",
                      }}>{c.unread}</span>
                    )}
                  </button>
                ))
              )
            ) : loading ? (
              <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-tan)" }}>No messages yet. Say hello.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((m) => {
                  const mine = m.author_id === userId;
                  const editing = editingId === m.id;
                  // Only your own text is editable. A message with no body is
                  // an attachment on its own — there is nothing to edit, and
                  // the RPC refuses it too.
                  const canEdit = mine && m.body !== null;
                  const meta = mine ? "rgba(251,248,242,.6)" : "var(--color-tan)";
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: editing ? "100%" : "82%",
                        width: editing ? "100%" : undefined,
                        padding: "8px 11px", borderRadius: 12,
                        border: "1px solid var(--color-line)",
                        background: mine ? "var(--color-ink)" : "var(--color-paper)",
                        color: mine ? "var(--color-paper-light)" : "inherit",
                      }}
                    >
                      {editing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <textarea
                            value={editDraft}
                            autoFocus
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                            }}
                            rows={2}
                            style={{
                              width: "100%", boxSizing: "border-box", resize: "vertical",
                              padding: "6px 8px", fontSize: 13, lineHeight: 1.45,
                              borderRadius: 8, border: "1px solid var(--color-line)",
                              background: "var(--color-paper)", color: "var(--color-ink)",
                              fontFamily: "inherit", minHeight: 56,
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={cancelEdit}
                              style={{
                                padding: "4px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer",
                                border: "1px solid var(--color-line)", background: "var(--color-paper)",
                                color: "var(--color-ink)",
                              }}
                            >Cancel</button>
                            <button
                              onClick={saveEdit}
                              disabled={sending || !editDraft.trim()}
                              style={{
                                padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                                border: "1px solid var(--color-line)",
                                background: editDraft.trim() ? "var(--color-forest)" : "var(--color-paper)",
                                color: editDraft.trim() ? "#FFF" : "var(--color-tan)",
                                cursor: sending || !editDraft.trim() ? "default" : "pointer",
                              }}
                            >{sending ? "…" : "Save"}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.body && (
                            <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {m.body}
                            </div>
                          )}
                          {m.attachment && <AttachmentView attachment={m.attachment} />}
                          <div style={{
                            fontSize: 10, marginTop: 4, display: "flex",
                            alignItems: "center", gap: 6, flexWrap: "wrap",
                            color: meta, fontFamily: "var(--font-mono)",
                          }}>
                            <span>{fmtTime(m.created_at)}</span>
                            {/* Marks the message as edited without claiming to
                                show what changed — no history is kept. */}
                            {m.edited_at && <span title={`Edited ${fmtTime(m.edited_at)}`}>· edited</span>}
                            {canEdit && (
                              <button
                                onClick={() => beginEdit(m)}
                                style={{
                                  marginLeft: "auto", padding: 0, border: "none",
                                  background: "none", cursor: "pointer",
                                  fontSize: 10, color: meta, textDecoration: "underline",
                                  fontFamily: "inherit",
                                }}
                              >Edit</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          {activeId && !picking && (
            <div style={{
              borderTop: "1px solid var(--color-line)",
              // On mobile the panel reaches the screen edge, so the composer
              // pads for the home indicator; on desktop the inset is 0.
              padding: "12px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
              display: "flex", alignItems: "flex-end", gap: 8,
            }}>
              <input
                ref={fileRef}
                type="file"
                accept={CHAT_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                title="Attach JPG, PNG, PDF or DWG"
                aria-label="Attach a file"
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  border: "1px solid var(--color-line)", background: "var(--color-paper)",
                  cursor: sending ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder="Message…"
                style={{
                  flex: 1, resize: "none", padding: "8px 10px", fontSize: 13,
                  borderRadius: 8, border: "1px solid var(--color-line)",
                  background: "var(--color-paper)", color: "inherit",
                  fontFamily: "inherit", maxHeight: 120,
                }}
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                aria-label="Send"
                style={{
                  height: 32, padding: "0 12px", borderRadius: 8, flexShrink: 0,
                  border: "1px solid var(--color-line)",
                  background: draft.trim() ? "var(--color-ink)" : "var(--color-paper)",
                  color: draft.trim() ? "var(--color-paper-light)" : "var(--color-tan)",
                  cursor: sending || !draft.trim() ? "default" : "pointer",
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
