"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Avatar, Chip } from "@/components/atoms";
import { createClient } from "@/lib/supabase/client";
import { useChatBadge, type ChatConversation } from "@/components/chat/ChatBadgeProvider";
import AttachmentView, { CHAT_ACCEPT, type Attachment } from "@/components/chat/AttachmentView";

type User = { id: string; full_name: string; role: string };
type Peer = { id: string; full_name: string; role: string };



type Message = {
  id: string;
  message_type: string;
  body: string | null;
  structured_payload: Record<string, unknown> | null;
  created_at: string;
  author_id: string;
  reply_to_id: string | null;
  attachment_id: string | null;
  users: User | null;
  reply_to: { id: string; body: string | null; message_type: string; users: { full_name: string } | null } | null;
  attachment: Attachment | null;
};

type Project = { id: string; name: string; whatsapp_group_url: string | null };

function roleTone(role: string): "forest" | "amber" | "ink" | "teal" | "indigo" {
  if (role === "site_engineer") return "amber";
  if (role === "owner") return "ink";
  if (role === "team_member") return "forest";
  return "teal";
}

function roleLabel(role: string) {
  if (role === "site_engineer") return "Site Engineer";
  if (role === "owner") return "Principal";
  return "Team Member";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initialsOf(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function MessageBubble({
  msg, isMine, onReply,
}: {
  msg: Message; isMine: boolean; onReply: (m: Message) => void;
}) {
  const author = msg.users;
  const tone = author ? roleTone(author.role) : "ink";
  const name = author?.full_name ?? "Unknown";

  const bubbleBase: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: isMine ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
    fontSize: 13,
    lineHeight: 1.6,
    background: isMine ? "var(--color-forest)" : "var(--color-paper-light)",
    color: isMine ? "#FFF" : "var(--color-ink)",
    border: isMine ? "none" : "1px solid var(--color-line)",
  };

  return (
    <div style={{ display: "flex", gap: 12, flexDirection: isMine ? "row-reverse" : "row" }}>
      <Avatar initials={initialsOf(name)} tone={tone} size={32} />
      <div style={{ flex: 1, minWidth: 0, maxWidth: "78%" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap",
          flexDirection: isMine ? "row-reverse" : "row",
        }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{isMine ? "You" : name}</span>
          {author && !isMine && <Chip size="sm" tone={tone} label={roleLabel(author.role)} />}
          <span style={{ fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>
            {formatTime(msg.created_at)}
          </span>
          <button
            onClick={() => onReply(msg)}
            title="Reply"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              color: "var(--color-tan)", fontSize: 11, textDecoration: "underline",
            }}
          >
            Reply
          </button>
        </div>

        {/* Quoted message. Deliberately shows the original's author and a
            truncated body — enough to know what is being answered. */}
        {msg.reply_to && (
          <div style={{
            padding: "6px 10px", marginBottom: 4,
            borderLeft: "3px solid var(--color-tan)",
            background: "rgba(30,28,24,.04)",
            borderRadius: 6, fontSize: 12, color: "var(--color-tan)",
          }}>
            <strong style={{ fontSize: 11 }}>{msg.reply_to.users?.full_name ?? "Unknown"}</strong>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {msg.reply_to.body ?? "Attachment"}
            </div>
          </div>
        )}

        {msg.attachment && (
          <div style={{ marginBottom: msg.body ? 6 : 0 }}>
            <AttachmentView attachment={msg.attachment} maxImageWidth={260} />
          </div>
        )}

        {msg.message_type === "material_request" ? (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "#FEF3C7", border: "1px solid #FCD34D", fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: "#92400E" }}>Material Request</div>
            <div style={{ color: "#78350F" }}>
              {String(msg.structured_payload?.item_name ?? "")} · {String(msg.structured_payload?.quantity ?? "")} {String(msg.structured_payload?.unit ?? "")}
            </div>
            {msg.body && <div style={{ marginTop: 6, color: "#92400E", fontSize: 12 }}>{msg.body}</div>}
          </div>
        ) : msg.message_type === "clarification" ? (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "#EDE9FE", border: "1px solid #C4B5FD", fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: "#5B21B6" }}>Clarification</div>
            <div style={{ color: "#4C1D95" }}>{msg.body}</div>
          </div>
        ) : msg.message_type === "drawing_ref" ? (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "var(--color-paper-light)", border: "1px solid var(--color-line)", fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Drawing Reference</div>
            <div>{msg.body}</div>
          </div>
        ) : msg.body ? (
          <div style={bubbleBase}>{msg.body}</div>
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  projects: Project[];
  currentUserId: string;
}

export function BridgeClient({ projects, currentUserId }: Props) {
  const { conversations, markRead, refresh } = useChatBadge();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgType, setMsgType] = useState<"text" | "material_request" | "clarification">("text");
  const [body, setBody] = useState("");
  const [matItem, setMatItem] = useState("");
  const [matQty, setMatQty] = useState("");
  const [matUnit, setMatUnit] = useState("bags");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peerFilter, setPeerFilter] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerSeen, setPeerSeen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // A rejected file (wrong type, over 10 MB) previously failed silently.
  const [uploadError, setUploadError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabaseRef = useRef(createClient());
  // Throttles the typing broadcast; see the presence effect below.
  const lastTypingSentRef = useRef(0);

  const active = useMemo(
    () => conversations.find((c) => c.conversation_id === activeId) ?? null,
    [conversations, activeId],
  );

  const projectMeta = useMemo(() => {
    if (!active?.project_id) return null;
    return projects.find((p) => p.id === active.project_id) ?? null;
  }, [active, projects]);

  // Default to the busiest thread rather than an arbitrary first project: on
  // open, the thread someone is waiting on is the one worth showing.
  useEffect(() => {
    if (activeId || conversations.length === 0) return;
    const withUnread = conversations.find((c) => c.unread > 0);
    setActiveId((withUnread ?? conversations[0]).conversation_id);
  }, [conversations, activeId]);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      markRead(conversationId);
      await fetch("/api/chat/reads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      }).catch(() => {});
    },
    [markRead],
  );

  // Load a thread. Aborts on switch so a slow response cannot overwrite the
  // newer conversation's messages.
  useEffect(() => {
    if (!activeId) return;
    setLoading(true);
    setReplyTo(null);
    setPeerSeen(false);
    setPeerTyping(false);
    const ctrl = new AbortController();

    fetch(`/api/chat/messages?conversation_id=${activeId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch((err) => { if (err?.name !== "AbortError") setMessages([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });

    markConversationRead(activeId);
    return () => ctrl.abort();
  }, [activeId, markConversationRead]);

  // Live messages for the open thread. The badge provider counts unread
  // app-wide; this appends to the thread on screen.
  useEffect(() => {
    if (!activeId) return;
    const sb = supabaseRef.current;
    const channel = sb
      .channel(`thread_${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT", schema: "public", table: "bridge_messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; author_id: string };
          // Own messages are already appended optimistically by send().
          if (row.author_id === currentUserId) return;
          // The realtime row carries no joins, so the full shape is refetched.
          const res = await fetch(`/api/chat/messages?conversation_id=${activeId}&limit=1`);
          if (!res.ok) return;
          const d = await res.json();
          const latest: Message | undefined = (d.messages ?? []).at(-1);
          if (!latest) return;
          setMessages((prev) => (prev.some((m) => m.id === latest.id) ? prev : [...prev, latest]));
          // Reading it as it arrives keeps the badge honest for an open thread.
          markConversationRead(activeId);
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [activeId, currentUserId, markConversationRead]);

  // Typing and seen, DMs only, over ephemeral broadcast: no rows are written
  // and nothing is stored. A DM thread that nobody has open costs nothing.
  useEffect(() => {
    if (!activeId || active?.kind !== "dm") return;
    const sb = supabaseRef.current;
    const channel = sb.channel(`presence_${activeId}`, { config: { broadcast: { self: false } } });

    channel
      .on("broadcast", { event: "typing" }, () => {
        setPeerTyping(true);
        window.setTimeout(() => setPeerTyping(false), 3000);
      })
      .on("broadcast", { event: "seen" }, () => setPeerSeen(true))
      .subscribe((status) => {
        // Announce having read the thread once the channel is live.
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event: "seen", payload: {} });
        }
      });

    return () => { sb.removeChannel(channel); };
  }, [activeId, active?.kind]);

  const broadcastTyping = useCallback(() => {
    if (!activeId || active?.kind !== "dm") return;
    const now = Date.now();
    // One event per 2s at most — a send per keystroke is what makes typing
    // indicators expensive.
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    supabaseRef.current
      .channel(`presence_${activeId}`)
      .send({ type: "broadcast", event: "typing", payload: {} });
  }, [activeId, active?.kind]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function openPicker() {
    setShowPicker(true);
    if (peers.length === 0) {
      const res = await fetch("/api/chat/peers");
      if (res.ok) setPeers((await res.json()).peers ?? []);
    }
  }

  async function startDm(peerId: string) {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer_id: peerId }),
    });
    if (!res.ok) return;
    const { conversation_id } = await res.json();
    setShowPicker(false);
    setPeerFilter("");
    // The thread may be brand new, so the list has to come back from the
    // server before it can be selected.
    await refresh();
    setActiveId(conversation_id);
  }

  async function uploadAndSend(file: File) {
    if (!activeId) return;
    setUploadError(null);
    setUploading(true);
    const form = new FormData();
    form.append("conversation_id", activeId);
    form.append("file", file);

    const up = await fetch("/api/chat/attachments", { method: "POST", body: form });
    if (!up.ok) {
      const { error } = await up.json().catch(() => ({ error: null }));
      setUploadError(error ?? "Upload failed");
      setUploading(false);
      return;
    }
    // `kind` is decided by the upload route ('image' or 'file'), so the message
    // type matches what was actually stored. Hardcoding "image" here is what
    // made a PDF arrive tagged as an image.
    const { data: att, kind } = await up.json();

    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: activeId,
        message_type: kind === "image" ? "image" : "file",
        attachment_id: att.id,
        body: body.trim() || undefined,
        reply_to_id: replyTo?.id,
      }),
    });
    if (res.ok) {
      const { data } = await res.json();
      setMessages((prev) => [...prev, data]);
      setBody("");
      setReplyTo(null);
    }
    setUploading(false);
  }

  async function send() {
    if (!activeId) return;
    if (msgType === "text" && !body.trim()) return;
    if (msgType === "material_request" && !matItem.trim()) return;
    setSending(true);

    const payload: Record<string, unknown> = {
      conversation_id: activeId,
      message_type: msgType,
      reply_to_id: replyTo?.id,
    };
    if (msgType === "text" || msgType === "clarification") {
      payload.body = body.trim();
    } else if (msgType === "material_request") {
      payload.structured_payload = {
        item_name: matItem.trim(), quantity: Number(matQty) || 1, unit: matUnit,
      };
      if (body.trim()) payload.body = body.trim();
    }

    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const { data } = await res.json();
      setMessages((prev) => [...prev, data]);
      setBody("");
      setMatItem("");
      setMatQty("");
      setReplyTo(null);
      setPeerSeen(false);
    }
    setSending(false);
  }

  const dmList = conversations.filter((c) => c.kind === "dm");
  const projectList = conversations.filter((c) => c.kind === "project");
  const filteredPeers = peers.filter((p) =>
    p.full_name.toLowerCase().includes(peerFilter.toLowerCase()),
  );

  function ConversationRow({ c }: { c: ChatConversation }) {
    const isActive = c.conversation_id === activeId;
    return (
      <button
        onClick={() => setActiveId(c.conversation_id)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer",
          background: isActive ? "var(--color-ink)" : "transparent",
          color: isActive ? "#F3EFE7" : "var(--color-ink)",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: c.unread > 0 ? 700 : 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.title ?? "Untitled"}
          </div>
          {c.preview && (
            <div style={{
              fontSize: 11, color: isActive ? "rgba(243,239,231,.7)" : "var(--color-tan)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {c.preview}
            </div>
          )}
        </div>
        {c.unread > 0 && (
          <span style={{
            minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9,
            background: "var(--color-rust, #B4451F)", color: "#FFF",
            fontSize: 10, fontWeight: 700, lineHeight: "18px", textAlign: "center",
            fontVariantNumeric: "tabular-nums", flexShrink: 0,
          }}>
            {c.unread > 99 ? "99+" : c.unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="bridge-layout" style={{ display: "flex", gap: 16, height: "calc(100vh - 180px)", minHeight: 500 }}>
      <style>{`
        @media (max-width: 767px) {
          .bridge-layout { flex-direction: column !important; height: auto !important; min-height: 0 !important; }
          .bridge-rail { width: 100% !important; flex-shrink: 1 !important; max-height: 240px; }
          .bridge-thread { height: calc(100vh - 400px) !important; min-height: 340px; }
        }
      `}</style>

      {/* Conversation list */}
      <div className="bridge-rail" style={{
        width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4,
        background: "var(--color-paper-light)", borderRadius: 16, padding: 12,
        border: "1px solid var(--color-line)", overflowY: "auto",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 6, paddingLeft: 4,
        }}>
          <span style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1.2 }}>
            Direct
          </span>
          <button
            onClick={openPicker}
            title="New message"
            style={{
              width: 22, height: 22, borderRadius: 7, border: "none", cursor: "pointer",
              background: "var(--color-ink)", color: "#F3EFE7", fontSize: 14, lineHeight: "22px",
            }}
          >
            +
          </button>
        </div>

        {dmList.length === 0 && !showPicker && (
          <div style={{ fontSize: 12, color: "var(--color-tan)", padding: "4px 6px 10px" }}>
            No direct messages yet.
          </div>
        )}
        {dmList.map((c) => <ConversationRow key={c.conversation_id} c={c} />)}

        {showPicker && (
          <div style={{
            marginTop: 6, padding: 8, borderRadius: 10,
            border: "1px solid var(--color-line)", background: "var(--color-paper)",
          }}>
            <input
              autoFocus
              value={peerFilter}
              onChange={(e) => setPeerFilter(e.target.value)}
              placeholder="Search people…"
              style={{
                width: "100%", padding: "6px 8px", borderRadius: 8, fontSize: 12,
                border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
                fontFamily: "inherit", marginBottom: 6,
              }}
            />
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {filteredPeers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startDm(p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "6px 8px", borderRadius: 8, border: "none",
                    background: "transparent", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <Avatar initials={initialsOf(p.full_name)} tone={roleTone(p.role)} size={22} />
                  <span style={{ fontSize: 12 }}>{p.full_name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowPicker(false); setPeerFilter(""); }}
              style={{
                marginTop: 4, fontSize: 11, background: "none", border: "none",
                color: "var(--color-tan)", cursor: "pointer", textDecoration: "underline",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div style={{
          fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase",
          letterSpacing: 1.2, margin: "12px 0 4px", paddingLeft: 4,
        }}>
          Projects
        </div>
        {projectList.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-tan)", padding: "4px 6px" }}>
            No active projects.
          </div>
        ) : (
          projectList.map((c) => <ConversationRow key={c.conversation_id} c={c} />)
        )}
      </div>

      {/* Thread */}
      <div className="bridge-thread" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
          borderRadius: 16, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid var(--color-line)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {active?.title ?? "Select a conversation"}
            </div>
            {active?.kind === "dm" && <Chip size="sm" tone="indigo" label="Direct" />}
            {active?.kind === "project" && <Chip size="sm" tone="forest" dot label="Live" />}
            {projectMeta?.whatsapp_group_url && (
              <a
                href={projectMeta.whatsapp_group_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  textDecoration: "none", background: "#25D366", color: "#fff",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.42 1.31-1.96 1.36-.5.05-.99.24-3.4-.71-2.87-1.13-4.71-4.07-4.85-4.26-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09.99-2.37.24-.26.53-.33.71-.33.18 0 .35 0 .51.01.16.01.39-.06.6.46.24.56.81 1.96.88 2.1.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.87-1.09.18-.28.37-.23.6-.14.24.09 1.5.71 1.76.84.26.13.43.19.49.3.06.11.06.65-.18 1.33z" />
                </svg>
                WhatsApp
              </a>
            )}
          </div>

          {/* Messages */}
          <div
            ref={threadRef}
            style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {loading && (
              <div style={{ textAlign: "center", color: "var(--color-tan)", fontSize: 13 }}>Loading…</div>
            )}
            {!loading && messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--color-tan)", fontSize: 13, padding: "40px 0" }}>
                No messages yet. Start the conversation.
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                isMine={m.author_id === currentUserId}
                onReply={setReplyTo}
              />
            ))}

            {peerTyping && (
              <div style={{ fontSize: 12, color: "var(--color-tan)", fontStyle: "italic" }}>
                Typing…
              </div>
            )}
            {!peerTyping && peerSeen && messages.length > 0 &&
              messages[messages.length - 1].author_id === currentUserId && (
              <div style={{ fontSize: 11, color: "var(--color-tan)", textAlign: "right" }}>
                Seen
              </div>
            )}
          </div>

          {/* Compose */}
          {active && (
            <div style={{ borderTop: "1px solid var(--color-line)", padding: 16 }}>
              {replyTo && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  padding: "6px 10px", borderRadius: 8, background: "rgba(30,28,24,.04)",
                  borderLeft: "3px solid var(--color-forest)", fontSize: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Replying to <strong>{replyTo.users?.full_name ?? "Unknown"}</strong>: {replyTo.body ?? "Image"}
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-tan)" }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Structured types are project-thread concepts — a material
                  request has no meaning in a DM. */}
              {active.kind === "project" && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {(["text", "material_request", "clarification"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMsgType(t)}
                      style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                        border: "none", cursor: "pointer",
                        background: msgType === t ? "var(--color-ink)" : "var(--bg-2, #EDE7DB)",
                        color: msgType === t ? "#F3EFE7" : "var(--color-ink)",
                      }}
                    >
                      {t === "text" ? "Text" : t === "material_request" ? "Material Request" : "Clarification"}
                    </button>
                  ))}
                </div>
              )}

              {active.kind === "project" && msgType === "material_request" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={matItem}
                    onChange={(e) => setMatItem(e.target.value)}
                    placeholder="Item name (e.g. Cement OPC 53)"
                    style={{
                      flex: 2, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                  <input
                    value={matQty}
                    onChange={(e) => setMatQty(e.target.value)}
                    placeholder="Qty"
                    type="number"
                    style={{
                      width: 70, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                  <input
                    value={matUnit}
                    onChange={(e) => setMatUnit(e.target.value)}
                    placeholder="Unit"
                    style={{
                      width: 80, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                </div>
              )}

              {uploadError && (
                <div style={{
                  marginBottom: 8, padding: "7px 10px", borderRadius: 8, fontSize: 12,
                  background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
                  color: "var(--color-rust, #C5543B)",
                }}>
                  {uploadError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={CHAT_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAndSend(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title="Attach image, PDF or drawing"
                  style={{
                    padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)",
                    background: "var(--color-paper-light)", cursor: "pointer",
                    color: "var(--color-ink)", alignSelf: "stretch", opacity: uploading ? 0.5 : 1,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); broadcastTyping(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                  placeholder={
                    uploading ? "Uploading…" :
                    msgType === "material_request" ? "Note (optional)…" :
                    msgType === "clarification" ? "Describe the clarification needed…" :
                    "Type a message… (⌘Enter to send)"
                  }
                  rows={2}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--color-line)",
                    background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    resize: "none", lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending || uploading}
                  style={{
                    padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)",
                    color: "#F3EFE7", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                    opacity: sending || uploading ? 0.6 : 1, alignSelf: "stretch",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
