-- Explicit Data API grants for Supabase public schema privilege changes.
-- Supabase will no longer auto-expose new public tables to PostgREST/GraphQL.
-- Keep anon table access closed; public flows use SECURITY DEFINER RPCs.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Never expose tables directly to anonymous Data API callers.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

DROP POLICY IF EXISTS "tenant members can read own tenant" ON tenants;
CREATE POLICY "tenant members can read own tenant"
  ON tenants FOR SELECT TO authenticated
  USING (
    id = (
      SELECT tenant_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.deleted_at IS NULL
        AND users.is_active = true
    )
  );

DROP POLICY IF EXISTS "owners can update own tenant settings" ON tenants;
CREATE POLICY "owners can update own tenant settings"
  ON tenants FOR UPDATE TO authenticated
  USING (
    id = (
      SELECT tenant_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'owner'
        AND users.deleted_at IS NULL
        AND users.is_active = true
    )
  )
  WITH CHECK (
    id = (
      SELECT tenant_id
      FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'owner'
        AND users.deleted_at IS NULL
        AND users.is_active = true
    )
  );

-- Authenticated app tables. RLS policies remain the authorization boundary.
GRANT SELECT, UPDATE ON TABLE tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE user_sessions TO authenticated;
GRANT SELECT ON TABLE user_capabilities TO authenticated;

GRANT SELECT ON TABLE notifications TO authenticated;
GRANT SELECT, UPDATE ON TABLE notification_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_subscriptions TO authenticated;

GRANT SELECT ON TABLE audit_log TO authenticated;
GRANT SELECT, INSERT ON TABLE audit_export_log TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO authenticated;
GRANT SELECT, INSERT ON TABLE work_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_checkpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_tables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_rows TO authenticated;
GRANT SELECT, INSERT ON TABLE project_table_row_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_rows TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE material_plan TO authenticated;
GRANT SELECT, INSERT ON TABLE material_consumption TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE site_check_ins TO authenticated;

GRANT SELECT, INSERT ON TABLE updates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE media_assets TO authenticated;
GRANT SELECT, INSERT ON TABLE bridge_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE team_daily_tasks TO authenticated;
GRANT SELECT, INSERT ON TABLE owner_broadcasts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE owner_broadcast_recipients TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE enquiries TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE enquiry_phones TO authenticated;
GRANT SELECT, INSERT ON TABLE enquiry_remarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiry_reminders TO authenticated;
GRANT SELECT, UPDATE ON TABLE enquiry_intake TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE calendar_events TO authenticated;
GRANT SELECT ON TABLE public_abuse_log TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_schedule TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE team_performance_monthly TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_member_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE personal_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE attendance_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_milestone_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_milestone_preset_items TO authenticated;

-- Views consumed through supabase-js/PostgREST.
GRANT SELECT ON TABLE v_project_variance TO authenticated;
GRANT SELECT ON TABLE v_project_checkpoint_status TO authenticated;
GRANT SELECT ON TABLE v_checkpoint_progress TO authenticated;
GRANT SELECT ON TABLE v_work_log_current TO authenticated;
GRANT SELECT ON TABLE v_material_consumption_current TO authenticated;
GRANT SELECT ON TABLE v_expenses_current TO authenticated;
GRANT SELECT ON TABLE v_payment_status TO authenticated;
GRANT SELECT ON TABLE v_kpi_scores TO authenticated;
GRANT SELECT ON TABLE v_employee_revenue_contribution TO authenticated;
GRANT SELECT ON TABLE v_attendance_monthly TO authenticated;

-- Service-role Data API clients bypass RLS but still need object privileges.
-- Preserve audit_log append-only guarantees by not granting direct writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_capabilities TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notification_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE push_subscriptions TO service_role;

GRANT SELECT ON TABLE audit_log TO service_role;
GRANT SELECT, INSERT ON TABLE audit_export_log TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE work_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_checkpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_template_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_tables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_columns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_rows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_row_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_presets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_columns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_rows TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_plan TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_consumption TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_check_ins TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE updates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE media_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bridge_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_daily_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE owner_broadcasts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE owner_broadcast_recipients TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiry_phones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiry_remarks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiry_reminders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE enquiry_intake TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE calendar_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public_abuse_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public_rate_limit_buckets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_schedule TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_performance_monthly TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE team_member_tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE member_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE personal_reminders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE attendance_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_milestone_presets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payment_milestone_preset_items TO service_role;

GRANT SELECT ON TABLE v_project_variance TO service_role;
GRANT SELECT ON TABLE v_project_checkpoint_status TO service_role;
GRANT SELECT ON TABLE v_checkpoint_progress TO service_role;
GRANT SELECT ON TABLE v_work_log_current TO service_role;
GRANT SELECT ON TABLE v_material_consumption_current TO service_role;
GRANT SELECT ON TABLE v_expenses_current TO service_role;
GRANT SELECT ON TABLE v_payment_status TO service_role;
GRANT SELECT ON TABLE v_kpi_scores TO service_role;
GRANT SELECT ON TABLE v_employee_revenue_contribution TO service_role;
GRANT SELECT ON TABLE v_attendance_monthly TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
