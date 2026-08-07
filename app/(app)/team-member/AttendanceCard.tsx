"use client";

import { useState, useRef, useEffect } from "react";

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

export default function AttendanceCard({
  todayAttendance,
  layout = "stacked",
}: {
  todayAttendance: AttendanceLog | null;
  // "wide" lays the title, stats and action out on a single row — used when the
  // card spans the full grid instead of sitting in a narrow column.
  layout?: "stacked" | "wide";
}) {
  const [log, setLog] = useState<AttendanceLog | null>(todayAttendance);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCheckedInToday = !!log?.check_in_at;
  const isOpen = !!log?.last_check_in_at; // currently in an active cycle

  // `accumulated_minutes` (068) only advances on check-OUT, so while a cycle is
  // open the stored figure is the total of the CLOSED cycles and the time being
  // worked right now counts for nothing on screen. Tick the open cycle locally so
  // the number grows as the day does.
  //
  // Display only — nothing is written. The server recomputes the real total on
  // check-out, so a tab left open, a clock skew or a missed tick self-corrects
  // rather than compounding.
  //
  // The wall clock is sampled inside the timer callback and held in state, never
  // read during render: that would be impure, and it would differ between server
  // and client on the first paint. Starting at 0 means the initial render shows
  // the stored total alone — exactly what the server rendered, so hydration
  // matches. A minute-resolution readout does not need a per-second timer.
  const [openCycleMinutes, setOpenCycleMinutes] = useState(0);
  // Null until the first client-side tick, so the server-rendered pipe (which
  // has no wall clock) and the first client paint match for hydration.
  const [nowIso, setNowIso] = useState<string | null>(null);
  const openedAt = log?.last_check_in_at ?? null;
  useEffect(() => {
    if (!isOpen || !openedAt) return;
    const startedMs = new Date(openedAt).getTime();
    // Floored at 0 so a client clock running behind the server can never
    // subtract from the day.
    const sample = () => {
      setOpenCycleMinutes(Math.max(0, Math.floor((Date.now() - startedMs) / 60_000)));
      setNowIso(new Date().toISOString());
    };
    // First sample just after mount so the open cycle appears without waiting a
    // full interval, then the 30s cadence.
    const first = setTimeout(sample, 50);
    const t = setInterval(sample, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      // Drop the open-cycle count on check-out. The server folds that time into
      // accumulated_minutes, so leaving it here would add it on top a second time.
      setOpenCycleMinutes(0);
    };
  }, [isOpen, openedAt]);

  const storedMinutes = log?.accumulated_minutes ?? log?.total_minutes ?? null;
  const workedMinutes =
    storedMinutes == null && !isOpen ? null : (storedMinutes ?? 0) + openCycleMinutes;

  // Pulls today's row back from the server. Used when a check-out fails, so the
  // card reflects what is actually stored rather than a stale open cycle. The
  // list endpoint returns newest first and today's row is the first entry; if
  // there is no row for today the card correctly falls back to "not checked in".
  async function refresh() {
    try {
      const res = await fetch("/api/attendance", { cache: "no-store" });
      if (!res.ok) return;
      const rows = (await res.json()) as AttendanceLog[];
      if (!Array.isArray(rows)) return;
      const todayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      setLog(rows.find((r) => r.work_date?.slice(0, 10) === todayStr) ?? null);
    } catch {
      // Offline or transient — the error message from the failed action stands.
    }
  }

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
      // A failed check-out used to leave the card showing "Checked In" against a
      // row the server had already closed (or never found), so the member
      // pressed Check Out, saw an error, and stayed "clocked in" to everyone
      // else. Re-read the authoritative row instead of trusting local state.
      if (action === "check_out") void refresh();
      return;
    }

    const updated = await res.json();
    setLog(updated);
    setPhase("idle");
  }

  const wide = layout === "wide";

  // Position on a 6am–midnight track, which is the span an office day falls in.
  const pctOfDay = (iso: string | null): number | null => {
    if (!iso) return null;
    const d = new Date(iso);
    const mins = d.getHours() * 60 + d.getMinutes();
    const start = 6 * 60;
    const end = 24 * 60;
    return Math.min(100, Math.max(0, ((mins - start) / (end - start)) * 100));
  };

  const inPct = pctOfDay(log?.check_in_at ?? null);
  const outPct = isOpen ? pctOfDay(nowIso) : pctOfDay(log?.check_out_at ?? null);

  if (wide) {
    return (
      <div style={{ ...C, display: "grid", gridTemplateColumns: "minmax(150px, auto) 1fr minmax(190px, 220px)", gap: 28, alignItems: "center" }}>
        {/* The day as one measured quantity, not four boxes of the same weight. */}
        <div>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6 }}>
            {isOpen ? "Working today" : "Worked today"}
          </div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 38, lineHeight: 1, marginTop: 2 }}>
            {fmtMinutes(workedMinutes) ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: isOpen ? "var(--color-forest)" : "var(--color-tan)", marginTop: 4 }}>
            {!hasCheckedInToday
              ? "Not checked in yet"
              : isOpen
                ? `Counting since ${fmt(log?.last_check_in_at ?? null)}`
                : `${log?.check_in_count ?? 1} check-in${(log?.check_in_count ?? 1) === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* Working span drawn against the shape of the day, so the total above
            reads as a length rather than a number sitting in a box. */}
        <div style={{ position: "relative", height: 46 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 6, borderRadius: 99, background: "var(--color-line)" }} />
          {inPct != null && outPct != null && (
            <div style={{ position: "absolute", top: 20, left: `${inPct}%`, width: `${Math.max(0, outPct - inPct)}%`, height: 6, borderRadius: 99, background: "var(--color-forest)" }} />
          )}
          {inPct != null && (
            <div style={{ position: "absolute", top: 0, left: `${inPct}%`, transform: "translateX(-50%)", fontSize: 11, fontWeight: 600, color: "var(--color-forest)", whiteSpace: "nowrap" }}>
              {fmt(log?.check_in_at ?? null)} in
            </div>
          )}
          {!isOpen && outPct != null && (
            <div style={{ position: "absolute", top: 0, left: `${outPct}%`, transform: "translateX(-50%)", fontSize: 11, fontWeight: 600, color: "var(--color-forest)", whiteSpace: "nowrap" }}>
              {fmt(log?.check_out_at ?? null)} out
            </div>
          )}
          {[["6a", 0], ["12p", 33], ["6p", 66], ["12a", 100]].map(([label, pos]) => (
            <div key={label} style={{ position: "absolute", top: 30, left: `${pos}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--color-tan)", fontFamily: "var(--font-mono)" }}>{label}</div>
          ))}
        </div>

        <div>
          {log?.within_geofence != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, marginBottom: 8, color: log.within_geofence ? "var(--color-forest)" : "var(--color-tan)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: log.within_geofence ? "var(--color-forest)" : "var(--color-tan)" }} />
              {log.within_geofence && log.office_name ? `At ${log.office_name}` : "Not at a registered office"}
            </div>
          )}
          {error && <div style={{ fontSize: 11, color: "var(--color-rust)", marginBottom: 8 }}>{error}</div>}
          {phase === "loading" ? (
            <div style={{ fontSize: 12, color: "var(--color-tan)" }}>Logging…</div>
          ) : !isOpen ? (
            <button
              onClick={() => (phase === "confirm_in" ? confirm("check_in") : startConfirm("check_in"))}
              style={{ width: "100%", padding: "11px", borderRadius: 12, background: phase === "confirm_in" ? "var(--color-forest)" : "rgba(30,28,24,.06)", color: phase === "confirm_in" ? "#FFF" : "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              {phase === "confirm_in" ? "Confirm" : hasCheckedInToday ? "Check In Again" : "Check In"}
            </button>
          ) : (
            <button
              onClick={() => (phase === "confirm_out" ? confirm("check_out") : startConfirm("check_out"))}
              style={{ width: "100%", padding: "11px", borderRadius: 12, background: phase === "confirm_out" ? "var(--color-rust)" : "rgba(30,28,24,.06)", color: phase === "confirm_out" ? "#FFF" : "var(--color-ink)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              {phase === "confirm_out" ? "Confirm" : "Check Out"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...C }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Attendance
        </div>
      </div>

      {/* Status row — label and value each stay on one line; tile shrinks the
          value size rather than wrapping when space is tight (phones). */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, whiteSpace: "nowrap" }}>{isOpen ? "Checked In" : "First In"}</div>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: hasCheckedInToday ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt((isOpen ? log?.last_check_in_at : log?.check_in_at) ?? null)}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
          <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, whiteSpace: "nowrap" }}>Last Out</div>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: log?.check_out_at && !isOpen ? "var(--color-forest)" : "var(--color-line)" }}>
            {fmt(isOpen ? null : log?.check_out_at ?? null)}
          </div>
        </div>
        {workedMinutes != null && (
          <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, whiteSpace: "nowrap" }}>
              {isOpen ? "Working" : "Worked"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: isOpen ? "var(--color-forest)" : undefined }}>
              {fmtMinutes(workedMinutes)}
            </div>
          </div>
        )}
        {hasCheckedInToday && (
          <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "var(--color-bg)" }}>
            <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, whiteSpace: "nowrap" }}>Check-ins</div>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{log?.check_in_count ?? 1}</div>
          </div>
        )}
      </div>

      <div>
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
    </div>
  );
}
