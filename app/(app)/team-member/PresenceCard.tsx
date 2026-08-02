"use client";

import { useEffect, useState } from "react";

// Who is at work today (client request #4). Green = checked in right now,
// amber = came in and left, blue = approved leave, red = no check-in yet.

type Member = {
  user_id: string;
  full_name: string;
  role: string;
  role_label: string | null;
  status: "present" | "checked_out" | "on_leave" | "absent";
  leave_kind: string | null;
  check_in_at: string | null;
  is_late: boolean | null;
  office_name: string | null;
};

type Board = {
  date: string;
  members: Member[];
  summary: { present: number; checked_out: number; on_leave: number; absent: number };
};

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const DOT: Record<Member["status"], string> = {
  present: "var(--color-forest, #2F6B4F)",
  checked_out: "#C08A2E",
  on_leave: "#4A6FA5",
  absent: "#B4553F",
};

const LABEL: Record<Member["status"], string> = {
  present: "At work",
  checked_out: "Left for the day",
  on_leave: "On leave",
  absent: "Not checked in",
};

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function PresenceCard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/attendance/board");
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not load");
        const data = await res.json();
        if (!cancelled) { setBoard(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load");
      }
    }

    load();
    // Presence changes through the day; refresh while the tab is open.
    const t = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div style={C}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 className="font-serif" style={{ fontSize: 20, margin: 0 }}>Who&rsquo;s in today</h3>
        {board && (
          <span style={{ fontSize: 12, color: "var(--color-tan)" }}>
            {board.summary.present} in · {board.summary.absent} out
          </span>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: "#B4553F", marginTop: 12 }}>{error}</div>}
      {!board && !error && <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 12 }}>Loading…</div>}

      {board && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
          {board.members.map(m => {
            const time = fmtTime(m.check_in_at);
            return (
              <div
                key={m.user_id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(30,28,24,.05)" }}
              >
                <span
                  aria-hidden
                  style={{ width: 9, height: 9, borderRadius: "50%", background: DOT[m.status], flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.full_name}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-tan)", flexShrink: 0, textAlign: "right" }}>
                  {/* Screen readers get the words, not just the colour. */}
                  {LABEL[m.status]}
                  {/* Which office, so a Mysore member can see who is in Bangalore. */}
                  {(m.status === "present" || m.status === "checked_out") && m.office_name && ` · ${m.office_name}`}
                  {m.status === "present" && time && ` · ${time}`}
                  {m.status === "present" && m.is_late && " · late"}
                  {m.status === "on_leave" && m.leave_kind && ` · ${m.leave_kind.replace("_", " ")}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
