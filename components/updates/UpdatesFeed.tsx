"use client";

import { useState } from "react";
import { Avatar } from "@/components/atoms";

export type FeedImage = {
  id: string;
  url: string | null;
  drive_sync_status?: string;
};

export type FeedUpdate = {
  id: string;
  update_type: string;
  body: string | null;
  created_at: string;
  users: { id: string; full_name: string; role: string } | { id: string; full_name: string; role: string }[] | null;
  images?: FeedImage[];
};

const TYPE_COLORS: Record<string, string> = {
  note: "#6B7280", image: "#0EA5E9", drawing: "#8B5CF6",
  progress: "#10B981", remark: "#F59E0B", material: "#EF4444", expense: "#EC4899",
};

// Pin the timezone so server (UTC) and client (device TZ) render identical
// output — otherwise the hour/minute differ and hydration fails.
function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

// Thumbnail with a "Retry Drive sync" overlay when the Drive push failed.
export function FeedImageTile({
  img, projectId, size = 96,
}: { img: FeedImage; projectId?: string; size?: number }) {
  const [status, setStatus] = useState(img.drive_sync_status);
  const [busy, setBusy] = useState(false);

  async function retry(e: React.MouseEvent) {
    e.preventDefault();
    if (busy || !projectId) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/updates/images/${img.id}/retry`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) {
      const json = await res.json().catch(() => null);
      setStatus(json?.data?.status ?? "synced");
    }
  }

  const failed = status === "failed";

  return (
    <a href={img.url ?? "#"} target="_blank" rel="noreferrer" style={{ position: "relative", display: "block" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url ?? ""}
        alt="site update"
        style={{
          width: size, height: size, objectFit: "cover", borderRadius: 10,
          border: "1px solid var(--color-line)",
          opacity: failed ? 0.55 : 1,
        }}
      />
      {failed && projectId && (
        <button
          onClick={retry}
          disabled={busy}
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 2,
            background: "rgba(0,0,0,0.5)", color: "#FFF", borderRadius: 10,
            border: "none", cursor: busy ? "default" : "pointer",
            fontSize: 10, fontWeight: 600, textAlign: "center", padding: 4,
          }}
        >
          {busy ? "Syncing…" : "⟳ Retry Drive sync"}
        </button>
      )}
    </a>
  );
}

interface UpdatesFeedProps {
  updates: FeedUpdate[];
  emptyText?: string;
  projectId?: string;
}

export function UpdatesFeed({ updates, emptyText = "No updates yet.", projectId }: UpdatesFeedProps) {
  if (updates.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic", padding: "16px 0", textAlign: "center" }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {updates.map((u) => {
        const author = Array.isArray(u.users) ? u.users[0] : u.users;
        const initials = (author?.full_name ?? "?")
          .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        const typeColor = TYPE_COLORS[u.update_type] ?? "#6B7280";
        const imgs = (u.images ?? []).filter((i) => i.url);

        return (
          <div
            key={u.id}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--color-paper-light)",
              boxShadow: "0 1px 0 #FFF inset",
              border: "1px solid var(--color-line)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <Avatar initials={initials} tone="forest" size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{author?.full_name ?? "Unknown"}</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {u.update_type}
                </span>
              </div>
              <span style={{ fontSize: 10, color: "var(--color-tan)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                {fmt(u.created_at)}
              </span>
            </div>

            {u.body && (
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-ink)", whiteSpace: "pre-wrap" }}>
                {u.body}
              </div>
            )}

            {imgs.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: u.body ? 8 : 0 }}>
                {imgs.map((img) => (
                  <FeedImageTile key={img.id} img={img} projectId={projectId} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
