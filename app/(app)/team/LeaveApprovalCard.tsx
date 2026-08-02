"use client";

import { useEffect, useState } from "react";

// Owner-side leave queue. Rendered only when the viewer holds leave:approve —
// the API and the DB both re-check, this just avoids showing a dead panel.

type LeaveRow = {
  id: string;
  user_id: string;
  kind: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  users: { full_name: string } | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function LeaveApprovalCard() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/leave?scope=all&status=pending");
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.requests ?? []);
    } catch {
      // Non-fatal — the card stays empty rather than breaking the team page.
    }
  }

  // Fetch-on-mount: the setState happens in the awaited callback, not
  // synchronously in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
        Leave awaiting approval ({rows.length})
      </div>

      {error && <div style={{ fontSize: 12, color: "#B4553F", marginBottom: 8 }}>{error}</div>}

      {rows.map(r => (
        <div
          key={r.id}
          style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid rgba(30,28,24,.05)" }}
        >
          <div style={{ minWidth: 0, flex: "1 1 200px" }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{r.users?.full_name ?? "Team member"}</div>
            <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
              {fmtDate(r.start_date)}{r.start_date !== r.end_date && ` – ${fmtDate(r.end_date)}`}
              {" · "}{r.days}d · {r.kind.replace("_", " ")}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-tan)", fontStyle: "italic", marginTop: 2 }}>{r.reason}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r.id, "approve")}
              style={{
                padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "var(--color-ink)", color: "#FBF8F2", border: "1px solid var(--color-ink)",
                opacity: busy === r.id ? 0.5 : 1,
              }}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === r.id}
              onClick={() => decide(r.id, "reject")}
              style={{
                padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "transparent", color: "var(--color-tan)", border: "1px solid var(--color-line)",
                opacity: busy === r.id ? 0.5 : 1,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
