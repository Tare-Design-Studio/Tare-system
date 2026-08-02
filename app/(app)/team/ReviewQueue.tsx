"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/atoms";
import { fmtDuration, TASK_TAG_LABEL } from "./taskTime";
import styles from "./team-access.module.css";

type ReviewTask = {
  id: string;
  title: string;
  tag: string | null;
  user_id: string;
  accepted_at: string | null;
  submitted_at: string | null;
};

type MemberLookup = Record<string, { name: string; initials: string }>;

const VERDICTS = [
  { value: "clean", label: "Approve", className: styles.verdictClean },
  { value: "revision", label: "Revision", className: styles.verdictRevision },
  { value: "error", label: "Error", className: styles.verdictError },
] as const;

/**
 * Owner review queue — tasks submitted by members and awaiting a verdict.
 * Reads /api/member-tasks?scope=review; the API and migration 086 both block
 * self-review, so a reviewer never sees their own submitted work here.
 */
export function ReviewQueue({
  members,
  currentUserId,
}: {
  members: MemberLookup;
  /** Used to hide the caller's own submissions — see the filter below. */
  currentUserId: string;
}) {
  const [tasks, setTasks] = useState<ReviewTask[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member-tasks?scope=review")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReviewTask[]) => {
        // `?scope=review` filters on status only, so an assign-holder who is
        // also assignable (project_manager / admin-tagged member) would see
        // their OWN submitted work here. The API and migration 086 both reject
        // self-review with a 403 — drop those rows so we never render a verdict
        // button that is guaranteed to fail.
        if (!cancelled) {
          const rows = Array.isArray(data) ? data : [];
          setTasks(rows.filter((t) => t.user_id !== currentUserId));
        }
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    return () => { cancelled = true; };
  }, [currentUserId]);

  async function review(id: string, verdict: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/member-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", review_status: verdict }),
      });
      if (res.ok) {
        setTasks((prev) => (prev ?? []).filter((t) => t.id !== id));
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save the review");
      }
    } catch {
      setError("Could not save the review");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>
        <div className={styles.cardTitleText}>
          <h2 className="font-serif">Review queue</h2>
          <p>{tasks ? `${tasks.length} awaiting review` : "Submitted work"}</p>
        </div>
      </div>

      {error && <div className={styles.errorNote}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks === null ? (
          <div className={styles.emptyNote}>Loading…</div>
        ) : tasks.length === 0 ? (
          <div className={styles.emptyNote}>Nothing to review right now.</div>
        ) : (
          tasks.map((t) => {
            const who = members[t.user_id];
            const logged = t.accepted_at && t.submitted_at
              ? fmtDuration(new Date(t.submitted_at).getTime() - new Date(t.accepted_at).getTime())
              : null;
            return (
              <div
                key={t.id}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar initials={who?.initials ?? "?"} tone="indigo" size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.taskTitle} style={{ fontWeight: 600, fontSize: 13 }}>
                      {t.title}
                    </div>
                    <div className={styles.taskMeta}>
                      {who?.name ?? "Member"}
                      {t.tag && t.tag !== "other" ? ` · ${TASK_TAG_LABEL[t.tag] ?? t.tag}` : ""}
                      {logged ? ` · ${logged}` : ""}
                    </div>
                  </div>
                </div>
                <div className={styles.verdictRow}>
                  {VERDICTS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      className={`${styles.verdictButton} ${v.className}`}
                      disabled={busyId === t.id}
                      onClick={() => review(t.id, v.value)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
