-- Phase 8 · Audit triggers — attach audit_trigger() to every domain table
-- that carries tenant_id. Excluded: audit_log, audit_export_log (recursion),
-- notification_recipients, push_subscriptions (high-churn operational),
-- public_abuse_log, public_rate_limit_buckets (already audit-ish),
-- feature_flags (operational, infrequent, covered by runbook).

-- ============================================================
-- Harden audit_export_log RLS to match spec
-- (007 only added SELECT; add INSERT for owner-with-export cap)
-- ============================================================

CREATE POLICY "audit_export_log_insert" ON audit_export_log
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND has_capability('audit_log:export')
  );

-- ============================================================
-- Attach audit_trigger to all domain tables
-- ============================================================

-- tenants (no tenant FK on self — triggers reads OLD/NEW.id as tenant_id via the trigger's coalesce)
-- Actually tenants has id = tenant_id; we skip it since it has no tenant_id FK column pointing elsewhere.
-- The trigger reads coalesce(NEW.tenant_id, OLD.tenant_id). For tenants itself NEW.tenant_id = NEW.id.
-- Safe to include — but spec says the chain is per-tenant and tenants rarely change, so include it.

CREATE TRIGGER trg_audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_user_sessions
  AFTER INSERT OR UPDATE OR DELETE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_user_capabilities
  AFTER INSERT OR UPDATE OR DELETE ON user_capabilities
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_assignments
  AFTER INSERT OR UPDATE OR DELETE ON project_assignments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_checkpoints
  AFTER INSERT OR UPDATE OR DELETE ON project_checkpoints
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_checkpoint_items
  AFTER INSERT OR UPDATE OR DELETE ON checkpoint_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_checkpoint_templates
  AFTER INSERT OR UPDATE OR DELETE ON checkpoint_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_checkpoint_template_items
  AFTER INSERT OR UPDATE OR DELETE ON checkpoint_template_items
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_work_log
  AFTER INSERT OR UPDATE OR DELETE ON work_log
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_material_plan
  AFTER INSERT OR UPDATE OR DELETE ON material_plan
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_material_consumption
  AFTER INSERT OR UPDATE OR DELETE ON material_consumption
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_site_check_ins
  AFTER INSERT OR UPDATE OR DELETE ON site_check_ins
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_media_assets
  AFTER INSERT OR UPDATE OR DELETE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_bridge_messages
  AFTER INSERT OR UPDATE OR DELETE ON bridge_messages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_updates
  AFTER INSERT OR UPDATE OR DELETE ON updates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_team_daily_tasks
  AFTER INSERT OR UPDATE OR DELETE ON team_daily_tasks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_owner_broadcasts
  AFTER INSERT OR UPDATE OR DELETE ON owner_broadcasts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_owner_broadcast_recipients
  AFTER INSERT OR UPDATE OR DELETE ON owner_broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_enquiries
  AFTER INSERT OR UPDATE OR DELETE ON enquiries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_enquiry_remarks
  AFTER INSERT OR UPDATE OR DELETE ON enquiry_remarks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_enquiry_reminders
  AFTER INSERT OR UPDATE OR DELETE ON enquiry_reminders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_enquiry_intake
  AFTER INSERT OR UPDATE OR DELETE ON enquiry_intake
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_calendar_events
  AFTER INSERT OR UPDATE OR DELETE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_payment_schedule
  AFTER INSERT OR UPDATE OR DELETE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_payment_records
  AFTER INSERT OR UPDATE OR DELETE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_table_presets
  AFTER INSERT OR UPDATE OR DELETE ON table_presets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_table_preset_columns
  AFTER INSERT OR UPDATE OR DELETE ON table_preset_columns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_table_preset_sections
  AFTER INSERT OR UPDATE OR DELETE ON table_preset_sections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_table_preset_rows
  AFTER INSERT OR UPDATE OR DELETE ON table_preset_rows
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_tables
  AFTER INSERT OR UPDATE OR DELETE ON project_tables
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_table_columns
  AFTER INSERT OR UPDATE OR DELETE ON project_table_columns
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_table_sections
  AFTER INSERT OR UPDATE OR DELETE ON project_table_sections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_table_rows
  AFTER INSERT OR UPDATE OR DELETE ON project_table_rows
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_project_table_row_revisions
  AFTER INSERT OR UPDATE OR DELETE ON project_table_row_revisions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_notifications
  AFTER INSERT OR UPDATE OR DELETE ON notifications
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_audit_team_performance_monthly
  AFTER INSERT OR UPDATE OR DELETE ON team_performance_monthly
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
