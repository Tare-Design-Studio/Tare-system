// Duration helpers and task vocabulary for member-task metrics.
// Tags and review verdicts are fixed by migration 083; the tag weights below
// mirror v_task_performance_monthly (084) so the UI and the DB agree.

/** Format a millisecond duration as a short human string, e.g. "2d 4h", "3h", "45m". */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remMins = mins % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
  return `${remMins}m`;
}

export type TaskTag = "drawing" | "review" | "site" | "admin" | "other";
export type TaskReview = "clean" | "revision" | "error" | null;
/** Lifecycle states from migration 083. */
export type TaskStatus = "open" | "accepted" | "in_progress" | "pending_review" | "completed";

export const TASK_TAG_LABEL: Record<string, string> = {
  drawing: "Drawing", review: "Review", site: "Site", admin: "Admin", other: "Task",
};

export const TASK_REVIEW_STYLE: Record<string, { label: string; tone: "mint" | "amber" | "rose" }> = {
  clean: { label: "Approved", tone: "mint" },
  revision: { label: "Revision", tone: "amber" },
  error: { label: "Error", tone: "rose" },
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  accepted: "Accepted",
  in_progress: "In progress",
  pending_review: "In review",
  completed: "Completed",
};

export interface CompletedTask {
  title: string;
  /** completed_at − start (accepted_at for assigned work, created_at otherwise), in ms */
  takenMs: number;
  tag?: string;
  review?: TaskReview;
  late?: boolean;
  assigned?: boolean;
}

export interface ActiveTask {
  title: string;
  createdAt: string;
  tag?: string;
  dueDate?: string | null;
  assigned?: boolean;
  status?: string;
}

export interface MemberTaskMetrics {
  activeTasks: ActiveTask[];
  completedTasks: CompletedTask[];
  completedCount: number;
  avgTakenMs: number | null;
  tagCounts?: Record<string, number>;
  onTimePct?: number | null;
  errorCount?: number;
  revisionCount?: number;
}

/** 0–100 score → letter grade. Same bands the Performance page reads. */
export function scoreToGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}
