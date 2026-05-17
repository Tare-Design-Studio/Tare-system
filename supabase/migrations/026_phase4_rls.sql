-- Phase 4 · RLS policies for all Phase 4 tables
-- customers, enquiries, enquiry_remarks, enquiry_reminders,
-- enquiry_intake, calendar_events

-- ─────────────────────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select ON customers
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer:view')
  );

CREATE POLICY customers_insert ON customers
  FOR INSERT WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer:view')
  );

CREATE POLICY customers_update ON customers
  FOR UPDATE USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('customer:view')
  );

-- ─────────────────────────────────────────────────────────────
-- enquiries
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiries_select ON enquiries
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:view')
  );

CREATE POLICY enquiries_insert ON enquiries
  FOR INSERT WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:create')
  );

CREATE POLICY enquiries_update ON enquiries
  FOR UPDATE USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:edit')
  );

-- ─────────────────────────────────────────────────────────────
-- enquiry_remarks
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiry_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiry_remarks_select ON enquiry_remarks
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:view')
  );

CREATE POLICY enquiry_remarks_insert ON enquiry_remarks
  FOR INSERT WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:add_remark')
  );

-- ─────────────────────────────────────────────────────────────
-- enquiry_reminders
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiry_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiry_reminders_select ON enquiry_reminders
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND (
      has_capability('enquiry:view')
      OR has_capability('customer:view')
    )
  );

CREATE POLICY enquiry_reminders_insert ON enquiry_reminders
  FOR INSERT WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:set_reminder')
  );

CREATE POLICY enquiry_reminders_update ON enquiry_reminders
  FOR UPDATE USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:set_reminder')
  );

CREATE POLICY enquiry_reminders_delete ON enquiry_reminders
  FOR DELETE USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('enquiry:set_reminder')
  );

-- ─────────────────────────────────────────────────────────────
-- enquiry_intake
-- ─────────────────────────────────────────────────────────────

ALTER TABLE enquiry_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiry_intake_select ON enquiry_intake
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('intake_form:configure')
  );

CREATE POLICY enquiry_intake_update ON enquiry_intake
  FOR UPDATE USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('intake_form:configure')
  );

-- ─────────────────────────────────────────────────────────────
-- calendar_events
-- Visibility-scoped: each row visible based on its visibility enum.
-- private_owner → enquiry:view capability (Owner only by default)
-- project       → project access (assigned or project:view_all)
-- assigned_user → auth.uid() = assigned_user_id
-- tenant        → any authenticated user in the tenant
-- ─────────────────────────────────────────────────────────────

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_select ON calendar_events
  FOR SELECT USING (
    tenant_id = current_user_tenant_id()
    AND (
      (visibility = 'tenant')
      OR (visibility = 'private_owner' AND has_capability('enquiry:view'))
      OR (visibility = 'assigned_user' AND assigned_user_id = auth.uid())
      OR (
        visibility = 'project'
        AND (
          has_capability('project:view_all')
          OR is_assigned_to_project(project_id)
        )
      )
    )
  );

CREATE POLICY calendar_events_insert ON calendar_events
  FOR INSERT WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND has_capability('calendar:view_own')
  );

CREATE POLICY calendar_events_update ON calendar_events
  FOR UPDATE USING (
    tenant_id = current_user_tenant_id()
    AND (
      created_by = auth.uid()
      OR has_capability('calendar:create_for_others')
    )
  );

CREATE POLICY calendar_events_delete ON calendar_events
  FOR DELETE USING (
    tenant_id = current_user_tenant_id()
    AND (
      created_by = auth.uid()
      OR has_capability('calendar:create_for_others')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Privilege hardening for Phase 4 tables
-- ─────────────────────────────────────────────────────────────

REVOKE ALL ON customers            FROM anon, authenticated;
REVOKE ALL ON enquiries            FROM anon, authenticated;
REVOKE ALL ON enquiry_remarks      FROM anon, authenticated;
REVOKE ALL ON enquiry_reminders    FROM anon, authenticated;
REVOKE ALL ON enquiry_intake       FROM anon, authenticated;
REVOKE ALL ON calendar_events      FROM anon, authenticated;
REVOKE ALL ON public_abuse_log     FROM anon, authenticated;
REVOKE ALL ON public_rate_limit_buckets FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE        ON customers            TO authenticated;
GRANT SELECT, INSERT, UPDATE        ON enquiries            TO authenticated;
GRANT SELECT, INSERT                ON enquiry_remarks      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON enquiry_reminders   TO authenticated;
GRANT SELECT, UPDATE                ON enquiry_intake       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_events     TO authenticated;
GRANT SELECT                        ON public_abuse_log     TO authenticated;
