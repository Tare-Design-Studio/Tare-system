"use client";

import { useEffect, useState } from "react";

export type Reviewer = {
  id: string;
  full_name: string;
  role_label: string | null;
  role: string;
};

/**
 * The reviewer pool, fetched once per mount from /api/member-tasks/reviewers
 * (everyone holding tasks:assign, minus the caller).
 *
 * Returns an empty list on failure rather than surfacing an error: the picker is
 * optional — a task submitted with no reviewer named still routes to the
 * assigner or the owner, which is the pre-096 behaviour.
 */
export function useReviewers(enabled: boolean): Reviewer[] {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/member-tasks/reviewers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setReviewers(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);

  return reviewers;
}

interface ReviewerPickerProps {
  reviewers: Reviewer[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * "Send to" select shown in the submit-for-review confirmation. Empty value
 * means nobody was named, which routes to the assigner / owner as before.
 */
export function ReviewerPicker({ reviewers, value, onChange }: ReviewerPickerProps) {
  if (reviewers.length === 0) return null;

  return (
    <label style={{ display: "block", marginTop: 14 }}>
      <span
        style={{
          display: "block", fontSize: 10, textTransform: "uppercase",
          letterSpacing: 0.5, color: "var(--color-tan)", marginBottom: 6,
        }}
      >
        Send to
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%", padding: "9px 11px", borderRadius: 10,
          border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
          color: "#000", fontSize: 13,
        }}
      >
        <option value="">The owner</option>
        {reviewers.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name}
            {r.role_label ? ` · ${r.role_label}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
