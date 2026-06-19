"use client";

import { createContext, useContext, useState } from "react";
import { Icon } from "@/components/atoms";
import styles from "./team-access.module.css";

const EditModeContext = createContext(false);

export function useMemberEditMode(): boolean {
  return useContext(EditModeContext);
}

// Wraps the Members card body. Renders the card title with an edit-mode toggle
// pencil (shown only when `enabled`); toggling it reveals each row's
// MemberManageMenu, which reads the state via useMemberEditMode().
export function MemberEditModeProvider({
  children,
  enabled,
  cornerSlot,
}: {
  children: React.ReactNode;
  enabled: boolean;
  // Extra control rendered in the card's top-right corner (e.g. access-matrix link).
  cornerSlot?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <EditModeContext.Provider value={enabled && editing}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Members</h2>
          <p>Directory · roles · invite status</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {cornerSlot}
          {enabled && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-label={editing ? "Done editing members" : "Edit members"}
              aria-pressed={editing}
              title={editing ? "Done" : "Edit members"}
              style={{
                width: 34, height: 34, borderRadius: 12, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: editing ? "1px solid var(--color-ink)" : "0",
                background: editing ? "var(--color-ink)" : "rgba(30, 28, 24, 0.04)",
                color: editing ? "#F3EFE7" : "var(--color-ink)",
                cursor: "pointer",
              }}
            >
              <Icon name="pencil" size={15} />
            </button>
          )}
        </div>
      </div>
      {children}
    </EditModeContext.Provider>
  );
}
