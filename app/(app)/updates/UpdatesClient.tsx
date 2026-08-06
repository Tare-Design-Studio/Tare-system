"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export type UpdateRow = {
  id: string;
  update_type: string;
  body: string | null;
  created_at: string;
  project_id: string;
  users: { full_name: string } | { full_name: string }[] | null;
  projects: { name: string } | { name: string }[] | null;
};

interface Props {
  updates: UpdateRow[];
  nowMs: number;
  selectedMonth: string | null;
  fromDate: string;
  toDate: string;
  todayYear: number;
  todayMonth: number; // 0-based
}

function updateIcon(updateType: string): string {
  switch (updateType) {
    // Project-linked tasks merged into the feed: a clock while in progress,
    // a tick once completed.
    case "task_pending": return "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 6v6l4 2";
    case "task_completed": return "M20 6 9 17l-5-5";
    case "progress": return "M20 6 9 17l-5-5";
    case "note": return "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8";
    case "material_request": return "m12 2 10 6-10 6L2 8z|m2 14 10 6 10-6";
    case "site_photo": return "M3 3h18v18H3z|M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3|m21 15-5-5L5 21";
    case "payment": return "M12 2v20|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6";
    case "check_in": return "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
    default: return "M12 20h9|M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z";
  }
}

function timeAgo(iso: string, nowMs: number): string {
  const diff = Math.floor((nowMs - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? "s" : ""}`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)} days`;
}

function capitaliseType(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
  border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
  background: active ? "var(--color-ink)" : "var(--color-paper-light)",
  color: active ? "#FBF8F2" : "var(--color-ink)",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const dateInputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 12,
  color: "var(--color-ink)",
  outline: "none",
  fontFamily: "inherit",
};

export default function UpdatesClient({ updates, nowMs, selectedMonth, fromDate, toDate, todayYear, todayMonth }: Props) {
  const router = useRouter();
  const [pendingFrom, setPendingFrom] = useState<string>(fromDate);
  const [pendingTo, setPendingTo] = useState<string>(toDate);

  // Build the last 6 month keys (current + previous 5)
  const monthKeys: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(todayYear, todayMonth - i, 1));
    monthKeys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }

  function selectMonth(key: string) {
    router.push(`/updates?month=${key}`);
  }

  function applyRange() {
    if (!pendingFrom && !pendingTo) {
      router.push(`/updates`);
      return;
    }
    const qs = new URLSearchParams();
    if (pendingFrom) qs.set("from", pendingFrom);
    if (pendingTo) qs.set("to", pendingTo);
    router.push(`/updates?${qs.toString()}`);
  }

  function clearRange() {
    setPendingFrom("");
    setPendingTo("");
    router.push(`/updates`);
  }

  const hasCustomRange = Boolean(fromDate || toDate);

  return (
    <>
      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 16, marginBottom: 20 }}>
        <Link href="/" style={{ fontSize: 12, color: "var(--color-tan)", textDecoration: "none", marginRight: 4 }}>← Back</Link>

        <select
          value={selectedMonth ?? ""}
          onChange={(e) => selectMonth(e.target.value)}
          style={dateInputStyle}
        >
          {monthKeys.map((k) => (
            <option key={k} value={k}>{monthLabel(k)}</option>
          ))}
        </select>

        <div style={{ width: 1, height: 22, background: "var(--color-line)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8 }}>Range</span>
          <input type="date" value={pendingFrom} onChange={(e) => setPendingFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ fontSize: 12, color: "var(--color-tan)" }}>→</span>
          <input type="date" value={pendingTo} onChange={(e) => setPendingTo(e.target.value)} style={dateInputStyle} />
          <button style={pill(hasCustomRange)} onClick={applyRange}>Apply</button>
          {hasCustomRange && (
            <button style={pill(false)} onClick={clearRange}>Clear</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 880 }}>
        {updates.length === 0 ? (
          <div style={{ color: "var(--color-tan)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
            No updates in this range.
          </div>
        ) : updates.map((e) => {
          const authorRaw = e.users;
          const author = Array.isArray(authorRaw) ? authorRaw[0]?.full_name : authorRaw?.full_name;
          const projectRaw = e.projects;
          const projectName = Array.isArray(projectRaw) ? projectRaw[0]?.name : projectRaw?.name;
          const isMint = e.update_type === "payment";
          const isTask = e.update_type === "task_pending" || e.update_type === "task_completed";
          const isPendingTask = e.update_type === "task_pending";
          const title = e.body?.split("\n")[0]?.slice(0, 80) || capitaliseType(e.update_type);
          const sub = [projectName, author].filter(Boolean).join(" · ");

          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "flex-start" }}>
              <div style={{ paddingTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-tan)" }}>
                {timeAgo(e.created_at, nowMs)}
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 14,
                background: isPendingTask ? "#F0E6D2" : isTask ? "#DDE7DA" : isMint ? "#D6E0CF" : "#EAE3D3",
                color: isPendingTask ? "#7A5A18" : isTask ? "#3E5A41" : isMint ? "#3E5A41" : "var(--color-ink)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, letterSpacing: -0.1, flexWrap: "wrap" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {updateIcon(e.update_type).split("|").map((p, j) => <path key={j} d={p} />)}
                  </svg>
                  {isTask && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
                      padding: "1px 7px", borderRadius: 999,
                      background: "rgba(255,255,255,0.5)", whiteSpace: "nowrap",
                    }}>
                      {isPendingTask ? "In progress" : "Task completed"}
                    </span>
                  )}
                  {title}
                </div>
                {sub && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
                {e.body && e.body.split("\n").length > 1 && (
                  <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85, whiteSpace: "pre-wrap" }}>
                    {e.body.split("\n").slice(1).join("\n")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
