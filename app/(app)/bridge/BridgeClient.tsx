"use client";

import { useState, useRef, useEffect } from "react";
import { Avatar, Chip } from "@/components/atoms";

type User = { id: string; full_name: string; role: string };
type Project = { id: string; name: string; whatsapp_group_url: string | null };

type Message = {
  id: string;
  message_type: string;
  body: string | null;
  structured_payload: Record<string, unknown> | null;
  created_at: string;
  users: User | null;
};

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

function MessageBubble({ msg }: { msg: Message }) {
  const author = msg.users;
  const tone = author ? roleTone(author.role) : "ink";
  const name = author?.full_name ?? "Unknown";
  const initials = name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("");

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Avatar initials={initials} tone={tone} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
          {author && (
            <Chip size="sm" tone={tone} label={roleLabel(author.role)} />
          )}
          <span style={{ fontSize: 11, color: "var(--color-tan)", marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
            {formatTime(msg.created_at)}
          </span>
        </div>

        {msg.message_type === "text" && (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "var(--color-paper-light)", fontSize: 13, lineHeight: 1.6,
            border: "1px solid var(--color-line)",
          }}>
            {msg.body}
          </div>
        )}

        {msg.message_type === "material_request" && (
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
        )}

        {msg.message_type === "clarification" && (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "#EDE9FE", border: "1px solid #C4B5FD", fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: "#5B21B6" }}>Clarification</div>
            <div style={{ color: "#4C1D95" }}>{msg.body}</div>
          </div>
        )}

        {msg.message_type === "drawing_ref" && (
          <div style={{
            padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
            background: "var(--color-paper-light)", border: "1px solid var(--color-line)", fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Drawing Reference</div>
            <div>{msg.body}</div>
            {msg.structured_payload?.drawing_id != null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 4, color: "var(--color-tan)" }}>
                #{String(msg.structured_payload.drawing_id)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  projects: Project[];
  currentUserId: string;
}

export function BridgeClient({ projects, currentUserId }: Props) {
  const [activeProject, setActiveProject] = useState<Project | null>(projects[0] ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgType, setMsgType] = useState<"text" | "material_request" | "clarification">("text");
  const [body, setBody] = useState("");
  const [matItem, setMatItem] = useState("");
  const [matQty, setMatQty] = useState("");
  const [matUnit, setMatUnit] = useState("bags");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeProject) return;
    setLoading(true);
    // Abort on project switch so a slow response can't overwrite the newer
    // project's messages (out-of-order race).
    const ctrl = new AbortController();
    fetch(`/api/projects/${activeProject.id}/bridge`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(err => { if (err?.name !== "AbortError") setMessages([]); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [activeProject]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    if (!activeProject) return;
    if (msgType === "text" && !body.trim()) return;
    if (msgType === "material_request" && !matItem.trim()) return;
    setSending(true);

    const payload: Record<string, unknown> = { message_type: msgType };
    if (msgType === "text" || msgType === "clarification") {
      payload.body = body.trim();
    } else if (msgType === "material_request") {
      payload.structured_payload = { item_name: matItem.trim(), quantity: Number(matQty) || 1, unit: matUnit };
      if (body.trim()) payload.body = body.trim();
    }

    const res = await fetch(`/api/projects/${activeProject.id}/bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const { data } = await res.json();
      setMessages(prev => [...prev, data]);
      setBody("");
      setMatItem("");
      setMatQty("");
    }
    setSending(false);
  }

  return (
    <div className="bridge-layout" style={{ display: "flex", gap: 16, height: "calc(100vh - 180px)", minHeight: 500 }}>
      <style>{`
        @media (max-width: 767px) {
          .bridge-layout { flex-direction: column !important; height: auto !important; min-height: 0 !important; }
          .bridge-rail { width: 100% !important; flex-shrink: 1 !important; }
          .bridge-thread { height: calc(100vh - 320px) !important; min-height: 340px; }
        }
      `}</style>
      {/* Project selector dropdown (B6) */}
      <div className="bridge-rail" style={{
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6,
        background: "var(--color-paper-light)", borderRadius: 16, padding: 12,
        border: "1px solid var(--color-line)",
      }}>
        <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4, paddingLeft: 4 }}>
          Project
        </div>
        {projects.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", padding: "8px 4px" }}>No active projects.</div>
        ) : (
          <select
            value={activeProject?.id ?? ""}
            onChange={(e) => {
              const p = projects.find((pr) => pr.id === e.target.value);
              if (p) setActiveProject(p);
            }}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              fontSize: 13, fontWeight: 500, fontFamily: "inherit",
              border: "1px solid var(--color-line)", background: "var(--color-paper)",
              color: "var(--color-ink)", cursor: "pointer", appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239C9585' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 32,
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
              {activeProject?.name ?? "Select a project"}
            </div>
            {activeProject && <Chip size="sm" tone="forest" dot label="Live" />}
            {activeProject?.whatsapp_group_url && (
              <a
                href={activeProject.whatsapp_group_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  textDecoration: "none", background: "#25D366", color: "#fff",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.13c-.24.68-1.42 1.31-1.96 1.36-.5.05-.99.24-3.4-.71-2.87-1.13-4.71-4.07-4.85-4.26-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09.99-2.37.24-.26.53-.33.71-.33.18 0 .35 0 .51.01.16.01.39-.06.6.46.24.56.81 1.96.88 2.1.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.87-1.09.18-.28.37-.23.6-.14.24.09 1.5.71 1.76.84.26.13.43.19.49.3.06.11.06.65-.18 1.33z"/>
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
            {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
          </div>

          {/* Compose */}
          {activeProject && (
            <div style={{ borderTop: "1px solid var(--color-line)", padding: 16 }}>
              {/* Type selector */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {(["text", "material_request", "clarification"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setMsgType(t)}
                    style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, border: "none", cursor: "pointer",
                      background: msgType === t ? "var(--color-ink)" : "var(--bg-2, #EDE7DB)",
                      color: msgType === t ? "#F3EFE7" : "var(--color-ink)",
                    }}
                  >
                    {t === "text" ? "Text" : t === "material_request" ? "Material Request" : "Clarification"}
                  </button>
                ))}
              </div>

              {msgType === "material_request" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={matItem}
                    onChange={e => setMatItem(e.target.value)}
                    placeholder="Item name (e.g. Cement OPC 53)"
                    style={{
                      flex: 2, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                  <input
                    value={matQty}
                    onChange={e => setMatQty(e.target.value)}
                    placeholder="Qty"
                    type="number"
                    style={{
                      width: 70, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                  <input
                    value={matUnit}
                    onChange={e => setMatUnit(e.target.value)}
                    placeholder="Unit"
                    style={{
                      width: 80, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                  placeholder={
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
                  disabled={sending}
                  style={{
                    padding: "10px 18px", borderRadius: 10, background: "var(--color-ink)",
                    color: "#F3EFE7", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                    opacity: sending ? 0.6 : 1, alignSelf: "stretch",
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
