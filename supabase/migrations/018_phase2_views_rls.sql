-- Phase 2 · Views + RLS policies + privilege grants

-- ── current_user_tenant_id() ──────────────────────────────────────────────
-- Defined here (before any policy that needs it) so 019_fix_users_rls can
-- reference it when it patches the users table policy.
-- SECURITY DEFINER reads users bypassing RLS — no recursion risk.
CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION current_user_tenant_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION current_user_tenant_id() TO authenticated;

-- ── Correction views ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_work_log_current AS
  SELECT * FROM work_log WHERE is_corrected = false AND deleted_at IS NULL;

CREATE OR REPLACE VIEW v_material_consumption_current AS
  SELECT * FROM material_consumption WHERE is_corrected = false AND deleted_at IS NULL;

CREATE OR REPLACE VIEW v_expenses_current AS
  SELECT * FROM expenses WHERE is_corrected = false AND deleted_at IS NULL;

-- ── RLS: material_plan ────────────────────────────────────────────────────
ALTER TABLE material_plan FORCE ROW LEVEL SECURITY;

CREATE POLICY material_plan_select ON material_plan FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND deleted_at IS NULL
  AND (
    has_capability('materials:view', project_id)
    OR has_capability('materials:view')
  )
);

CREATE POLICY material_plan_insert ON material_plan FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND has_capability('materials:plan', project_id)
  AND is_assigned_to_project(project_id)
  AND project_in_stage(project_id, 'execution')
);

CREATE POLICY material_plan_update ON material_plan FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND has_capability('materials:plan', project_id)
  AND is_assigned_to_project(project_id)
  AND deleted_at IS NULL
) WITH CHECK (
  project_in_stage(project_id, 'execution')
);

-- No DELETE policy — soft delete only

-- ── RLS: material_consumption ─────────────────────────────────────────────
ALTER TABLE material_consumption FORCE ROW LEVEL SECURITY;

CREATE POLICY mat_consumption_select ON material_consumption FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND deleted_at IS NULL
  AND (
    has_capability('materials:view', project_id)
    OR (
      has_capability('materials:consume', project_id)
      AND is_assigned_to_project(project_id)
    )
  )
);

CREATE POLICY mat_consumption_insert ON material_consumption FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND has_capability('materials:consume', project_id)
  AND is_assigned_to_project(project_id)
  AND project_in_stage(project_id, 'execution')
);

-- No UPDATE policy — append-only correction pattern

-- ── RLS: expenses ─────────────────────────────────────────────────────────
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY expenses_select ON expenses FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND deleted_at IS NULL
  AND (
    has_capability('expenses:view_all')
    OR (
      has_capability('expenses:view', project_id)
      AND is_assigned_to_project(project_id)
    )
  )
);

CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND has_capability('expenses:create', project_id)
  AND is_assigned_to_project(project_id)
  AND project_in_stage(project_id, 'execution')
);

-- Approver can transition pending → approved/rejected
CREATE POLICY expenses_update_approver ON expenses FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND has_capability('expenses:approve', project_id)
  AND deleted_at IS NULL
) WITH CHECK (
  approval_status IN ('approved', 'rejected')
);

-- No DELETE policy — soft delete only

-- ── RLS: site_check_ins ───────────────────────────────────────────────────
ALTER TABLE site_check_ins FORCE ROW LEVEL SECURITY;

CREATE POLICY site_checkin_select ON site_check_ins FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    has_capability('site_check_in:view_all')
    OR (
      user_id = auth.uid()
      AND is_assigned_to_project(project_id)
    )
  )
);

CREATE POLICY site_checkin_insert ON site_check_ins FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND user_id = auth.uid()
  AND has_capability('site_check_in:write', project_id)
  AND is_assigned_to_project(project_id)
  AND project_in_stage(project_id, 'execution')
);

-- Override approver (Owner) can set approved_by/approved_at on out-of-geofence check-ins
CREATE POLICY site_checkin_update_override ON site_check_ins FOR UPDATE USING (
  tenant_id = current_user_tenant_id()
  AND has_capability('site_check_in:override_geofence')
  AND within_geofence = false
  AND approved_by IS NULL
) WITH CHECK (
  approved_by IS NOT NULL
  AND approved_at IS NOT NULL
);

-- ── Privilege grants ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON material_plan           TO authenticated;
GRANT SELECT, INSERT          ON material_consumption   TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON expenses               TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON site_check_ins         TO authenticated;
GRANT SELECT ON v_work_log_current                      TO authenticated;
GRANT SELECT ON v_material_consumption_current          TO authenticated;
GRANT SELECT ON v_expenses_current                      TO authenticated;
