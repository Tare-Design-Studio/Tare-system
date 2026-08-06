"use client";

import Link from "next/link";
import { Avatar, Chip, Icon } from "@/components/atoms";
import {
  fmtDuration,
  TASK_TAG_LABEL,
  TASK_REVIEW_STYLE,
  TASK_STATUS_LABEL,
  type MemberTaskMetrics,
} from "./taskTime";
import { dueState } from "@/lib/tasks/confirm-copy";
import styles from "./team-access.module.css";

export interface MemberDetail {
  id: string;
  name: string;
  roleLabel: string;
  initials: string;
  tone: "forest" | "amber" | "indigo";
  presentDays: number;
  hours: string;
  checkIns: number;
  siteVisits: number;
  grade: string;
  score: number;
  quality: string;
  tasks: MemberTaskMetrics;
}

/** Conic-gradient score ring — paper equivalent of the luma BigRing. */
function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div
      className={styles.ring}
      style={{
        background: `conic-gradient(var(--color-forest) ${pct * 3.6}deg, var(--color-line) 0deg)`,
      }}
    >
      <div className={styles.ringInner}>{score}</div>
    </div>
  );
}

function TaskMetrics({ tasks, nowMs }: { tasks: MemberTaskMetrics; nowMs: number }) {
  const {
    activeTasks, completedTasks, completedCount, avgTakenMs,
    tagCounts, onTimePct, errorCount, revisionCount,
  } = tasks;
  const hasAny = activeTasks.length > 0 || completedTasks.length > 0;
  const tagEntries = Object.entries(tagCounts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Tasks</span>
        <div className={styles.metricChips}>
          <span className={styles.metricChip}>{activeTasks.length} active</span>
          <span className={styles.metricChip}>{completedCount} done</span>
          {avgTakenMs != null && (
            <span className={styles.metricChip}>avg {fmtDuration(avgTakenMs)}</span>
          )}
        </div>
      </div>

      {/* Quality / timeliness — the same inputs the score is built from. */}
      {(onTimePct != null || (errorCount ?? 0) > 0 || (revisionCount ?? 0) > 0) && (
        <div className={styles.metricChips} style={{ marginTop: 8 }}>
          {onTimePct != null && (
            <Chip
              label={`${onTimePct}% on time`}
              tone={onTimePct >= 80 ? "mint" : onTimePct >= 50 ? "amber" : "rose"}
              size="sm"
            />
          )}
          {(revisionCount ?? 0) > 0 && (
            <Chip label={`${revisionCount} revision${revisionCount === 1 ? "" : "s"}`} tone="amber" size="sm" />
          )}
          {(errorCount ?? 0) > 0 && (
            <Chip label={`${errorCount} error${errorCount === 1 ? "" : "s"}`} tone="rose" size="sm" />
          )}
        </div>
      )}

      {tagEntries.length > 0 && (
        <div className={styles.metricChips} style={{ marginTop: 8 }}>
          {tagEntries.map(([tag, n]) => (
            <span key={tag} className={styles.metricChip}>
              {TASK_TAG_LABEL[tag] ?? tag} · {n}
            </span>
          ))}
        </div>
      )}

      {!hasAny && <div className={styles.emptyNote}>No tasks logged yet.</div>}

      {activeTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {activeTasks.map((t, i) => {
            const due = dueState(t.dueDate, nowMs);
            const overdue = due === "overdue";
            return (
              <div key={`a${i}`} className={styles.taskRow}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span className={styles.taskTitle}>{t.title}</span>
                  {t.tag && t.tag !== "other" && (
                    <span className={styles.taskMeta}>{TASK_TAG_LABEL[t.tag] ?? t.tag}</span>
                  )}
                  {t.status && t.status !== "open" && (
                    <span className={styles.taskMeta} style={{ color: "var(--color-forest)" }}>
                      {TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  )}
                </span>
                <span
                  className={styles.taskMeta}
                  style={
                    overdue
                      ? { color: "var(--color-rose)" }
                      : due === "today" ? { color: "var(--color-amber)" } : undefined
                  }
                >
                  {overdue ? "overdue · " : due === "today" ? "due today · " : ""}
                  open {fmtDuration(nowMs - new Date(t.createdAt).getTime())}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {completedTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {completedTasks.map((t, i) => {
            const verdict = t.review ? TASK_REVIEW_STYLE[t.review] : null;
            return (
              <div key={`c${i}`} className={`${styles.taskRow} ${styles.taskDone}`}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <Icon name="check" size={12} style={{ color: "var(--color-mint)", flex: "none" }} />
                  <span className={styles.taskTitle}>{t.title}</span>
                  {t.tag && t.tag !== "other" && (
                    <span className={styles.taskMeta}>{TASK_TAG_LABEL[t.tag] ?? t.tag}</span>
                  )}
                  {verdict && <Chip label={verdict.label} tone={verdict.tone} size="sm" />}
                  {t.late && <Chip label="late" tone="rose" size="sm" />}
                </span>
                <span className={styles.taskMeta} style={{ color: "var(--color-forest)", fontWeight: 600 }}>
                  {fmtDuration(t.takenMs)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MemberDetailModal({
  member,
  nowMs,
  canSeePerformance,
  onClose,
}: {
  member: MemberDetail;
  /** Server-pinned clock — keeps elapsed labels stable across hydration. */
  nowMs: number;
  /**
   * Whether attendance and KPI may be shown (096). A coordinator sees the task
   * list only — the figures below are not fetched for them, so the ring and stat
   * boxes would otherwise render zeros as if the member had done nothing.
   */
  canSeePerformance: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={member.name}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <Avatar initials={member.initials} tone={member.tone} size={46} />
            <div style={{ minWidth: 0 }}>
              <h3 className={styles.modalTitle}>{member.name}</h3>
              <div className={styles.taskMeta} style={{ marginTop: 4 }}>{member.roleLabel}</div>
            </div>
          </div>
          <button className={styles.cornerButton} onClick={onClose} type="button" aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        {canSeePerformance && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 20 }}>
              <ScoreRing score={member.score} />
              <div className={styles.statGrid}>
                <div className={styles.statBox}><span>Present</span><strong>{member.presentDays} days</strong></div>
                <div className={styles.statBox}><span>Hours</span><strong>{member.hours}</strong></div>
                <div className={styles.statBox}><span>Check-ins</span><strong>{member.checkIns}</strong></div>
                <div className={styles.statBox}><span>Site visits</span><strong>{member.siteVisits}</strong></div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
              <span className={styles.taskMeta}>Delivery</span>
              <span className={styles.grade}>{member.grade}</span>
              <span className={styles.taskMeta} style={{ marginLeft: 10 }}>Quality</span>
              <span className={styles.grade}>{member.quality}</span>
            </div>
          </>
        )}

        <TaskMetrics tasks={member.tasks} nowMs={nowMs} />

        <div className={styles.modalActions}>
          {/* /team/[memberId] renders pay and full attendance — not a coordinator's
              to see. They get this modal's task list instead. */}
          {canSeePerformance && (
            <Link
              href={`/team/${member.id}`}
              className={`${styles.button} ${styles.buttonPrimary}`}
              style={{ justifyContent: "center", textDecoration: "none" }}
            >
              Full profile
            </Link>
          )}
          <button className={styles.button} type="button" onClick={onClose} style={{ justifyContent: "center" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
