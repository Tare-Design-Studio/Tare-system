"use client";

import { useState, useMemo } from "react";

type Row = {
  id: string;
  amount: number;
  category: string | null;
  description: string | null;
  spent_on: string;
  approval_status: string;
  project_name: string | null;
};

export function DailyExpensesCard({ initial, nowMs }: { initial: Row[]; nowMs: number }) {
  // `nowMs` is the server clock — used for the initial date range so the
  // server and client first render produce identical HTML (hydration-safe).
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  function presetRange(days: number) {
    const t = new Date();
    const f = new Date(t.getTime() - days * 24 * 60 * 60 * 1000);
    setFrom(f.toISOString().slice(0, 10));
    setTo(t.toISOString().slice(0, 10));
  }
  function presetMonth() {
    const t = new Date();
    setFrom(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`);
    setTo(t.toISOString().slice(0, 10));
  }

  const filtered = useMemo(
    () => initial.filter((r) => r.spent_on >= from && r.spent_on <= to),
    [initial, from, to]
  );

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div style={{ background: "var(--color-paper-light)", border: "1px solid rgba(30,28,24,.04)", borderRadius: 22, padding: 24, marginTop: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22 }}>Daily Expenses</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 4 }}>
            {filtered.length} entries · ₹{Math.round(total).toLocaleString("en-IN")} total
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button onClick={() => presetRange(7)} style={btn}>Week</button>
          <button onClick={presetMonth} style={btn}>Month</button>
          <button onClick={() => presetRange(90)} style={btn}>3 months</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
          <span style={{ fontSize: 11, color: "var(--color-tan)" }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "var(--color-tan)", fontSize: 13, textAlign: "center", padding: 24 }}>
          No expenses in this range.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                <th style={th}>Date</th>
                <th style={th}>Project</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                  <td style={td}>{r.spent_on}</td>
                  <td style={td}>{r.project_name ?? "—"}</td>
                  <td style={td}>{r.category ?? "—"}</td>
                  <td style={td}>{r.description ?? "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>₹{Math.round(Number(r.amount)).toLocaleString("en-IN")}</td>
                  <td style={td}>{r.approval_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  background: "transparent",
  fontSize: 12,
  cursor: "pointer",
};

const inp: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 12,
};

const th: React.CSSProperties = { textAlign: "left", padding: "10px 10px", fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 };
const td: React.CSSProperties = { padding: "12px 10px" };
