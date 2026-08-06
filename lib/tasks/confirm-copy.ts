// Wording for the task check-mark confirmation. Shared so /tasks and the
// team-member Tasks card never drift apart.
//
// Three cases, because the tick does three different things (095):
//   - a project-linked task submits for owner review, and the member cannot
//     undo it themselves
//   - an unlinked personal todo just closes
//   - unticking reopens either kind

export type TaskConfirmCopy = {
  title: string;
  body: string;
  confirmLabel: string;
};

export function taskConfirmCopy(opts: {
  completed: boolean;
  goesToReview: boolean;
  /** Name of the reviewer the member picked (096). Absent = the owner. */
  reviewerName?: string | null;
}): TaskConfirmCopy {
  if (!opts.completed) {
    return {
      title: "Mark incomplete?",
      body: "This reopens the task and clears its completion time.",
      confirmLabel: "Mark incomplete",
    };
  }

  if (opts.goesToReview) {
    return {
      title: "Submit for review?",
      body: `This goes to ${opts.reviewerName ?? "the owner"} for review instead of closing, and you cannot edit it while it waits.`,
      confirmLabel: "Submit",
    };
  }

  return {
    title: "Mark complete?",
    body: "This closes the task and stamps its completion time.",
    confirmLabel: "Mark complete",
  };
}

/**
 * How a due date stands relative to now: "overdue" only once the day is over.
 *
 * `due_date` is a DATE, so `new Date("2026-08-06")` parses as midnight UTC and
 * any comparison against `now` marks a task due TODAY as already late. The day
 * is therefore closed at its last second in the viewer's own timezone, matching
 * v_task_performance_monthly (084), which compares `completed_at::date <=
 * due_date` — a task finished on its due date is on time.
 */
export type DueState = "none" | "upcoming" | "today" | "overdue";

export function dueState(dueDate: string | null | undefined, nowMs: number = Date.now()): DueState {
  if (!dueDate) return "none";
  const endOfDueDay = new Date(`${dueDate}T23:59:59`).getTime();
  if (Number.isNaN(endOfDueDay)) return "none";
  if (nowMs > endOfDueDay) return "overdue";
  // Same calendar day in local time — "today" is a deadline, not a failure.
  const startOfDueDay = new Date(`${dueDate}T00:00:00`).getTime();
  return nowMs >= startOfDueDay ? "today" : "upcoming";
}

/** Short suffix for a due-date label: "· due today", "· overdue", or "". */
export function dueSuffix(state: DueState): string {
  if (state === "overdue") return " · overdue";
  if (state === "today") return " · due today";
  return "";
}

// A task's tick routes to review only when it is linked to a project and has
// not already been reviewed (095's trigger uses the same two conditions).
export function goesToReview(task: {
  project_id?: string | null;
  reviewed_by?: string | null;
}): boolean {
  return !!task.project_id && !task.reviewed_by;
}
