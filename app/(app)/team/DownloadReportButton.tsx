"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/atoms";
import styles from "./team-access.module.css";

type ReportMonth = { key: string; label: string };

export function DownloadReportButton({ months }: { months: ReportMonth[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(months[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function download() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/monthly?month=${selected}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate report");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setBusy(false);
    }
  }

  if (months.length === 0) return null;

  return (
    <div className={styles.headerInviteDisclosure} ref={ref}>
      <button
        type="button"
        className={styles.button}
        aria-label="Download monthly report"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="download" size={14} />
        Download Report
      </button>
      {open && (
        <div className={styles.headerInvitePanel} style={{ width: 300 }}>
          <div
            style={{
              background: "var(--aos-paper)",
              border: "1px solid var(--aos-line-2)",
              borderRadius: 14,
              padding: 16,
              boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--aos-ink)" }}>Monthly Report</div>
            <div style={{ fontSize: 11, color: "var(--aos-muted)", lineHeight: 1.4 }}>
              Professional PDF report for a completed month. The current month becomes available on the 1st.
            </div>
            <label style={{ fontSize: 11, color: "var(--aos-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
              Month
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--aos-line-2)",
                  background: "#fff",
                  fontSize: 13,
                  color: "var(--aos-ink)",
                }}
              >
                {months.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>
            {error && <div style={{ fontSize: 11, color: "var(--aos-rose)" }}>{error}</div>}
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={download}
            >
              <Icon name="download" size={14} />
              {busy ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
