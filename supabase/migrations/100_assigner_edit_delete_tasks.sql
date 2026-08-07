-- 100_assigner_edit_delete_tasks.sql
-- Lets the person who ASSIGNED a task edit it (title, tag, due date, project,
-- assignee) and delete it. Until now the assign surface was write-once: an
-- assigner could hand out a task and re-point its project (the narrow path added
-- for that in the PATCH route), but could not fix a typo in the title, correct a
-- due date, or hand the work to a different person. The only remedy was to ask
-- the member to delete it, which they could only do for their own self-set rows.
--
-- Two things block this today, and both are deliberate, so both are narrowed
-- rather than removed:
--
--   1. There is NO DELETE policy on member_tasks at all. member_own_tasks is
--      FOR ALL, so a member can delete their own row; nobody else can delete
--      anything. Adding the first DELETE-specific policy here.
--
--   2. guard_member_task_review() (083 → 086 → 096) raises on any user_id change
--      made by someone who is not the row's own member:
--          'a reviewer cannot reassign a task (user_id/tenant_id immutable)'
--      That rule exists so a REVIEWER cannot launder a task onto someone else to
--      dodge the self-review block. An ASSIGNER re-pointing their own assignment
--      is a different act, and one they already perform implicitly by deleting
--      and re-creating. The guard now distinguishes the two.
--
-- What stays true after this migration:
--   * A reviewer still cannot reassign, cannot touch the clock, and cannot change
--     who reviews a task. Every 096 rule survives for the non-assigner path.
--   * Nobody reviews their own assigned work (the 086/096 check is untouched and
--     still runs before any of this).
--   * An assigner may only reach tasks where assigned_by = auth.uid(). They gain
--     nothing over self-set tasks (assigned_by IS NULL) or over work assigned by
--     somebody else.
--   * tenant_id remains immutable on every path.
--   * The clock stays immutable even for the assigner — reassigning resets it
--     (below) rather than letting it be written by hand.
--
-- Reassignment semantics: moving a task to a new person resets the lifecycle.
-- The new assignee has not accepted, started or submitted anything, so carrying
-- the old member's timestamps forward would credit them with the previous
-- person's logged hours and feed a false number into the performance algorithm.
-- The reset is enforced in the trigger, not left to the API, so it holds however
-- the row is written.
--
-- Rollback: DROP POLICY assigner_delete_tasks; and restore the 096 body of
-- guard_member_task_review(). No column or existing policy is dropped here.

BEGIN;

-- ============================================================
-- 1. DELETE — the assigner may withdraw work they handed out
-- ============================================================
-- member_own_tasks (FOR ALL) already covers a member deleting their own row.
-- This is additive and permissive: it only ever grants, never restricts.
--
-- Scoped to assigned_by = auth.uid() on purpose. A tasks:assign holder can
-- REVIEW anyone's work (owner_review_tasks, 095) but may only DELETE what they
-- personally handed out — deletion is destructive and unreviewable, so it stays
-- with the person who created the obligation.

DROP POLICY IF EXISTS "assigner_delete_tasks" ON member_tasks;
CREATE POLICY "assigner_delete_tasks"
  ON member_tasks FOR DELETE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    AND assigned_by = auth.uid()
    -- Never the deleter's own row; that path belongs to member_own_tasks and
    -- keeping it out here means this policy cannot widen self-access.
    AND user_id <> auth.uid()
  );

-- ============================================================
-- 2. Guard — separate the assigner path from the reviewer path
-- ============================================================
-- Body-only replacement. The trigger trg_guard_member_task_review keeps its name
-- and its position after member_task_before_update (038) — that ordering is
-- load-bearing ('m' < 't'), see 083/095. Do not rename either.
--
-- Everything before the new block is byte-identical to 096.

CREATE OR REPLACE FUNCTION guard_member_task_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Service-role / cron / migration context is not a reviewer.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nobody signs off their own assigned work, whatever capability they hold.
  IF auth.uid() = OLD.user_id
     AND OLD.assigned_by IS NOT NULL
     AND NEW.review_status IS DISTINCT FROM OLD.review_status
     AND NEW.review_status IS NOT NULL THEN
    RAISE EXCEPTION 'you cannot review your own assigned task'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The member owns the rest of their own row (title, clock, accept/start/submit,
  -- and choosing who reviews it).
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- ---- assigner path (100) ----
  -- The person who handed this task out may correct it, including moving it to a
  -- different member. Checked BEFORE the reviewer rules because an assigner is
  -- usually also a tasks:assign holder and would otherwise be caught by them.
  --
  -- tenant_id stays immutable here too: re-pointing a task across tenants is not
  -- a correction, it is a leak.
  IF OLD.assigned_by = auth.uid() THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'a task cannot be moved between tenants'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The new assignee must be a live member of the same tenant. Mirrors the
    -- EXISTS check in owner_assign_tasks (083) so re-pointing an existing task
    -- cannot reach somewhere the original assignment could not.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM users u
         WHERE u.id = NEW.user_id
           AND u.tenant_id = OLD.tenant_id
           AND u.deleted_at IS NULL
           AND u.is_active
      ) THEN
        RAISE EXCEPTION 'the new assignee is not an active member of this tenant'
          USING ERRCODE = 'check_violation';
      END IF;

      -- An assigner cannot hand a task to themselves through this path. It would
      -- turn assigned work into a row they own AND assigned, i.e. self-review by
      -- the back door, since the self-review check above keys on OLD.user_id.
      IF NEW.user_id = auth.uid() THEN
        RAISE EXCEPTION 'an assigner cannot move a task to themselves'
          USING ERRCODE = 'check_violation';
      END IF;

      -- Reassignment resets the lifecycle. The new person has not accepted,
      -- started or submitted this; inheriting the previous member's clock would
      -- credit them with hours they did not work. Forced here rather than in the
      -- API so it holds no matter who writes the row.
      NEW.status          := 'open';
      NEW.accepted_at     := NULL;
      NEW.started_at      := NULL;
      NEW.submitted_at    := NULL;
      NEW.completed       := false;
      NEW.completed_at    := NULL;
      NEW.review_status   := NULL;
      NEW.reviewed_by     := NULL;
      NEW.reviewed_at     := NULL;
      -- The previous member may have named a reviewer for their own submission;
      -- that choice does not survive to a different person's work.
      NEW.review_requested_to := NULL;

      RETURN NEW;
    END IF;

    -- Not a reassignment — an ordinary correction (title, tag, due date,
    -- project). The clock still belongs to the member who is doing the work.
    IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'an assigner cannot alter task time-logging timestamps'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- ---- reviewer path ---- (unchanged from 096)
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a reviewer cannot reassign a task (user_id/tenant_id immutable)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'a reviewer cannot alter task time-logging timestamps'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.review_requested_to IS DISTINCT FROM OLD.review_requested_to THEN
    RAISE EXCEPTION 'a reviewer cannot change who reviews a task'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
