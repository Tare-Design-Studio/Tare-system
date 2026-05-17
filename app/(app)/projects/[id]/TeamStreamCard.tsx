"use client";

import { useState } from "react";
import { Avatar } from "@/components/atoms";
import { FeedImageTile } from "@/components/updates/UpdatesFeed";

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
  author_id: string;
  users: { id: string; full_name: string; role: string } | null;
  images?: { id: string; url: string | null; drive_sync_status?: string }[];
};

const SITE_ROLES = new Set(["site_engineer"]);
const TONES = ["forest", "teal", "indigo", "amber", "rust", "mint"] as const;
type Tone = typeof TONES[number];

const TYPE_COLORS: Record<string, string> = {
  note: "#6B7280", image: "#0EA5E9", drawing: "#8B5CF6",
  progress: "#10B981", remark: "#F59E0B", material: "#EF4444", expense: "#EC4899",
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
}

export default function TeamStreamCard({ assignments, updates, projectId }: Props) {
  const teamMembers = assignments.filter(a => !SITE_ROLES.has(a.role_on_project));
  const siteEngineers = assignments.filter(a => SITE_ROLES.has(a.role_on_project));

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
          <div style={{ display: "flex", flexDirection: "column" }}>
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
                          {fmtDate(u.created_at)}
                        </span>
                      </div>
                      {u.body && (
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
                      <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                        {cap(authorAssignment?.role_on_project ?? author?.role ?? "")}
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
