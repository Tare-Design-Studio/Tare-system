-- 096_team_coordination_and_named_review.sql
--
-- Two related client requests:
--
--   1. Certain team members need to add people to projects and see who is doing
--      what, without being handed the owner's full Team & Access page (salary,
--      KPI, attendance, account management). New capability `team:coordinate`
--      unlocks a REDACTED /team.
--
--   2. A completed task should be sendable to a NAMED reviewer, who then sees it
--      in their own review queue and gets a notification.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT — no BEGIN/COMMIT here.

-- ============================================================
-- 1. member_tasks.review_requested_to — the named reviewer
-- ============================================================
-- Nullable: a task submitted without naming anyone keeps 083's behaviour
-- (routes to the assigner, falling back to owners).
--
-- ON DELETE SET NULL, never CASCADE: removing a reviewer's account must not
-- delete the task history that 084's KPI is derived from. A task whose named
-- reviewer is gone falls back to the assigner/owner path, which is exactly the
-- pre-096 behaviour — it does not become unreviewable.

ALTER TABLE member_tasks
  ADD COLUMN IF NOT EXISTS review_requested_to uuid
    REFERENCES users(id) ON DELETE SET NULL;

-- The review queue reads "tasks named to me and still awaiting a verdict".
-- Partial index keeps it off the (much larger) completed/unnamed rows.
CREATE INDEX IF NOT EXISTS idx_member_tasks_named_reviewer
  ON member_tasks (review_requested_to, submitted_at DESC)
  WHERE review_requested_to IS NOT NULL AND status = 'pending_review';

-- ============================================================
-- 2. A named reviewer must be able to READ the task
-- ============================================================
-- `owner_review_tasks` (083, rewritten by 095) gates on
-- has_capability('tasks:assign') AND user_id <> auth.uid(). The reviewer pool is
-- exactly the set of tasks:assign holders (see the API), so a named reviewer
-- already satisfies that policy and no new policy is required for them.
--
-- What is NOT solved in the database: that policy lets ANY tasks:assign holder
-- act on ANY tenant task, so naming a reviewer does not, on its own, stop a
-- different holder from grabbing the verdict. Narrowing the RLS policy to the
-- named reviewer would break the unnamed fallback path (assigner / owner review),
-- which is still the common case and must keep working. The restriction is
-- therefore enforced in the API's `review` branch, and the queue is filtered by
-- addressee. Documented here so the split is deliberate and findable, not an
-- oversight — the DB half remains "a reviewer may review anything but their own
-- work", which is what 086 and 095 already guarantee.

-- ============================================================
-- 3. Route the review notification to the named reviewer
-- ============================================================
-- New 3-argument overload. The 2-argument form from 083 is deliberately LEFT IN
-- PLACE: changing a function's arity does not replace the old one, it creates a
-- second, and any caller still passing two arguments would otherwise break. The
-- old form now delegates so there is one routing rule, not two.

CREATE OR REPLACE FUNCTION emit_task_review_notification(
  p_task_id  uuid,
  p_title    text,
  p_reviewer uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant    uuid;
  v_assigner  uuid;
  v_named     uuid;
  v_recipient uuid;
BEGIN
  -- Caller must own the task (the member submitting it). Same check as 083 —
  -- this is SECURITY DEFINER, so it is the only thing standing between an
  -- arbitrary authenticated caller and a forged notification.
  SELECT tenant_id, assigned_by, review_requested_to
    INTO v_tenant, v_assigner, v_named
    FROM member_tasks
   WHERE id = p_task_id AND user_id = auth.uid();
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Prefer the reviewer named on this call, then the one stored on the row, then
  -- the assigner. NULL falls through to emit_notification's owner broadcast.
  v_recipient := COALESCE(p_reviewer, v_named, v_assigner);

  -- A reviewer who cannot review is not a valid recipient: fall back rather than
  -- send a notification whose only action would 403. Self is excluded for the
  -- same reason (086 rejects reviewing your own work).
  IF v_recipient IS NOT NULL THEN
    IF v_recipient = auth.uid()
       OR NOT EXISTS (
         SELECT 1 FROM user_capabilities uc
          WHERE uc.user_id = v_recipient
            AND uc.capability = 'tasks:assign'
            AND uc.granted
            AND uc.scope_project_id IS NULL
       )
    THEN
      v_recipient := NULL;
    END IF;
  END IF;

  RETURN emit_notification(
    v_tenant, 'task_pending_review', 'info', 'member_tasks',
    'Task ready for review', p_title, p_task_id, NULL,
    CASE WHEN v_recipient IS NULL THEN NULL ELSE ARRAY[v_recipient] END
  );
END;
$$;

-- 083's 2-arg form kept for existing callers; delegates so routing lives in one
-- place. Passing NULL lets the row's own review_requested_to win.
CREATE OR REPLACE FUNCTION emit_task_review_notification(
  p_task_id uuid,
  p_title   text
)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT emit_task_review_notification(p_task_id, p_title, NULL::uuid);
$$;

REVOKE EXECUTE ON FUNCTION emit_task_review_notification(uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION emit_task_review_notification(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 4. A reviewer may not be silently reassigned by a reviewer
-- ============================================================
-- guard_member_task_review() (083, rewritten by 086) already blocks a reviewer
-- from rewriting user_id / tenant_id / the time log. review_requested_to belongs
-- in that same set: letting a reviewer re-point a task at someone else would let
-- them launder a task they are not allowed to sign off. The member who owns the
-- row keeps full control of it (the early return below is unchanged).
--
-- Body-only replacement — the trigger trg_guard_member_task_review keeps its
-- name and its position after member_task_before_update (038).

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

  -- ---- reviewer path ----
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

  -- NEW (096): only the task's owner picks the reviewer.
  IF NEW.review_requested_to IS DISTINCT FROM OLD.review_requested_to THEN
    RAISE EXCEPTION 'a reviewer cannot change who reviews a task'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Capability: team:coordinate
-- ============================================================
-- Unlocks a REDACTED /team — members list, who-is-on-what, and project
-- assignment. It confers no data access of its own: the salary, attendance and
-- KPI queries on that page stay gated on team:create_user, and adding someone to
-- a project still requires team:assign_to_project. So this capability widens the
-- page, never the payload.
--
-- Deliberately NOT added to tag_capability_set(): like tasks:assign (087),
-- leave:approve (088) and performance:configure (090), coordination is a
-- management act the owner grants per user through the Access Matrix. Its
-- absence from that function is what keeps it off the tag path — nothing further
-- is needed here.
--
-- Nothing is granted by this migration. The owner already holds every capability
-- (OWNER_CAPABILITIES = CAPABILITIES); everyone else gets it explicitly or not
-- at all. Keep in sync with CAPABILITIES in lib/auth/capabilities.ts.

-- ============================================================
-- Verification (run after apply)
-- ============================================================
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'member_tasks' AND column_name = 'review_requested_to';
--   SELECT indexname FROM pg_indexes
--    WHERE indexname = 'idx_member_tasks_named_reviewer';
--   SELECT p.oid::regprocedure FROM pg_proc p
--    WHERE p.proname = 'emit_task_review_notification';   -- expect BOTH arities
