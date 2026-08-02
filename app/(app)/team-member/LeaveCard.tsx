"use client";

import { useEffect, useState } from "react";

// Leave button + pending balance (client request #5).

type LeaveRow = {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  decision_note: string | null;
};

type Balance = {
  entitled_days: number;
  used_days: number;
  pending_days: number;
  pending_count: number;
  remaining_days: number;
};

const KINDS = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "earned", label: "Earned" },
  { value: "comp_off", label: "Comp off" },
  { value: "unpaid", label: "Unpaid" },
];

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "var(--color-ink)",
  background: "var(--color-paper)",
  border: "1px solid var(--color-line)",
  borderRadius: 10,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 5,
};

const STATUS_TONE: Record<LeaveRow["status"], string> = {
  pending: "#C08A2E",
  approved: "var(--color-forest, #2F6B4F)",
  rejected: "#B4553F",
  cancelled: "var(--color-tan)",
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Inclusive day count; the server stores whatever we send, so this has to match
// what the user sees on the form.
function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00").getTime();
  const e = new Date(end + "T00:00:00").getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export default function LeaveCard() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [kind, setKind] = useState("casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  const spanDays = start && end ? daysBetween(start, end) : 0;
  const days = halfDay && spanDays === 1 ? 0.5 : spanDays;

  async function load() {
    try {
      const res = await fetch("/api/leave");
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.requests ?? []);
      setBalance(data.balance ?? null);
    } catch {
      // Non-fatal: the card simply shows nothing rather than breaking the page.
    }
  }

  // Fetch-on-mount: the setState happens in the awaited callback, not
  // synchronously in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!start || !end || !reason.trim()) {
      setMsg({ ok: false, text: "Fill in the dates and a reason" });
      return;
    }
    if (days <= 0) {
      setMsg({ ok: false, text: "End date cannot be before the start date" });
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, start_date: start, end_date: end, days, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit");

      setMsg({ ok: true, text: "Leave requested" });
      setStart(""); setEnd(""); setReason(""); setHalfDay(false);
      setOpen(false);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not submit" });
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/leave/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    load();
  }

  const pending = rows.filter(r => r.status === "pending");

  return (
    <div style={C}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 className="font-serif" style={{ fontSize: 20, margin: 0 }}>Leave</h3>
        <button
          type="button"
          onClick={() => { setOpen(v => !v); setMsg(null); }}
          style={{
            padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: open ? "transparent" : "var(--color-ink)",
            color: open ? "var(--color-tan)" : "#FBF8F2",
            border: `1px solid ${open ? "var(--color-line)" : "var(--color-ink)"}`,
          }}
        >
          {open ? "Cancel" : "Request leave"}
        </button>
      </div>

      {balance && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
          {[
            { label: "Remaining", value: balance.remaining_days },
            { label: "Pending", value: balance.pending_days, count: balance.pending_count },
            { label: "Taken", value: balance.used_days },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                {s.label}
                {s.count ? ` (${s.count})` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={kind} onChange={e => setKind(e.target.value)} disabled={saving}>
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input style={inputStyle} type="date" value={start} onChange={e => setStart(e.target.value)} disabled={saving} />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input style={inputStyle} type="date" value={end} onChange={e => setEnd(e.target.value)} disabled={saving} />
            </div>
          </div>

          {spanDays === 1 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-tan)" }}>
              <input type="checkbox" checked={halfDay} onChange={e => setHalfDay(e.target.checked)} disabled={saving} />
              Half day
            </label>
          )}

          <div>
            <label style={labelStyle}>Reason</label>
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: "vertical" }}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why you need the time off"
              disabled={saving}
            />
          </div>

          {days > 0 && (
            <div style={{ fontSize: 12, color: "var(--color-tan)" }}>
              Requesting <strong style={{ color: "var(--color-ink)" }}>{days}</strong> day{days === 1 ? "" : "s"}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "var(--color-ink)", color: "#FBF8F2", border: "none",
              cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 12, marginTop: 12, color: msg.ok ? "var(--color-forest)" : "#B4553F" }}>
          {msg.text}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Awaiting approval
          </div>
          {pending.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(30,28,24,.05)" }}>
              <span style={{ fontSize: 12 }}>
                {fmtDate(r.start_date)}{r.start_date !== r.end_date && ` – ${fmtDate(r.end_date)}`}
                <span style={{ color: "var(--color-tan)" }}> · {r.days}d · {r.kind.replace("_", " ")}</span>
              </span>
              <button
                type="button"
                onClick={() => cancel(r.id)}
                style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--color-tan)", textDecoration: "underline", cursor: "pointer" }}
              >
                Withdraw
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.filter(r => r.status !== "pending").slice(0, 4).map(r => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 12, color: "var(--color-tan)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_TONE[r.status], flexShrink: 0 }} />
          {fmtDate(r.start_date)} · {r.days}d · {r.status}
          {r.decision_note && <span style={{ fontStyle: "italic" }}> — {r.decision_note}</span>}
        </div>
      ))}
    </div>
  );
}
