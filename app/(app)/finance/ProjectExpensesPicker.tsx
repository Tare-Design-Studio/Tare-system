"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PickerProject = { id: string; name: string };

export function ProjectExpensesPicker({ projects }: { projects: PickerProject[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          minHeight: 38, padding: "9px 16px", borderRadius: 12,
          border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
          color: "var(--color-ink)", fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        Expenses
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div
          role="menu"
          className="dropdown-mobile-safe"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            width: 260, maxHeight: 320, overflowY: "auto", padding: 6,
            borderRadius: 14, background: "var(--color-paper-light)",
            border: "1px solid var(--color-line)",
            boxShadow: "0 8px 28px -8px rgba(30,28,24,.28)",
          }}
        >
          {projects.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-tan)", padding: "12px 10px", textAlign: "center" }}>
              No projects available.
            </div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push(`/projects/${p.id}/expenses`);
                }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "9px 10px", borderRadius: 9, border: "none",
                  background: "transparent", color: "var(--color-ink)",
                  fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {p.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
