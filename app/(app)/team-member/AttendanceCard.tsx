"use client";

import { useState, useRef } from "react";

type AttendanceLog = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  total_minutes: number | null;
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

  const isCheckedIn = !!log?.check_in_at;
  const isCheckedOut = !!log?.check_out_at;

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
      <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 14 }}>
        Attendance
      </div>

      {/* Status row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Check In</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isCheckedIn ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt(log?.check_in_at ?? null)}
          </div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Check Out</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isCheckedOut ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt(log?.check_out_at ?? null)}
          </div>
        </div>
        {log?.total_minutes != null && (
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Total</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMinutes(log.total_minutes)}</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "var(--color-rust)", marginBottom: 10 }}>{error}</div>
      )}

      {/* Action buttons — two-click pattern */}
      {phase === "loading" ? (
        <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Logging…</div>
      ) : !isCheckedIn ? (
        phase === "confirm_in" ? (
          <button
            onClick={() => confirm("check_in")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "var(--color-forest)", color: "#FFF", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Confirm Check In
          </button>
        ) : (
          <button
            onClick={() => startConfirm("check_in")}
            style={{ width: "100%", padding: "10px", borderRadius: 12, background: "rgba(30,28,24,.06)", color: "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Check In
          </button>
        )
      ) : !isCheckedOut ? (
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
      ) : (
        <div style={{ fontSize: 12, color: "var(--color-tan)", textAlign: "center", padding: "6px 0" }}>
          Day complete · {fmtMinutes(log?.total_minutes ?? null)} logged
        </div>
      )}
    </div>
  );
}
