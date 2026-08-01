-- 083_task_assignment_lifecycle.sql
-- Turns member_tasks from self-set todos into an owner→member assignment system
-- with an accept step, time-logging (accepted→submitted), fixed tags, and an
-- owner review step (clean/revision/error). Additive: pre-existing self-set
-- tasks default to status='open' with tag='other' and behave as before.
--
-- New capability: tasks:assign (owner + project_manager + accountant + admin via
-- tag). Kept in sync with lib/auth/capabilities.ts and tag_capability_set() below.
--
-- Notifications go through per-kind SECURITY DEFINER wrappers (the app runs as
-- `authenticated`, which is REVOKEd from emit_notification() by 006) — same
-- pattern as emit_site_checkin_notification in 032.
--
-- ── PORTED FROM THE SIBLING MULTI-TENANT REPO, WITH ITS FIXES FOLDED IN ──────
-- Upstream shipped this as two migrations: 086 (feature) and 089 (fixes found in
-- review AFTER 086 was already applied there — so it could not be edited in
-- place). This deployment has applied NEITHER, so the CORRECTED form is written
-- directly here and the broken intermediate state never exists in this database:
--
--   * owner_review_tasks — upstream 086 gated ONLY on tenant + has_capability
--     ('tasks:assign'). That capability is held by project_manager/accountant/
--     admin-tagged MEMBERS, not just the owner. With no OLD-vs-NEW comparison
--     possible inside RLS, any such member could rewrite user_id (steal or
--     reassign any task), rewrite accepted_at/submitted_at (forge the time log),
--     or mark their own work review_status='clean'. This file uses 089's version:
--     `assigned_by IS NOT NULL` in both USING and WITH CHECK — review applies to
--     ASSIGNED work only, never a member's self-set private todos.
--   * guard_member_task_review() + trg_guard_member_task_review — RLS cannot
--     compare OLD vs NEW, so the column-immutability half needs a trigger. Also
--     from 089.
--
-- Upstream 087 (performance KPI) is deliberately NOT ported here; that is a
-- separate migration handled elsewhere. Nothing below references v_kpi_scores,
-- team_performance_monthly, or recompute_task_kpi().
--
-- ── TRIGGER NAME ORDER IS LOAD-BEARING ──────────────────────────────────────
-- Postgres fires same-timing triggers in NAME (alphabetical) order. On
-- member_tasks BEFORE UPDATE there are now two:
--
--   1. member_task_before_update      (038) — stamps updated_at/completed_at and,
--                                             as redefined below, accepted_at /
--                                             started_at / submitted_at.
--   2. trg_guard_member_task_review   (this) — rejects a reviewer's attempt to
--                                             rewrite those same columns.
--
-- 'm' < 't', so 038's trigger fires FIRST and the guard compares against values
-- the lifecycle trigger has ALREADY set. If the order were reversed, the system's
-- own stamping would trip the guard's exception on every legitimate transition.
-- Do not rename either trigger. This file only redefines 038's FUNCTION body
-- (CREATE OR REPLACE), never its trigger, so the existing name is preserved.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR
-- REPLACE / ON CONFLICT DO NOTHING).

BEGIN;

-- ============================================================
-- 1. Lifecycle columns on member_tasks
-- ============================================================

ALTER TABLE member_tasks
  ADD COLUMN IF NOT EXISTS assigned_by   uuid REFERENCES users(id),          -- null = self-created
  ADD COLUMN IF NOT EXISTS tag           text NOT NULL DEFAULT 'other'
    CHECK (tag IN ('drawing','review','site','admin','other')),
  ADD COLUMN IF NOT EXISTS due_date      date,
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','accepted','in_progress','pending_review','completed')),
  ADD COLUMN IF NOT EXISTS accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at  timestamptz,                         -- clock stops here; logged = submitted_at - accepted_at
  ADD COLUMN IF NOT EXISTS review_status text
    CHECK (review_status IS NULL OR review_status IN ('clean','revision','error')),
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_member_tasks_assignee_status
  ON member_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_member_tasks_tenant_review
  ON member_tasks(tenant_id, status) WHERE status = 'pending_review';

-- ============================================================
-- 2. Lifecycle timestamp trigger
--    Extends 038's completed_at handling with the new states. Redefines the
--    function only — 038's `member_task_before_update` trigger keeps its name
--    and its first-in-alphabetical-order position (see header).
--    A self-set task (assigned_by IS NULL) that is simply ticked `completed`
--    keeps working: it jumps straight to status='completed' (no review needed).
-- ============================================================

CREATE OR REPLACE FUNCTION handle_member_task_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();

  -- Legacy path: the `completed` boolean is still the source of truth for
  -- self-set tasks and the old tick UI. Keep completed_at in lockstep and mirror
  -- into `status` so both columns agree.
  IF NEW.completed AND NOT OLD.completed THEN
    NEW.completed_at := now();
    IF NEW.status <> 'completed' THEN NEW.status := 'completed'; END IF;
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
-- 3. RLS — owner can assign + review; member drives own lifecycle
-- ============================================================
-- 038's "member_own_tasks" (FOR ALL, user_id = auth.uid()) already lets a member
-- accept/start/submit their own task. We add owner INSERT-for-others and an owner
-- UPDATE (review) policy. INSERT-for-others needs a policy because
-- member_own_tasks WITH CHECK requires user_id = auth.uid().

DROP POLICY IF EXISTS "owner_assign_tasks" ON member_tasks;
CREATE POLICY "owner_assign_tasks"
  ON member_tasks FOR INSERT
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    AND assigned_by = auth.uid()
    -- assignee must be a live member of the same tenant
    AND EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = member_tasks.user_id
         AND u.tenant_id = current_user_tenant_id()
         AND u.deleted_at IS NULL
    )
  );

-- Corrected form (upstream 089, not the broken 086 version) — see header.
DROP POLICY IF EXISTS "owner_review_tasks" ON member_tasks;
CREATE POLICY "owner_review_tasks"
  ON member_tasks FOR UPDATE
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    -- Review applies to ASSIGNED work only; a reviewer has no business editing
    -- a member's self-set private todos (assigned_by IS NULL).
    AND assigned_by IS NOT NULL
  )
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('tasks:assign')
    AND assigned_by IS NOT NULL
  );

-- RLS cannot compare OLD vs NEW, so the column-immutability half needs a trigger.
-- Scope: only the REVIEWER path (someone other than the task's own member). The
-- member keeps full control of their own row via member_own_tasks.
CREATE OR REPLACE FUNCTION guard_member_task_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- auth.uid() IS NULL = service-role / cron / migration context → not a reviewer.
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a reviewer cannot reassign a task (user_id/tenant_id immutable)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The clock (accepted_at → submitted_at) belongs to the member. A reviewer
  -- must not rewrite it.
  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'a reviewer cannot alter task time-logging timestamps'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Fires SECOND, after 038's `member_task_before_update`. Alphabetical ordering is
-- the mechanism ('m' < 't') and it is load-bearing — see header. Do not rename.
DROP TRIGGER IF EXISTS trg_guard_member_task_review ON member_tasks;
CREATE TRIGGER trg_guard_member_task_review
  BEFORE UPDATE ON member_tasks
  FOR EACH ROW
  EXECUTE FUNCTION guard_member_task_review();

-- ============================================================
-- 4. Notification wrappers (SECURITY DEFINER, granted to authenticated)
-- ============================================================

-- Owner assigns → notify the assignee.
CREATE OR REPLACE FUNCTION emit_task_assigned_notification(
  p_task_id   uuid,
  p_assignee  uuid,
  p_title     text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  -- Only the assigner (a tasks:assign holder) may call this, and only for their
  -- own tenant's members. Resolve tenant from the caller.
  SELECT tenant_id INTO v_tenant FROM users WHERE id = auth.uid() AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF NOT has_capability('tasks:assign') THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_assignee AND tenant_id = v_tenant AND deleted_at IS NULL) THEN
    RETURN NULL;
  END IF;

  RETURN emit_notification(
    v_tenant, 'task_assigned', 'info', 'member_tasks',
    'New task assigned', p_title, p_task_id, NULL, ARRAY[p_assignee]
  );
END;
$$;

-- Member submits for review → notify the owner(s) / assigner.
CREATE OR REPLACE FUNCTION emit_task_review_notification(
  p_task_id uuid,
  p_title   text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant   uuid;
  v_assigner uuid;
BEGIN
  -- Caller must own the task (the member submitting it).
  SELECT tenant_id, assigned_by INTO v_tenant, v_assigner
    FROM member_tasks WHERE id = p_task_id AND user_id = auth.uid();
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  RETURN emit_notification(
    v_tenant, 'task_pending_review', 'info', 'member_tasks',
    'Task ready for review', p_title, p_task_id, NULL,
    -- direct to the assigner when known, else falls back to owner(s) (NULL arg)
    CASE WHEN v_assigner IS NULL THEN NULL ELSE ARRAY[v_assigner] END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION emit_task_assigned_notification(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION emit_task_review_notification(uuid, text)          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION emit_task_assigned_notification(uuid, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION emit_task_review_notification(uuid, text)          TO authenticated;

-- ============================================================
-- 5. Capability plumbing — tasks:assign
--    Redefines 065's tag_capability_set(). The list below is 065's list VERBATIM
--    plus the single new ('tasks:assign') entry in each of the two blocks
--    (all_caps and the project_manager set). Nothing else added or removed.
--    Keep in sync with TAG_CAPABILITIES in lib/auth/capabilities.ts.
-- ============================================================

CREATE OR REPLACE FUNCTION tag_capability_set(p_tag text)
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  WITH all_caps(cap) AS (
    VALUES
      ('project:create'),('project:edit'),('project:delete'),
      ('project:view_assigned'),('project:view_all'),('project:change_stage'),
      ('enquiry:view'),('enquiry:create'),('enquiry:edit'),
      ('enquiry:add_remark'),('enquiry:set_reminder'),
      ('customer:view'),('customer_payments:view'),('customer_payments:edit'),
      ('customer_payments:create_schedule'),
      ('team:create_user'),('team:edit_user'),('team:deactivate_user'),
      ('team:assign_to_project'),
      ('materials:plan'),('materials:consume'),('materials:view'),
      ('progress:update'),('progress:view'),('checklist:edit'),
      ('checkpoint:progress'),
      ('expenses:create'),('expenses:view'),('expenses:approve'),
      ('finance:view_dashboard'),('finance:export'),
      ('images:upload'),('images:view'),('images:select_for_customer'),
      ('bridge:read'),('bridge:write'),
      ('calendar:view_own'),('calendar:view_all'),('calendar:create_for_others'),
      ('daily_tasks:write_own'),('daily_tasks:view_all'),
      ('daily_tasks:export_own'),('daily_tasks:export_all'),
      ('broadcast:create'),('broadcast:receive'),
      ('site_check_in:write'),('site_check_in:view_all'),
      ('site_check_in:override_geofence'),
      ('office_attendance:write_own'),('office_attendance:view_all'),
      ('office_attendance:configure'),
      ('member_tasks:write_own'),('member_tasks:view_all'),
      ('tasks:assign'),
      ('personal_reminders:write_own'),
      ('team_member_tags:manage'),
      ('project_table:view'),('project_table:edit'),('project_table:create'),
      ('table_preset:manage'),
      ('intake_form:configure'),
      ('audit_log:view'),('audit_log:export')
  ),
  finance_caps(cap) AS (
    VALUES
      ('finance:view_dashboard'),('finance:export'),
      ('expenses:create'),('expenses:view'),('expenses:approve'),
      ('customer_payments:view'),('customer_payments:edit'),
      ('customer_payments:create_schedule')
  )
  SELECT cap FROM all_caps
   WHERE p_tag = 'accountant'
      OR (p_tag = 'admin' AND cap NOT IN (SELECT cap FROM finance_caps))
  UNION
  SELECT cap FROM (VALUES
      ('project:create'),('project:edit'),('project:change_stage'),
      ('project:view_all'),('team:assign_to_project'),
      ('expenses:view'),('expenses:approve'),('checkpoint:progress'),
      ('customer:view'),('customer_payments:view'),
      ('daily_tasks:view_all'),('member_tasks:view_all'),
      ('tasks:assign'),
      ('office_attendance:view_all')
    ) AS pm(cap)
   WHERE p_tag = 'project_manager';
$$;

-- Grant tasks:assign to existing owners (owners get every capability; has_capability
-- short-circuits on owner, but insert an explicit row for consistency where present)
-- and to already-tagged project_manager/accountant/admin members via their tag source.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, scope_project_id, source)
SELECT u.tenant_id, u.id, 'tasks:assign', true, NULL, 'manual'
  FROM users u
 WHERE u.role = 'owner' AND u.deleted_at IS NULL
ON CONFLICT (user_id, capability, scope_project_id) DO NOTHING;

INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, scope_project_id, source)
SELECT t.tenant_id, t.user_id, 'tasks:assign', true, NULL, 'tag'
  FROM team_member_tags t
 WHERE t.tag IN ('accountant','admin','project_manager')
ON CONFLICT (user_id, capability, scope_project_id) DO NOTHING;

COMMIT;
