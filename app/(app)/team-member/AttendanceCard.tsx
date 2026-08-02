"use client";

import { useState, useRef } from "react";

type AttendanceLog = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
  accumulated_minutes: number | null;
  last_check_in_at: string | null;
  check_in_count: number;
  // Only present on the response to a check-in/out, not on the server-rendered
  // row: which office the GPS matched, and whether it matched one at all.
  office_name?: string | null;
  within_geofence?: boolean | null;
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

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

type Phase = "idle" | "confirm_in" | "confirm_out" | "loading";

export default function AttendanceCard({ todayAttendance }: { todayAttendance: AttendanceLog | null }) {
  const [log, setLog] = useState<AttendanceLog | null>(todayAttendance);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCheckedInToday = !!log?.check_in_at;
  const isOpen = !!log?.last_check_in_at; // currently in an active cycle
  const workedMinutes = log?.accumulated_minutes ?? log?.total_minutes ?? null;

  function startConfirm(action: "check_in" | "check_out") {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setPhase(action === "check_in" ? "confirm_in" : "confirm_out");
    // Auto-reset after 4s if not confirmed
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
        // GPS unavailable — proceed anyway, withinGeofence will be null
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

    const updated = await res.json();
    setLog(updated);
    setPhase("idle");
  }

  return (
    <div style={{ ...C }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Attendance
        </div>
      </div>

      {/* Status row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{isOpen ? "Checked In" : "First In"}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: hasCheckedInToday ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt((isOpen ? log?.last_check_in_at : log?.check_in_at) ?? null)}
          </div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Last Out</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: log?.check_out_at && !isOpen ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt(isOpen ? null : log?.check_out_at ?? null)}
          </div>
        </div>
        {workedMinutes != null && (
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Worked</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMinutes(workedMinutes)}</div>
          </div>
        )}
        {hasCheckedInToday && (
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Check-ins</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{log?.check_in_count ?? 1}</div>
          </div>
        )}
      </div>

      {/* Which office the last check-in matched. Shown only after an action, so
          the member can see the app put them at the right office — and notice
          straight away if it did not. Out-of-geofence is stated plainly rather
          than hidden; the check-in is still recorded either way. */}
      {log?.within_geofence != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, marginBottom: 10, color: log.within_geofence ? "var(--color-forest)" : "var(--color-tan)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: log.within_geofence ? "var(--color-forest)" : "var(--color-tan)" }} />
          {log.within_geofence && log.office_name
            ? `At ${log.office_name}`
            : "Not at a registered office — logged as remote or on site"}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "var(--color-rust)", marginBottom: 10 }}>{error}</div>
      )}

      {/* Action buttons — two-click pattern. Members can run multiple cycles a day;
          worked time accumulates across each check-in → check-out span. */}
      {phase === "loading" ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Logging…</div>
      ) : !isOpen ? (
        phase === "confirm_in" ? (
          <button
            onClick={() => confirm("check_in")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "var(--color-forest)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {hasCheckedInToday ? "Confirm Check In Again" : "Confirm Check In"}
          </button>
        ) : (
          <button
            onClick={() => startConfirm("check_in")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "rgba(30,28,24,.06)", color: "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            {hasCheckedInToday ? "Check In Again" : "Check In"}
          </button>
        )
      ) : (
        phase === "confirm_out" ? (
          <button
            onClick={() => confirm("check_out")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "var(--color-rust)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Confirm Check Out
          </button>
        ) : (
          <button
            onClick={() => startConfirm("check_out")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "rgba(30,28,24,.06)", color: "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Check Out
          </button>
        )
      )}
    </div>
  );
}
