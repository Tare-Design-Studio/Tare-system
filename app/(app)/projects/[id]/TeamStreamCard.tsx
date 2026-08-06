"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, ConfirmPopover, Icon } from "@/components/atoms";
import { FeedImageTile } from "@/components/updates/UpdatesFeed";
import styles from "./project-detail.module.css";

type Assignment = {
  id: string;
  role_on_project: string;
  contribution_pct: number | null;
  users: { id: string; full_name: string; role: string } | null;
};

type Update = {
  id: string;
  update_type: string;
  body: string | null;
  created_at: string;
  edited_at?: string | null;
  author_id: string;
  users: { id: string; full_name: string; role: string } | null;
  images?: { id: string; url: string | null; drive_sync_status?: string }[];
  // "task" rows are member_tasks linked to this project (095). They are
  // read-only here — the task itself lives on the tasks pages. A task in
  // progress shows as pending and is replaced by its completed entry when it
  // closes.
  entry_kind?: "update" | "task";
  task_state?: "pending" | "completed";
  title?: string;
  tag?: string;
  review_status?: string | null;
};

const VERDICT_COLOR: Record<string, string> = {
  clean: "#10B981", revision: "#F59E0B", error: "#EF4444",
};

const SITE_ROLES = new Set(["site_engineer"]);
const TONES = ["forest", "teal", "indigo", "amber", "rust", "mint"] as const;
type Tone = typeof TONES[number];

const TYPE_COLORS: Record<string, string> = {
  note: "#6B7280", image: "#0EA5E9", drawing: "#8B5CF6",
  progress: "#10B981", remark: "#F59E0B", material: "#EF4444", expense: "#EC4899",
  task: "#0F766E",
};

function tone(idx: number): Tone { return TONES[idx % TONES.length]; }
function cap(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function fmtDate(d: string) {
  // Pinned timezone — keeps server/client render identical (no hydration drift).
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

interface Props {
  assignments: Assignment[];
  updates: Update[];
  projectId: string;
  currentUserId: string;
}

export default function TeamStreamCard({ assignments, updates: initialUpdates, projectId, currentUserId }: Props) {
  const teamMembers = assignments.filter(a => !SITE_ROLES.has(a.role_on_project));
  const siteEngineers = assignments.filter(a => SITE_ROLES.has(a.role_on_project));

  const [updates, setUpdates] = useState(initialUpdates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openMenuId]);

  async function saveEdit(id: string) {
    if (!editDraft.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/updates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editDraft.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setUpdates(prev => prev.map(u =>
        u.id === id ? { ...u, body: editDraft.trim(), edited_at: new Date().toISOString() } : u
      ));
      setEditingId(null);
    }
  }

  async function removeUpdate(id: string) {
    const res = await fetch(`/api/projects/${projectId}/updates/${id}`, { method: "DELETE" });
    if (res.ok) setUpdates(prev => prev.filter(u => u.id !== id));
  }

  const [tab, setTab] = useState<"Team Member" | "Site Engineer">("Team Member");
  const displayed = tab === "Team Member" ? teamMembers : siteEngineers;

  // "all" = show all members in the tab, or a specific user id
  const [filterUserId, setFilterUserId] = useState<string>("all");

  const displayedIds = new Set(displayed.map(a => a.users?.id).filter(Boolean) as string[]);

  const filteredUpdates = updates.filter(u => {
    if (!displayedIds.has(u.author_id)) return false;
    if (filterUserId !== "all" && u.author_id !== filterUserId) return false;
    return true;
  });

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    background: active ? "var(--color-paper-light)" : "transparent",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,.1)" : "none",
    border: "none",
    cursor: "pointer",
    color: "var(--color-ink)",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Team Stream</div>
        <div style={{ display: "flex", background: "var(--color-bg)", borderRadius: 10, padding: 4 }}>
          {(["Team Member", "Site Engineer"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setFilterUserId("all"); }} style={toggleStyle(tab === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {displayed.length === 0 ? (
        <p style={{ color: "var(--color-tan)", fontSize: 13, fontStyle: "italic" }}>
          No {tab.toLowerCase()}s assigned to this project.
        </p>
      ) : (
        <>
          {/* Member filter dropdown */}
          <div style={{ marginBottom: 14 }}>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
                color: "var(--color-ink)", fontFamily: "inherit", cursor: "pointer", outline: "none",
              }}
            >
              <option value="all">All</option>
              {displayed.map((a) => {
                const uid = a.users?.id ?? a.id;
                return (
                  <option key={a.id} value={uid}>
                    {a.users?.full_name ?? "Unknown"}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Activity feed */}
          <div className={styles.streamFeed}>
            {filteredUpdates.length === 0 ? (
              <p style={{ color: "var(--color-tan)", fontSize: 13, fontStyle: "italic" }}>No updates logged.</p>
            ) : (
              filteredUpdates.map((u, i) => {
                const author = u.users;
                const authorAssignment = displayed.find(a => a.users?.id === u.author_id);
                const authorIdx = authorAssignment ? displayed.indexOf(authorAssignment) : 0;
                const initials = (author?.full_name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                const typeColor = TYPE_COLORS[u.update_type] ?? "#6B7280";
                return (
                  <div key={u.id} style={{
                    display: "flex", gap: 10, padding: "10px 0",
                    borderBottom: i < filteredUpdates.length - 1 ? "1px solid var(--color-line)" : "none",
                  }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <Avatar initials={initials} tone={tone(authorIdx)} size={24} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{author?.full_name ?? "Unknown"}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {u.update_type}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--color-tan)", marginLeft: "auto", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                          {fmtDate(u.created_at)}{u.edited_at ? " · edited" : ""}
                        </span>
                      </div>
                      {u.entry_kind === "task" ? (
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-ink)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
                              padding: "1px 7px", borderRadius: 999,
                              background: u.task_state === "pending" ? "rgba(226,166,75,0.16)" : "rgba(45,106,79,0.12)",
                              color: u.task_state === "pending" ? "#A0720E" : "var(--color-forest)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {u.task_state === "pending" ? "In progress" : "Task completed"}
                          </span>
                          <span>“{u.title}”</span>
                          {u.review_status && (
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: VERDICT_COLOR[u.review_status] ?? "var(--color-tan)" }}>
                              {u.review_status}
                            </span>
                          )}
                        </div>
                      ) : editingId === u.id ? (
                        <div>
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={3}
                            style={{
                              width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 8,
                              border: "1px solid var(--color-line)", fontSize: 12, fontFamily: "inherit", resize: "vertical",
                            }}
                          />
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 5 }}>
                            <button onClick={() => setEditingId(null)} disabled={busy} style={{ padding: "3px 8px", borderRadius: 7, border: "1px solid var(--color-line)", background: "transparent", fontSize: 10, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => saveEdit(u.id)} disabled={busy} style={{ padding: "3px 8px", borderRadius: 7, border: "none", background: "var(--color-ink)", color: "#F3EFE7", fontSize: 10, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{busy ? "…" : "Save"}</button>
                          </div>
                        </div>
                      ) : u.body && (
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-ink)", whiteSpace: "pre-wrap" }}>
                          {u.body}
                        </div>
                      )}
                      {(u.images ?? []).filter(img => img.url).length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: u.body ? 6 : 2 }}>
                          {(u.images ?? []).filter(img => img.url).map(img => (
                            <FeedImageTile key={img.id} img={img} projectId={projectId} size={72} />
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                          {cap(authorAssignment?.role_on_project ?? author?.role ?? "")}
                        </span>
                        {u.entry_kind !== "task" && u.author_id === currentUserId && editingId !== u.id && (
                          <span
                            ref={openMenuId === u.id ? menuRef : null}
                            style={{ position: "relative", display: "inline-flex", marginLeft: "auto" }}
                          >
                            <button
                              onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                              aria-label="Update actions"
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, border: "1px solid var(--color-line)", background: openMenuId === u.id ? "rgba(30,28,24,.06)" : "transparent", cursor: "pointer", color: "var(--color-tan)" }}
                            >
                              <Icon name="pencil" size={12} />
                            </button>
                            {openMenuId === u.id && (
                              <div
                                role="menu"
                                style={{
                                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                                  minWidth: 120, padding: 4, borderRadius: 10,
                                  background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
                                  boxShadow: "0 8px 28px -8px rgba(30,28,24,.28)", display: "flex", flexDirection: "column", gap: 2,
                                }}
                              >
                                <button
                                  onClick={() => { setEditingId(u.id); setEditDraft(u.body ?? ""); setOpenMenuId(null); }}
                                  style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "var(--color-ink)", textAlign: "left" }}
                                >
                                  Edit
                                </button>
                                <ConfirmPopover
                                  title="Delete update?"
                                  message="This update will be removed. This cannot be undone."
                                  onConfirm={() => removeUpdate(u.id)}
                                >
                                  {(open) => (
                                    <button
                                      onClick={open}
                                      style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "var(--color-rust)", textAlign: "left" }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </ConfirmPopover>
                              </div>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>
            {assignments.reduce((s, a) => s + (a.contribution_pct ?? 0), 0).toFixed(0)}% total allocated
          </div>
        </>
      )}
    </div>
  );
}
