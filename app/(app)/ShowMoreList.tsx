"use client";

import { Children, useState, type ReactNode } from "react";

// Renders the first `initial` children; a toggle appears only when there are more.
export default function ShowMoreList({ initial, children }: { initial: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {open ? items : items.slice(0, initial)}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            marginTop: 14, padding: 10, borderRadius: 12, border: "1px dashed var(--line-2, #D6CDBA)",
            color: "var(--color-tan)", fontSize: 12, background: "none", cursor: "pointer", width: "100%",
            fontFamily: "inherit",
          }}
        >
          {open ? "Show fewer" : `Show ${hidden} more ${hidden === 1 ? "update" : "updates"}`}
        </button>
      )}
    </>
  );
}
