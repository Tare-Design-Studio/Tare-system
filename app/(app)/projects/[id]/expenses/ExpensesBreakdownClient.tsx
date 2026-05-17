"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
  initialFrom: string;
  initialTo: string;
}

export function ExpensesBreakdownClient({ projectId, initialFrom, initialTo }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function apply(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    const qs = new URLSearchParams({ from: nextFrom, to: nextTo }).toString();
    router.push(`/projects/${projectId}/expenses?${qs}`);
  }

  function presetRange(days: number) {
    const t = new Date();
    const f = new Date(t.getTime() - days * 24 * 60 * 60 * 1000);
    apply(f.toISOString().slice(0, 10), t.toISOString().slice(0, 10));
  }

  function presetMonth() {
    const t = new Date();
    const monthStart = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
    apply(monthStart, t.toISOString().slice(0, 10));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, background: "var(--color-paper)", border: "1px solid var(--color-line)", borderRadius: 14, padding: "12px 16px" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => presetRange(7)} style={btn}>Week</button>
        <button onClick={presetMonth} style={btn}>Month</button>
        <button onClick={() => presetRange(90)} style={btn}>3 months</button>
      </div>
      <div style={{ width: 1, height: 24, background: "var(--color-line)" }} />
      <label style={lbl}>
        From
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
      </label>
      <label style={lbl}>
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
      </label>
      <button
        onClick={() => apply(from, to)}
        style={{ ...btn, background: "var(--color-ink)", color: "#FBF8F2", border: "none" }}
      >
        Apply
      </button>
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

const lbl: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: 1,
};

const inp: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 12,
};
