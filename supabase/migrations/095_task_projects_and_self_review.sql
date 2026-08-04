-- 095: project link on member tasks + reviewable self-assigned tasks
--
-- Two related changes:
--
--   1. member_tasks.project_id — a task may now name the project it belongs to.
--      Nullable: personal chores ("order stationery") stay project-less. The
--      project updates feed (see /api/projects/[id]/updates) merges completed
--      project-linked tasks into the activity stream at read time; nothing is
--      written into `updates`, so a task has exactly one home row.
--
--   2. Self-assigned tasks become reviewable. 083's owner_review_tasks carried
--      `assigned_by IS NOT NULL`, which made a member's self-set task
--      permanently unreviewable — deliberate at the time (review verdicts drive
--      the 084 KPI, so self-review = self-graded performance).
--
--      That block is replaced, NOT removed: `user_id <> auth.uid()` keeps the
--      anti-self-review property while letting the owner review self-set work.
--      Strictly narrower than dropping the predicate — the reviewer can never be
--      the task's own member, whatever the task's origin.
--
-- ── KPI IMPACT: NONE ────────────────────────────────────────────────────────
-- v_task_performance_monthly (084) filters only on status='completed' — it has
-- never had an assigned_by predicate, so self-set tasks ALREADY count toward
-- weighted_volume. This migration does not widen the KPI's input set; it only
-- lets a review verdict (clean/revision/error) land on tasks that previously
-- could not carry one. error_count / revision_count on self-tasks move from
-- "always zero" to "whatever the owner recorded".
--
-- ── WHICH SELF-TASKS GET REVIEWED ───────────────────────────────────────────
-- Project-linked ones. A self-task WITH project_id is real project work: its
-- tick submits for review (status='pending_review') and the owner closes it.
-- A self-task WITHOUT project_id keeps 038's one-tap behaviour — tick and it is
-- done, no review, no waiting on the owner. Enforced in
-- handle_member_task_update() below, not in the API, so a direct PATCH cannot
-- route around it.
--
-- ── TRIGGER NAME ORDER STILL LOAD-BEARING ───────────────────────────────────
-- This file CREATE OR REPLACEs handle_member_task_update()'s body only. 038's
-- `member_task_before_update` trigger keeps its name and its first position
-- ahead of `trg_guard_member_task_review` ('m' < 't'). Do not rename either.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ============================================================
-- 1. project_id
-- ============================================================
-- ON DELETE SET NULL, never CASCADE: deleting a project must not delete the
-- work history behind a member's KPI. The task survives, unlinked.
ALTER TABLE member_tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- Feed query is `WHERE project_id = $1 AND status = 'completed'`.
CREATE INDEX IF NOT EXISTS idx_member_tasks_project_completed
  ON member_tasks(project_id, completed_at DESC)
  WHERE project_id IS NOT NULL AND status = 'completed';

-- ============================================================
-- 2. Lifecycle trigger — route project-linked self-tasks through review
-- ============================================================
-- Only the legacy `completed` tick path changes. Everything else is 083 verbatim.
CREATE OR REPLACE FUNCTION handle_member_task_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();

  -- Legacy path: the `completed` boolean is still the source of truth for
  -- self-set tasks and the old tick UI. Keep completed_at in lockstep and mirror
  -- into `status` so both columns agree.
  IF NEW.completed AND NOT OLD.completed THEN
    -- A project-linked task is real project work and goes to the owner rather
    -- than closing itself. Unlinked personal todos keep the one-tap behaviour.
    --
    -- A task sent back as 'revision' or 'error' must be able to go round again,
    -- so a prior verdict does NOT close the loop — only a 'clean' one does. The
    -- reviewer's own write is unaffected either way: it sets `status`, never
    -- `completed`, so it lands in the status branch below rather than here.
    IF NEW.project_id IS NOT NULL
       AND (NEW.review_status IS DISTINCT FROM 'clean')
    THEN
      NEW.completed := false;
      NEW.status := 'pending_review';
      -- Re-submission after a revision needs a fresh timestamp, so this is set
      -- unconditionally rather than only when NULL.
      NEW.submitted_at := now();
      -- The previous verdict is history; the owner must rule on the new work.
      NEW.review_status := NULL;
    ELSE
      NEW.completed_at := now();
      IF NEW.status <> 'completed' THEN NEW.status := 'completed'; END IF;
    END IF;
  ELSIF NOT NEW.completed AND OLD.completed THEN
    NEW.completed_at := NULL;
    IF NEW.status = 'completed' THEN NEW.status := 'open'; END IF;
  END IF;

  -- Assignment lifecycle: stamp timestamps on each forward transition.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted'       AND NEW.accepted_at  IS NULL THEN NEW.accepted_at  := now(); END IF;
    IF NEW.status = 'in_progress'    AND NEW.started_at   IS NULL THEN NEW.started_at   := now(); END IF;
    IF NEW.status = 'pending_review' AND NEW.submitted_at IS NULL THEN NEW.submitted_at := now(); END IF;
    IF NEW.status = 'completed' THEN
      NEW.completed := true;
      IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    END IF;
  END IF;

  -- Owner review stamp.
  IF NEW.review_status IS DISTINCT FROM OLD.review_status AND NEW.review_status IS NOT NULL THEN
    NEW.reviewed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. RLS — review reaches self-set tasks, never one's own
-- ============================================================
DROP POLICY IF EXISTS "owner_review_tasks" ON member_tasks;
CREATE POLICY "owner_review_tasks"
  ON member_tasks FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    -- Replaces 083's `assigned_by IS NOT NULL`. Review now reaches a member's
    -- self-set work, but nobody is ever their own reviewer — the property that
    -- predicate was really protecting. guard_member_task_review() (083) remains
    -- the second line of defence on user_id / tenant_id / clock immutability.
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    AND user_id <> auth.uid()
  );

COMMIT;
