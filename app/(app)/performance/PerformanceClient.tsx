"use client";

import { useState } from "react";
import { Avatar, Chip, Card, CardTitle } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

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
  notes?: string | null;
};

type RevenueEntry = {
  revenue_contribution: number | null;
  active_project_count: number;
};

type Props = {
  members: Member[];
  kpiRows: KpiRow[];
  revenueMap: Record<string, RevenueEntry>;
  currentMonth: string;
};

function scoreGrade(score: number): string {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 55) return "B";
  return "C";
}

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

function fmtCurrency(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

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

export default function PerformanceClient({ members, kpiRows, revenueMap, currentMonth }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<KpiRow[]>(kpiRows);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const kpiMap = Object.fromEntries(rows.map((r) => [r.user_id, r]));

  function openEdit(member: Member) {
    const existing = kpiMap[member.id];
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
      }
    } finally {
      setSaving(false);
    }
  }

  async function loadRows(m: string) {
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/performance?month=${m}`);
      if (res.ok) {
        const json = await res.json();
        setRows(json.data ?? []);
      }
    } finally {
      setLoadingMonth(false);
    }
  }

  async function changeMonth(m: string) {
    setMonth(m);
    await loadRows(m);
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

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Team Performance"
        subtitle="Monthly KPI inputs & derived scores"
        actions={
        <select
          value={month}
          onChange={(e) => changeMonth(e.target.value)}
          style={{
            padding: "8px 14px", borderRadius: 10, border: "1px solid var(--line-2)",
            background: "var(--bg-2)", fontSize: 13, color: "var(--ink)", cursor: "pointer",
          }}
        >
          {monthOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        }
      />

      {/* KPI Table */}
      <Card>
        <CardTitle title="Performance Dashboard" subtitle={`Monthly KPIs · ${fmtMonth(month)}`} />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Member", "Drawings", "Errors", "Revisions", "Deadline Met", "Client Rating", "Site Delay", "Efficiency", "Quality", "Delivery", "Overall", "Revenue", ""].map((h) => (
                  <th key={h} style={{
                    textAlign: h === "Member" || h === "" ? "left" : "center",
                    padding: "8px 10px 12px",
                    fontSize: 11, color: "var(--muted)", textTransform: "uppercase",
                    letterSpacing: 0.6, fontWeight: 500, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const r = kpiMap[m.id];
                const effGrade = r ? scoreGrade(r.efficiency_score) : null;
                const qualGrade = r ? scoreGrade(r.quality_score) : null;
                const delGrade = r ? scoreGrade(r.delivery_score) : null;
                const overallGrade = r ? scoreGrade(r.overall_kpi_score) : null;
                const rev = revenueMap[m.id];
                return (
                  <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <td style={{ padding: "14px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar initials={m.full_name.split(" ").map(w => w[0]).join("").slice(0, 2)} tone={m.role === "owner" ? "forest" : m.role === "site_engineer" ? "amber" : "indigo"} size={28} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{m.full_name}</div>
                          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "capitalize" }}>{m.role.replace("_", " ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px" }}>{r ? r.drawings_completed : "—"}</td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px", color: (r?.errors ?? 0) > 0 ? "var(--rust)" : undefined }}>{r ? r.errors : "—"}</td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px" }}>{r ? r.revisions : "—"}</td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px" }}>{r?.deadline_met_pct != null ? `${r.deadline_met_pct}%` : "—"}</td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px" }}>{r?.client_rating != null ? r.client_rating : "—"}</td>
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px", color: (r?.site_delay_days ?? 0) > 0 ? "var(--rust)" : "var(--muted)" }}>
                      {r ? (r.site_delay_days > 0 ? `+${r.site_delay_days}d` : "—") : "—"}
                    </td>
                    {effGrade ? <td style={{ textAlign: "center", padding: "14px 8px" }}><Chip size="sm" tone={gradeTone(effGrade)} label={effGrade} /></td> : <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, padding: "14px 8px" }}>—</td>}
                    {qualGrade ? <td style={{ textAlign: "center", padding: "14px 8px" }}><Chip size="sm" tone={gradeTone(qualGrade)} label={qualGrade} /></td> : <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, padding: "14px 8px" }}>—</td>}
                    {delGrade ? <td style={{ textAlign: "center", padding: "14px 8px" }}><Chip size="sm" tone={gradeTone(delGrade)} label={delGrade} /></td> : <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, padding: "14px 8px" }}>—</td>}
                    {overallGrade ? <td style={{ textAlign: "center", padding: "14px 8px" }}><Chip size="sm" tone={gradeTone(overallGrade)} label={overallGrade} /></td> : <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 11, padding: "14px 8px" }}>—</td>}
                    <td className="mono" style={{ textAlign: "center", padding: "14px 10px", fontSize: 11, color: "var(--muted)" }}>
                      {fmtCurrency(rev?.revenue_contribution ?? null)}
                    </td>
                    <td style={{ padding: "14px 10px" }}>
                      <button
                        onClick={() => openEdit(m)}
                        style={{
                          padding: "5px 10px", borderRadius: 8, border: "1px solid var(--line-2)",
                          background: "var(--bg-2)", fontSize: 11, cursor: "pointer", color: "var(--ink)",
                          fontWeight: 500, whiteSpace: "nowrap",
                        }}
                      >
                        {r ? "Edit" : "Add"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Modal */}
      {editing && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(27,26,23,.45)", backdropFilter: "blur(4px)",
          zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div className="modal-mobile-full" style={{
            background: "var(--paper)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 520,
            boxShadow: "0 8px 40px -10px rgba(27,26,23,.35)", border: "1px solid var(--line)",
          }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: "0 0 4px" }}>
              {kpiMap[editing.userId] ? "Edit KPI Entry" : "Add KPI Entry"}
            </h2>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
              {members.find(m => m.id === editing.userId)?.full_name} · {fmtMonth(editing.periodMonth)}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Drawings Completed", key: "drawings" as const, type: "int" },
                { label: "Errors", key: "errors" as const, type: "int" },
                { label: "Revisions", key: "revisions" as const, type: "int" },
                { label: "Deadline Met %", key: "deadlinePct" as const, type: "float", placeholder: "0–100" },
                { label: "Client Rating", key: "clientRating" as const, type: "float", placeholder: "1–10" },
                { label: "Site Delay (days)", key: "siteDelay" as const, type: "int" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 500 }}>{label}</label>
                  <input
                    type="number"
                    value={editing[key]}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                    placeholder={placeholder}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 10,
                      border: "1px solid var(--line-2)", background: "var(--bg-2)",
                      fontSize: 13, color: "var(--ink)", boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6, fontWeight: 500 }}>Notes</label>
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Optional notes…"
                rows={2}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 10,
                  border: "1px solid var(--line-2)", background: "var(--bg-2)",
                  fontSize: 13, color: "var(--ink)", resize: "vertical", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--line-2)", background: "transparent", fontSize: 13, cursor: "pointer", color: "var(--ink)" }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--ink)", color: "#F3EFE7", fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, fontWeight: 500 }}
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
