"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Chip } from "@/components/atoms";
import styles from "./performance.module.css";
import TeamPerformanceCard from "../TeamPerformanceCard";
import { scoreToGrade } from "../team/taskTime";

type Member = {
  id: string;
  full_name: string;
  role: string;
};

type KpiRow = {
  id: string;
  user_id: string;
  full_name: string;
  period_month: string;
  drawings_completed: number;
  errors: number;
  revisions: number;
  deadline_met_pct: number | null;
  client_rating: number | null;
  site_delay_days: number;
  efficiency_score: number;
  quality_score: number;
  delivery_score: number;
  overall_kpi_score: number;
  base_kpi_score?: number | null;
  remark_points?: number | null;
  notes?: string | null;
};

export type Remark = {
  id: string;
  user_id: string;
  period_month: string;
  points: number;
  grade: string | null;
  note: string;
  created_at: string;
  author: { full_name: string } | null;
};

type Props = {
  members: Member[];
  kpiRows: KpiRow[];
  initialRemarks: Remark[];
  currentMonth: string;
  /** team:edit_user — principal / admin. Gates remark writes. */
  canEdit: boolean;
  currentUserId: string;
};

const GRADES = ["A++", "A+", "A", "B+", "B", "C", "D"] as const;

// Same grade bands as the Team page. Scores are uncapped, so 100+ is A++.
const scoreGrade = scoreToGrade;

function gradeTone(grade: string): "forest" | "amber" | "rust" {
  if (grade.startsWith("A")) return "forest";
  if (grade.startsWith("B")) return "amber";
  return "rust";
}

function fmtMonth(iso: string) {
  const [y, m] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", {
    month: "long", year: "numeric",
  });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtPts(n: number) {
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}`;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("");
}

function roleTone(role: string): "forest" | "amber" | "indigo" {
  if (role === "owner") return "forest";
  if (role === "site_engineer") return "amber";
  return "indigo";
}

function scoreColor(score: number): string {
  const g = scoreGrade(score);
  return g.startsWith("A") ? "var(--color-forest)" : g.startsWith("B") ? "var(--color-amber)" : "var(--color-rust)";
}

// Overview-style card heading: serif title + muted subtitle.
function CardHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3, lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8,
  display: "block", marginBottom: 6, fontWeight: 500,
};

const fieldInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 12,
  border: "1px solid var(--line-2)", background: "var(--bg-2)",
  fontSize: 13, color: "var(--color-ink)", boxSizing: "border-box", fontFamily: "inherit",
};

const ghostBtn: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 999, border: "1px solid var(--line-2)", background: "transparent",
  fontSize: 13, cursor: "pointer", color: "var(--color-ink)", fontFamily: "inherit",
};

const inkBtn: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 999, border: "none", background: "var(--color-ink)",
  color: "#F3EFE7", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};

type EditState = {
  userId: string;
  periodMonth: string;
  drawings: string;
  errors: string;
  revisions: string;
  deadlinePct: string;
  clientRating: string;
  siteDelay: string;
  notes: string;
};

// ─── Remarks popover ─────────────────────────────────────────────────────────
// Anchored to the clicked cell with position: fixed, so the table's horizontal
// scroll box can't clip it. Flips above the cell when there's no room below.

function RemarksPopover({ anchor, member, month, remarks, canWrite, onClose, onChanged }: {
  anchor: DOMRect;
  member: Member;
  month: string;
  remarks: Remark[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sign, setSign] = useState<1 | -1>(1);
  const [points, setPoints] = useState("");
  const [grade, setGrade] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const net = remarks.reduce((s, r) => s + Number(r.points), 0);
  const pts = parseFloat(points);
  const canSubmit = canWrite && !busy && pts > 0 && note.trim().length > 0;

  async function add() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/performance/remarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.id, period_month: month, points: sign * pts, grade, note: note.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Couldn't save remark");
        return;
      }
      setPoints("");
      setNote("");
      setGrade(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/performance/remarks?id=${id}`, { method: "DELETE" });
      if (!res.ok) setError("Couldn't delete remark");
      else await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const W = 360;
  const below = window.innerHeight - anchor.bottom;
  const placeAbove = below < 360 && anchor.top > below;
  const left = Math.max(12, Math.min(anchor.right - W, window.innerWidth - W - 12));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Remarks for ${member.full_name}`}
      style={{
        position: "fixed", left, width: W, zIndex: 120,
        ...(placeAbove ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
        maxHeight: Math.max(240, (placeAbove ? anchor.top : below) - 24), overflowY: "auto",
        background: "var(--color-paper-light)", borderRadius: 22, padding: 18,
        border: "1px solid var(--line-2)", boxShadow: "0 18px 44px -16px rgba(27,26,23,.4)",
        textAlign: "left", fontSize: 12, color: "var(--color-ink)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, lineHeight: 1.1 }}>Remarks</div>
          <div style={{ color: "var(--color-tan)", marginTop: 3 }}>{member.full_name} · {fmtMonth(month)}</div>
        </div>
        {remarks.length > 0 && (
          <span className="mono" style={{ fontWeight: 600, fontSize: 14, color: net >= 0 ? "var(--color-forest)" : "var(--color-rust)" }}>
            {fmtPts(net)} pts
          </span>
        )}
      </div>

      {/* List */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
        {remarks.length === 0 ? (
          <div style={{ color: "var(--color-tan)", padding: "10px 0" }}>No remarks this month.</div>
        ) : remarks.map((r, i) => (
          <div key={r.id} style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0",
            borderTop: i > 0 ? "1px solid var(--color-line)" : "none",
          }}>
            <span className="mono" style={{
              minWidth: 44, textAlign: "right", fontWeight: 600, fontSize: 13,
              color: r.points >= 0 ? "var(--color-forest)" : "var(--color-rust)",
            }}>{fmtPts(Number(r.points))}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {r.grade && <Chip size="sm" tone={gradeTone(r.grade)} label={r.grade} />}
                <span style={{ overflowWrap: "anywhere" }}>{r.note}</span>
              </div>
              <div style={{ color: "var(--color-tan)", fontSize: 11, marginTop: 3 }}>
                {r.author?.full_name ?? "—"} · {fmtShortDate(r.created_at)}
              </div>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={busy}
                aria-label="Delete remark"
                title="Delete remark"
                style={{
                  width: 24, height: 24, borderRadius: 999, border: "none", background: "transparent",
                  color: "var(--color-tan)", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0,
                }}
              >×</button>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {canWrite && (
        <div style={{ marginTop: 10, paddingTop: 14, borderTop: "1px solid var(--color-line)", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "flex", background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 999, padding: 3, flexShrink: 0 }}>
              {([1, -1] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSign(s)}
                  aria-pressed={sign === s}
                  style={{
                    padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
                    fontFamily: "inherit",
                    background: sign === s ? (s === 1 ? "var(--color-forest)" : "var(--color-rust)") : "transparent",
                    color: sign === s ? "#F3EFE7" : "var(--color-ink)",
                  }}
                >{s === 1 ? "+ Add" : "− Deduct"}</button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="Points"
              aria-label="Points"
              style={{ ...fieldInput, borderRadius: 999, padding: "7px 14px" }}
            />
          </div>

          <div>
            <span style={{ ...fieldLabel, marginBottom: 6 }}>Grade</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {GRADES.map((g) => {
                const on = grade === g;
                const tone = gradeTone(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(on ? null : g)}
                    aria-pressed={on}
                    className="mono"
                    style={{
                      minWidth: 38, padding: "5px 9px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 600,
                      border: `1px solid ${on ? `var(--color-${tone})` : "var(--line-2)"}`,
                      background: on ? `var(--color-${tone})` : "transparent",
                      color: on ? "#F3EFE7" : "var(--color-ink)",
                    }}
                  >{g}</button>
                );
              })}
            </div>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason — e.g. handled client escalation well"
            rows={2}
            maxLength={500}
            style={{ ...fieldInput, resize: "vertical" }}
          />

          {error && <div style={{ color: "var(--color-rust)", fontSize: 12 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={add}
              disabled={!canSubmit}
              style={{ ...inkBtn, padding: "8px 16px", fontSize: 12, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
            >
              {busy ? "Saving…" : `${sign === 1 ? "Add" : "Deduct"}${pts > 0 ? ` ${pts} pts` : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PerformanceClient({ members, kpiRows, initialRemarks, currentMonth, canEdit, currentUserId }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<KpiRow[]>(kpiRows);
  const [remarks, setRemarks] = useState<Remark[]>(initialRemarks);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [remarksFor, setRemarksFor] = useState<{ member: Member; anchor: DOMRect } | null>(null);

  const kpiMap = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  const remarksByUser = remarks.reduce<Record<string, Remark[]>>((acc, r) => {
    (acc[r.user_id] ??= []).push(r);
    return acc;
  }, {});

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditing(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  function openEdit(member: Member) {
    const existing = kpiMap[member.id];
    setSaveError(null);
    setEditing({
      userId: member.id,
      periodMonth: month,
      drawings: String(existing?.drawings_completed ?? 0),
      errors: String(existing?.errors ?? 0),
      revisions: String(existing?.revisions ?? 0),
      deadlinePct: existing?.deadline_met_pct != null ? String(existing.deadline_met_pct) : "",
      clientRating: existing?.client_rating != null ? String(existing.client_rating) : "",
      siteDelay: String(existing?.site_delay_days ?? 0),
      notes: existing?.notes ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        user_id: editing.userId,
        period_month: editing.periodMonth,
        drawings_completed: parseInt(editing.drawings) || 0,
        errors: parseInt(editing.errors) || 0,
        revisions: parseInt(editing.revisions) || 0,
        deadline_met_pct: editing.deadlinePct !== "" ? parseFloat(editing.deadlinePct) : null,
        client_rating: editing.clientRating !== "" ? parseFloat(editing.clientRating) : null,
        site_delay_days: parseInt(editing.siteDelay) || 0,
        notes: editing.notes || null,
      };
      const res = await fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadRows(month);
        setEditing(null);
      } else {
        setSaveError("Couldn't save — check the values are in range.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function loadRows(m: string) {
    const res = await fetch(`/api/performance?month=${m}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
    }
  }

  async function loadRemarks(m: string) {
    const res = await fetch(`/api/performance/remarks?month=${m}`);
    if (res.ok) {
      const json = await res.json();
      setRemarks(json.data ?? []);
    }
  }

  async function changeMonth(m: string) {
    setMonth(m);
    setRemarksFor(null);
    setLoadingMonth(true);
    try {
      await Promise.all([loadRows(m), loadRemarks(m)]);
    } finally {
      setLoadingMonth(false);
    }
  }

  // Generate last 12 months for selector, anchored to `currentMonth` (passed
  // from the server). Deriving from a prop instead of `new Date()` keeps the
  // server and client render identical, so hydration succeeds.
  const monthOptions: { value: string; label: string }[] = [];
  {
    const [anchorYear, anchorMonth] = currentMonth.split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      const d = new Date(anchorYear, anchorMonth - 1 - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      monthOptions.push({ value: val, label: fmtMonth(val) });
    }
  }

  // Scored members first, highest overall KPI on top.
  const ranked = [...members].sort((a, b) => {
    const ra = kpiMap[a.id]?.overall_kpi_score ?? -Infinity;
    const rb = kpiMap[b.id]?.overall_kpi_score ?? -Infinity;
    return rb - ra || a.full_name.localeCompare(b.full_name);
  });
  const pillBtn: React.CSSProperties = {
    padding: "5px 12px", borderRadius: 999, border: "1px solid var(--line-2)",
    background: "var(--bg-2)", fontSize: 11, cursor: "pointer", color: "var(--color-ink)",
    fontWeight: 500, whiteSpace: "nowrap", fontFamily: "inherit",
  };

  const editingRow = editing ? kpiMap[editing.userId] : undefined;

  return (
    <div className={styles.shell}>
      {/* Hero strip — same treatment as Overview */}
      <div className={styles.hero}>
        <div>
          <div className={styles.heroLabel}>{fmtMonth(month)} · Monthly KPIs</div>
          <h1 className={styles.heroTitle}>
            Team <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>Performance</em>
          </h1>
        </div>
        <select
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
          style={{
            padding: "9px 16px", borderRadius: 999, border: "1px solid var(--line-2)",
            background: "var(--color-paper-light)", fontSize: 13, color: "var(--color-ink)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.grid} style={{ opacity: loadingMonth ? 0.6 : 1, transition: "opacity .15s", marginBottom: 18 }}>
        {/* Leaderboard — monthly KPI inputs, ranked by overall score. */}
        <div className={`${styles.card} ${styles.full}`}>
          <CardHead title="Leaderboard" subtitle={`Ranked by monthly KPI score incl. remarks · ${fmtMonth(month)}`} />
          <div style={{ overflowX: "auto" }} onScroll={() => setRemarksFor(null)}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                  {["#", "Member", "Score", "Drawings", "Errors", "Revisions", "Deadline Met", "Client Rating", "Site Delay", "Remarks", ""].map((h) => (
                    <th key={h} style={{
                      textAlign: h === "Member" || h === "" || h === "#" ? "left" : "center",
                      padding: "8px 10px 12px",
                      fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase",
                      letterSpacing: 0.6, fontWeight: 500, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((m, i) => {
                  const r = kpiMap[m.id];
                  const score = r ? Math.round(Number(r.overall_kpi_score)) : null;
                  const mine = remarksByUser[m.id] ?? [];
                  const net = mine.reduce((s, x) => s + Number(x.points), 0);
                  const open = remarksFor?.member.id === m.id;
                  return (
                    <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                      <td className="mono" style={{ padding: "12px 10px", color: "var(--color-tan)" }}>{r ? i + 1 : "—"}</td>
                      <td style={{ padding: "12px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Avatar initials={initials(m.full_name)} tone={roleTone(m.role)} size={28} />
                          <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{m.full_name}</div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        {score != null ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <span className="mono" style={{ fontWeight: 600, color: scoreColor(score), minWidth: 32, textAlign: "right" }}>{score}</span>
                            <span style={{ minWidth: 42 }}><Chip size="sm" tone={gradeTone(scoreGrade(score))} label={scoreGrade(score)} /></span>
                          </div>
                        ) : <div className="mono" style={{ textAlign: "center", color: "var(--color-tan)" }}>—</div>}
                      </td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px" }}>{r ? r.drawings_completed : "—"}</td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px", color: (r?.errors ?? 0) > 0 ? "var(--color-rust)" : undefined }}>{r ? r.errors : "—"}</td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px" }}>{r ? r.revisions : "—"}</td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px" }}>{r?.deadline_met_pct != null ? `${r.deadline_met_pct}%` : "—"}</td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px" }}>{r?.client_rating != null ? r.client_rating : "—"}</td>
                      <td className="mono" style={{ textAlign: "center", padding: "12px 10px", color: (r?.site_delay_days ?? 0) > 0 ? "var(--color-rust)" : "var(--color-tan)" }}>
                        {r ? (r.site_delay_days > 0 ? `+${r.site_delay_days}d` : "—") : "—"}
                      </td>
                      <td style={{ textAlign: "center", padding: "12px 10px" }}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={(e) => {
                            const anchor = e.currentTarget.getBoundingClientRect();
                            setRemarksFor(open ? null : { member: m, anchor });
                          }}
                          className="mono"
                          style={{
                            ...pillBtn,
                            background: open ? "var(--color-ink)" : mine.length ? "transparent" : "var(--bg-2)",
                            color: open ? "#F3EFE7" : mine.length ? (net >= 0 ? "var(--color-forest)" : "var(--color-rust)") : "var(--color-tan)",
                            fontWeight: 600,
                          }}
                        >
                          {mine.length
                            ? `${fmtPts(net)} · ${mine.length}`
                            : canEdit && m.id !== currentUserId ? "+ Remark" : "—"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "right" }}>
                        <button onClick={() => openEdit(m)} style={pillBtn}>{r ? "Edit" : "Add"}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tracked activity — same card as Overview. */}
      <TeamPerformanceCard />

      {remarksFor && (
        <RemarksPopover
          key={remarksFor.member.id}
          anchor={remarksFor.anchor}
          member={remarksFor.member}
          month={month}
          remarks={remarksByUser[remarksFor.member.id] ?? []}
          canWrite={canEdit && remarksFor.member.id !== currentUserId}
          onClose={() => setRemarksFor(null)}
          onChanged={() => Promise.all([loadRows(month), loadRemarks(month)]).then(() => undefined)}
        />
      )}

      {/* Edit Modal */}
      {editing && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(27,26,23,.45)", backdropFilter: "blur(4px)",
            zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="modal-mobile-full"
            style={{
              background: "var(--color-paper-light)", color: "var(--color-ink)", borderRadius: 28, padding: 28,
              width: "100%", maxWidth: 560, maxHeight: "calc(100dvh - 40px)", overflowY: "auto", boxSizing: "border-box",
              boxShadow: "0 8px 40px -10px rgba(27,26,23,.35)", border: "1px solid var(--line-2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 24, margin: "0 0 4px", letterSpacing: -0.3 }}>
                  {editingRow ? "Edit KPI Entry" : "Add KPI Entry"}
                </h2>
                <p style={{ fontSize: 12, color: "var(--color-tan)", margin: 0 }}>
                  {members.find(m => m.id === editing.userId)?.full_name} · {fmtMonth(editing.periodMonth)}
                </p>
              </div>
              {editingRow && (() => {
                const s = Math.round(Number(editingRow.overall_kpi_score));
                return (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 34, lineHeight: 1, color: scoreColor(s) }}>{s}</span>
                      <Chip size="sm" tone={gradeTone(scoreGrade(s))} label={scoreGrade(s)} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-tan)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      Current score
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Pillar breakdown — uncapped, so values above 100 show as-is. */}
            {editingRow && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8,
                marginTop: 18, padding: 12, borderRadius: 16, background: "var(--bg-2)",
              }}>
                {[
                  { label: "Efficiency", v: Number(editingRow.efficiency_score) },
                  { label: "Quality", v: Number(editingRow.quality_score) },
                  { label: "Delivery", v: Number(editingRow.delivery_score) },
                  { label: "Remarks", v: Number(editingRow.remark_points ?? 0), signed: true },
                ].map((p) => (
                  <div key={p.label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.6 }}>{p.label}</div>
                    <div className="mono" style={{
                      fontSize: 15, fontWeight: 600, marginTop: 3,
                      color: p.signed ? (p.v > 0 ? "var(--color-forest)" : p.v < 0 ? "var(--color-rust)" : "var(--color-tan)") : "var(--color-ink)",
                    }}>
                      {p.signed ? (p.v === 0 ? "0" : fmtPts(p.v)) : Math.round(p.v)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 20 }}>
              {[
                { label: "Drawings Completed", key: "drawings" as const, min: 0, step: 1 },
                { label: "Errors", key: "errors" as const, min: 0, step: 1 },
                { label: "Revisions", key: "revisions" as const, min: 0, step: 1 },
                { label: "Deadline Met %", key: "deadlinePct" as const, placeholder: "0–100", min: 0, max: 100, step: 0.5 },
                { label: "Client Rating", key: "clientRating" as const, placeholder: "1–10", min: 1, max: 10, step: 0.5 },
                { label: "Site Delay (days)", key: "siteDelay" as const, min: 0, step: 1 },
              ].map(({ label, key, placeholder, min, max, step }) => (
                <div key={key}>
                  <label htmlFor={`kpi-${key}`} style={fieldLabel}>{label}</label>
                  <input
                    id={`kpi-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    max={max}
                    step={step}
                    value={editing[key]}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                    placeholder={placeholder}
                    style={fieldInput}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <label htmlFor="kpi-notes" style={fieldLabel}>Notes</label>
              <textarea
                id="kpi-notes"
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Optional notes…"
                rows={2}
                style={{ ...fieldInput, resize: "vertical" }}
              />
            </div>

            {saveError && <div style={{ color: "var(--color-rust)", fontSize: 12, marginTop: 12 }}>{saveError}</div>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button onClick={() => setEditing(null)} style={ghostBtn}>Cancel</button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{ ...inkBtn, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
