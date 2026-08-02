"use client";

import { useState } from "react";

// Customer feedback on a finished stage (client request #8) — a rating after a
// slab, a handover, any completed milestone, rather than only at the end of the
// project.
//
// The portal has no login: identity is the hashed URL, which is passed straight
// through to the API and re-checked server-side against the checkpoint.

export default function StageFeedback({
  portalHash,
  checkpointId,
  checkpointName,
  existingRating,
  existingComment,
}: {
  portalHash: string;
  checkpointId: string;
  checkpointName: string;
  existingRating?: number | null;
  existingComment?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existingRating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existingComment ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existingRating);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) { setError("Pick a rating first"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_hash: portalHash,
          checkpoint_id: checkpointId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not send");
      setSaved(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSaving(false);
    }
  }

  if (saved && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--muted)", cursor: "pointer", marginTop: 6 }}
      >
        {"★".repeat(rating)}{"☆".repeat(5 - rating)} · edit feedback
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 8, padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: "transparent", color: "var(--ink)", border: "1px solid var(--line-2)", cursor: "pointer",
        }}
      >
        Leave feedback
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--line-2)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
        How was <strong style={{ color: "var(--ink)" }}>{checkpointName}</strong>?
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => { setRating(n); setError(null); }}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 22, lineHeight: 1,
              color: n <= (hover || rating) ? "var(--accent)" : "var(--line-2)",
            }}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Anything you'd like the team to know (optional)"
        rows={2}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit", resize: "vertical",
          color: "var(--ink)", background: "var(--bg)", border: "1px solid var(--line-2)",
          borderRadius: 8, outline: "none", boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: "var(--ink)", color: "#F3EFE7", border: "none",
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Sending…" : "Send feedback"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", fontSize: 12, color: "var(--muted)", cursor: "pointer" }}
        >
          Cancel
        </button>
        {error && <span style={{ fontSize: 11, color: "#B4553F" }}>{error}</span>}
      </div>
    </div>
  );
}
