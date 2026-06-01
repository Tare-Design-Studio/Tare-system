"use client";

import { useState, useRef } from "react";

export type AttendanceLog = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
  accumulated_minutes: number | null;
  last_check_in_at: string | null;
  check_in_count: number;
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(m: number | null) {
  if (m == null) return null;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

type Phase = "idle" | "confirm_in" | "confirm_out" | "loading";

// Office attendance for site engineers — mirrors the team-member AttendanceCard:
// office geofence (tenant.office_*), two-click confirm, worked minutes accumulate
// across multiple check-in → check-out cycles in a day. This is distinct from the
// project-site GPS check-in elsewhere in the Today tab.
export default function SiteAttendanceCard({ todayAttendance }: { todayAttendance: AttendanceLog | null }) {
  const [log, setLog] = useState<AttendanceLog | null>(todayAttendance);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCheckedInToday = !!log?.check_in_at;
  const isOpen = !!log?.last_check_in_at;
  const workedMinutes = log?.accumulated_minutes ?? log?.total_minutes ?? null;

  function startConfirm(action: "check_in" | "check_out") {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setPhase(action === "check_in" ? "confirm_in" : "confirm_out");
    resetTimer.current = setTimeout(() => setPhase("idle"), 4000);
  }

  async function confirm(action: "check_in" | "check_out") {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setPhase("loading");
    setError(null);

    let lat: number | undefined;
    let lng: number | undefined;
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // GPS unavailable — proceed; within-geofence will be null.
      }
    }

    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, lat, lng }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      setPhase("idle");
      return;
    }

    setLog(await res.json());
    setPhase("idle");
  }

  return (
    <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Office Attendance</div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 90, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{isOpen ? "Checked In" : "First In"}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: hasCheckedInToday ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt((isOpen ? log?.last_check_in_at : log?.check_in_at) ?? null)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 90, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Last Out</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: log?.check_out_at && !isOpen ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt(isOpen ? null : log?.check_out_at ?? null)}
          </div>
        </div>
        {workedMinutes != null && (
          <div style={{ flex: 1, minWidth: 90, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Worked</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMinutes(workedMinutes)}</div>
          </div>
        )}
        {hasCheckedInToday && (
          <div style={{ flex: 1, minWidth: 90, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Check-ins</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{log?.check_in_count ?? 1}</div>
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 11, color: "var(--color-rust)", marginBottom: 10 }}>{error}</div>}

      {phase === "loading" ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Logging…</div>
      ) : !isOpen ? (
        phase === "confirm_in" ? (
          <button onClick={() => confirm("check_in")} style={{ width: "100%", padding: "10px", borderRadius: 12, background: "var(--color-forest)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {hasCheckedInToday ? "Confirm Check In Again" : "Confirm Check In"}
          </button>
        ) : (
          <button onClick={() => startConfirm("check_in")} style={{ width: "100%", padding: "10px", borderRadius: 12, background: "rgba(30,28,24,.06)", color: "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {hasCheckedInToday ? "Check In Again" : "Check In"}
          </button>
        )
      ) : (
        phase === "confirm_out" ? (
          <button onClick={() => confirm("check_out")} style={{ width: "100%", padding: "10px", borderRadius: 12, background: "var(--color-rust)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Confirm Check Out
          </button>
        ) : (
          <button onClick={() => startConfirm("check_out")} style={{ width: "100%", padding: "10px", borderRadius: 12, background: "rgba(30,28,24,.06)", color: "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Check Out
          </button>
        )
      )}
    </div>
  );
}
