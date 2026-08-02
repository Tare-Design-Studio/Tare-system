-- 088: Leave requests, overtime accounting, and a configurable workday window.
--
-- Covers three client requests that all sit on the same attendance domain:
--   #5  team members request leave and see pending balance
--   #7  hours worked past the standard day are counted as OT, visible to the
--       member and to the owner
--   --  the office check-in window ("what counts as late") becomes configurable
--       instead of being an unwritten rule
--
-- Design notes:
--   * OT is DERIVED, never typed. `attendance_logs.overtime_minutes` is a
--     generated column: minutes worked after the tenant's workday_end. Making it
--     writable would put KPI-adjacent numbers under user control, which is the
--     exact hole 086/087 closed for member_tasks.
--   * The workday window lives on `tenants`, so Bangalore hours are data, not a
--     constant in code. Defaults 09:30–18:00 with a 15-minute grace period.
--   * Leave balance is intentionally NOT a stored counter. Entitlement lives on
--     the tenant, consumption is summed from approved rows — a counter would
--     drift on every edit/cancel and there is no reconciliation job.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── Tenant workday configuration ───────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS workday_start        time        NOT NULL DEFAULT '09:30',
  ADD COLUMN IF NOT EXISTS workday_end          time        NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS late_grace_minutes   int         NOT NULL DEFAULT 15
    CHECK (late_grace_minutes BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS annual_leave_days    numeric(5,1) NOT NULL DEFAULT 12
    CHECK (annual_leave_days >= 0);

COMMENT ON COLUMN tenants.workday_start IS
  'Office check-in window opens. Check-ins after workday_start + late_grace_minutes are marked late.';
COMMENT ON COLUMN tenants.workday_end IS
  'Standard day ends. Minutes worked beyond this are overtime (attendance_logs.overtime_minutes).';

-- ── Overtime on attendance ─────────────────────────────────────────
--
-- NOT a generated column: `work_date + workday_end` is date+time arithmetic,
-- which Postgres treats as non-immutable (it depends on the session TimeZone),
-- and a generation expression must be immutable. Postgres rejects it outright.
--
-- So overtime is maintained by the BEFORE trigger below, which unconditionally
-- overwrites whatever the caller supplied. That keeps the security property
-- that mattered — the value is derived, never accepted from a client — while
-- being legal SQL. Reinforced by the column grants at the end of this file:
-- `authenticated` has no UPDATE privilege on these columns.

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS workday_end_snapshot time,
  ADD COLUMN IF NOT EXISTS is_late              boolean,
  ADD COLUMN IF NOT EXISTS overtime_minutes     int
    CHECK (overtime_minutes IS NULL OR overtime_minutes >= 0);

COMMENT ON COLUMN attendance_logs.overtime_minutes IS
  'Derived by stamp_attendance_workday(): minutes worked past workday_end_snapshot. Trigger-maintained, never accepted from a client.';

-- Stamps the tenant's window onto the row, marks lateness, and computes
-- overtime. Snapshotting the window means later changes to tenant hours do not
-- silently rewrite historical overtime.
CREATE OR REPLACE FUNCTION stamp_attendance_workday()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start time;
  v_end   time;
  v_grace int;
  v_eod   timestamptz;
BEGIN
  SELECT workday_start, workday_end, late_grace_minutes
    INTO v_start, v_end, v_grace
    FROM tenants WHERE id = NEW.tenant_id;

  IF NEW.workday_end_snapshot IS NULL THEN
    NEW.workday_end_snapshot := COALESCE(v_end, '18:00'::time);
  END IF;

  IF NEW.check_in_at IS NOT NULL THEN
    NEW.is_late := NEW.check_in_at
      > (NEW.work_date + COALESCE(v_start, '09:30'::time) + make_interval(mins => COALESCE(v_grace, 15)));
  ELSE
    NEW.is_late := NULL;
  END IF;

  -- Unconditional: any client-supplied overtime_minutes is discarded here.
  IF NEW.check_out_at IS NULL THEN
    NEW.overtime_minutes := NULL;
  ELSE
    v_eod := NEW.work_date + NEW.workday_end_snapshot;
    NEW.overtime_minutes := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NEW.check_out_at - v_eod)) / 60)::int
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_stamp_workday ON attendance_logs;
CREATE TRIGGER attendance_stamp_workday
  BEFORE INSERT OR UPDATE ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION stamp_attendance_workday();

-- Backfill existing rows so historical OT is not silently NULL. Setting the
-- snapshot fires the trigger above, which computes overtime_minutes and is_late
-- for every pre-existing row.
UPDATE attendance_logs a
   SET workday_end_snapshot = COALESCE(t.workday_end, '18:00'::time)
  FROM tenants t
 WHERE t.id = a.tenant_id
   AND a.workday_end_snapshot IS NULL;

-- Belt and braces alongside the trigger: members may write their own check-in
-- and check-out times, but never the derived columns. Column-level GRANTs are
-- additive to the table-level GRANT already held by `authenticated`, so the
-- REVOKE has to name the derived columns explicitly.
REVOKE UPDATE (overtime_minutes, is_late, workday_end_snapshot)
  ON attendance_logs FROM authenticated;

-- ── Leave requests ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_kind AS ENUM ('casual', 'sick', 'earned', 'unpaid', 'comp_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          leave_kind   NOT NULL DEFAULT 'casual',
  status        leave_status NOT NULL DEFAULT 'pending',
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  -- Half-day support without a second table: 0.5 on a single-day request.
  days          numeric(4,1) NOT NULL CHECK (days > 0),
  reason        text NOT NULL CHECK (length(btrim(reason)) > 0),
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates_ordered CHECK (end_date >= start_date),
  -- A decision must record who made it; prevents "approved by nobody".
  CONSTRAINT leave_decision_complete CHECK (
    (status IN ('pending', 'cancelled'))
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_leave_user_date   ON leave_requests(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_tenant_stat ON leave_requests(tenant_id, status, start_date DESC);

CREATE OR REPLACE FUNCTION touch_leave_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_touch_updated ON leave_requests;
CREATE TRIGGER leave_touch_updated
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION touch_leave_updated_at();

DROP TRIGGER IF EXISTS leave_set_tenant ON leave_requests;
CREATE TRIGGER leave_set_tenant
  BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_user();

-- Guard: a member may edit only their own PENDING request, and may never write
-- the decision fields or move the row out of 'pending' except to 'cancelled'.
-- Without this, the permissive own-row policy below would let a member approve
-- their own leave — the same class of hole 086 fixed for task self-review.
CREATE OR REPLACE FUNCTION guard_leave_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service-role / cron writes bypass (auth.uid() is NULL there)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id AND NOT has_capability('leave:approve') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You cannot decide your own leave request';
    END IF;
    IF NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.decision_note IS DISTINCT FROM OLD.decision_note THEN
      RAISE EXCEPTION 'You cannot write decision fields on your own leave request';
    END IF;
    IF OLD.status <> 'pending' AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'A decided leave request can no longer be edited';
    END IF;
  END IF;

  -- Nobody may reassign a request to a different member or tenant.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Leave request ownership cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_leave_decision ON leave_requests;
CREATE TRIGGER trg_guard_leave_decision
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION guard_leave_decision();

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY leave_select_own ON leave_requests FOR SELECT
  USING (user_id = auth.uid() AND tenant_id = current_user_tenant_id());

CREATE POLICY leave_select_all ON leave_requests FOR SELECT
  USING (has_capability('leave:view_all') AND tenant_id = current_user_tenant_id());

CREATE POLICY leave_insert_own ON leave_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = current_user_tenant_id()
    AND status = 'pending'
    AND has_capability('leave:request')
  );

CREATE POLICY leave_update_own ON leave_requests FOR UPDATE
  USING (user_id = auth.uid() AND tenant_id = current_user_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = current_user_tenant_id());

CREATE POLICY leave_update_approver ON leave_requests FOR UPDATE
  USING (has_capability('leave:approve') AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_capability('leave:approve') AND tenant_id = current_user_tenant_id());

-- Deleting leave history would break the balance calculation; members cancel instead.
CREATE POLICY leave_delete_admin ON leave_requests FOR DELETE
  USING (has_capability('leave:approve') AND tenant_id = current_user_tenant_id());

REVOKE ALL ON TABLE leave_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE leave_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leave_requests TO service_role;

-- ── Views ──────────────────────────────────────────────────────────

-- Per-user leave position for the current calendar year. Consumption is summed
-- from approved rows rather than stored, so edits and cancellations self-correct.
CREATE OR REPLACE VIEW v_leave_balance AS
SELECT
  u.id                AS user_id,
  u.tenant_id,
  t.annual_leave_days AS entitled_days,
  COALESCE(SUM(l.days) FILTER (
    WHERE l.status = 'approved'
      AND l.kind <> 'unpaid'
      AND date_part('year', l.start_date) = date_part('year', CURRENT_DATE)
  ), 0)::numeric(6,1) AS used_days,
  COALESCE(SUM(l.days) FILTER (WHERE l.status = 'pending'), 0)::numeric(6,1) AS pending_days,
  COUNT(*) FILTER (WHERE l.status = 'pending')::int AS pending_count,
  GREATEST(
    t.annual_leave_days - COALESCE(SUM(l.days) FILTER (
      WHERE l.status = 'approved'
        AND l.kind <> 'unpaid'
        AND date_part('year', l.start_date) = date_part('year', CURRENT_DATE)
    ), 0),
    0
  )::numeric(6,1) AS remaining_days
FROM users u
JOIN tenants t ON t.id = u.tenant_id
LEFT JOIN leave_requests l ON l.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.tenant_id, t.annual_leave_days;

COMMENT ON VIEW v_leave_balance IS
  'Per-user leave position for the current year. Unpaid leave does not consume entitlement.';

-- Monthly overtime per user, for the member profile and the owner's view.
CREATE OR REPLACE VIEW v_overtime_monthly AS
SELECT
  user_id,
  tenant_id,
  date_trunc('month', work_date)::date AS period_month,
  COALESCE(SUM(overtime_minutes), 0)::int         AS overtime_minutes,
  COUNT(*) FILTER (WHERE overtime_minutes > 0)::int AS days_with_overtime,
  COUNT(*) FILTER (WHERE is_late)::int              AS late_days
FROM attendance_logs
GROUP BY user_id, tenant_id, date_trunc('month', work_date);

COMMENT ON VIEW v_overtime_monthly IS
  'Derived monthly overtime and lateness per user. Source for the OT figures on member and owner profiles.';

-- Views run as the querying user, so the base-table RLS above still applies.
GRANT SELECT ON v_leave_balance   TO authenticated;
GRANT SELECT ON v_overtime_monthly TO authenticated;

-- ── Capability grants ──────────────────────────────────────────────
--
-- Mirrors lib/auth/capabilities.ts. tenant_id is supplied explicitly (NOT NULL,
-- no default) and idempotency comes from NOT EXISTS, since the unique index
-- includes the nullable scope_project_id and so never fires ON CONFLICT.

-- Everyone who is not the owner may request leave.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT u.tenant_id, u.id, 'leave:request', true, 'manual'
  FROM users u
 WHERE u.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM user_capabilities uc
      WHERE uc.user_id = u.id AND uc.capability = 'leave:request'
        AND uc.scope_project_id IS NULL
   );

-- Owners approve, see everything, and set KPI policy.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT u.tenant_id, u.id, c.cap, true, 'manual'
  FROM users u
 CROSS JOIN (VALUES ('leave:approve'), ('leave:view_all'), ('performance:configure')) AS c(cap)
 WHERE u.deleted_at IS NULL
   AND u.role = 'owner'
   AND NOT EXISTS (
     SELECT 1 FROM user_capabilities uc
      WHERE uc.user_id = u.id AND uc.capability = c.cap
        AND uc.scope_project_id IS NULL
   );

-- Teach tag_capability_set() the delegable new capabilities. leave:approve and
-- performance:configure are deliberately absent: like tasks:assign (087) they
-- are owner-granted per user, never conferred by a tag. Keep in sync with
-- TAG_EXCLUDED_CAPABILITIES in lib/auth/capabilities.ts.
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
      -- ('tasks:assign') deliberately REMOVED — owner-granted only (087).
      ('personal_reminders:write_own'),
      ('team_member_tags:manage'),
      ('project_table:view'),('project_table:edit'),('project_table:create'),
      ('table_preset:manage'),
      ('intake_form:configure'),
      ('audit_log:view'),('audit_log:export'),
      -- New in 088. leave:approve / performance:configure excluded by design.
      ('leave:request'),('leave:view_all')
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
      -- ('tasks:assign') deliberately REMOVED — owner-granted only (087).
      ('office_attendance:view_all'),
      -- New in 088: a PM sees the team's leave, but does not decide it.
      ('leave:view_all')
    ) AS pm(cap)
   WHERE p_tag = 'project_manager';
$$;
