"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Small modal confirm. Rendered only while a confirmation is pending — the
// caller holds the "what am I confirming" state and unmounts this on either
// outcome.
export default function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(30,28,24,.28)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-paper-light)",
          borderRadius: 18,
          padding: 22,
          width: "100%",
          maxWidth: 340,
          border: "1px solid rgba(30,28,24,.06)",
          boxShadow: "0 24px 60px -20px rgba(30,28,24,.35)",
        }}
      >
        <div style={{ fontSize: 18, fontFamily: "'Instrument Serif', serif", letterSpacing: -0.2 }}>{title}</div>
        {body && (
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 8, lineHeight: 1.5 }}>{body}</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--color-line)", background: "transparent",
              color: "var(--color-ink)", cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: "none", background: "var(--color-ink)", color: "#FBF8F2", cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
