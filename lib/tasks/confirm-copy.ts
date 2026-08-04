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
      body: "This goes to the owner for review instead of closing, and you cannot edit it while it waits.",
      confirmLabel: "Submit",
    };
  }

  return {
    title: "Mark complete?",
    body: "This closes the task and stamps its completion time.",
    confirmLabel: "Mark complete",
  };
}

// A task's tick routes to review only when it is linked to a project and has
// not already been reviewed (095's trigger uses the same two conditions).
export function goesToReview(task: {
  project_id?: string | null;
  reviewed_by?: string | null;
}): boolean {
  return !!task.project_id && !task.reviewed_by;
}
