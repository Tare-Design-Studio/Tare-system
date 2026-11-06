"use client";

import React, { useEffect, useRef, useState } from "react";

interface InfoRow {
  label: string;
  value: string | null;
}

export default function ProjectInfoPopover({ rows }: { rows: InfoRow[] }) {
  const [open, setOpen] = useState(false);
  // Screen position of the card, measured from the button on open. Fixed and
  // clamped to the viewport so it can't run off the right edge on phones,
  // where the button sits at the end of a long project name.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(280, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
      setPos({ top: r.bottom + 8, left, width });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // A fixed card would drift from its button on scroll, so close instead.
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        aria-label="Project info"
        ref={btnRef}
        aria-expanded={open}
        onClick={toggle}
        style={{
          width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--color-line)",
          background: open ? "var(--color-ink)" : "var(--color-paper-light)",
          color: open ? "var(--color-paper-light)" : "var(--color-tan)",
          fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
        }}
      >
        i
      </button>
      {open && pos && (
        <div
          role="dialog"
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 50, width: pos.width,
            maxHeight: `calc(100dvh - ${pos.top + 16}px)`, overflowY: "auto", boxSizing: "border-box",
            background: "var(--color-paper-light)", border: "1px solid var(--color-line)", borderRadius: 16,
            padding: 16, boxShadow: "0 24px 60px -20px rgba(27,26,23,.3)", color: "var(--color-ink)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Project Info
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                <span style={{ color: "var(--color-tan)" }}>{row.label}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
