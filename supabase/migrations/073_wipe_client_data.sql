-- 073_wipe_client_data.sql
-- One-time wipe of all CLIENT/OPERATIONAL data ahead of onboarding a new client.
-- Verified against the live cloud DB on 2026-06-07.
--
-- KEEPS (structure + data):
--   tenants, users, user_capabilities, user_sessions, team_member_tags,
--   enquiry_intake, push_subscriptions, audit_log, audit_export_log,
--   and ALL reusable presets/templates:
--     checkpoint_templates (+ checkpoint_template_items),
--     table_presets (+ table_preset_columns/sections/rows),
--     material_plan_presets (+ material_plan_preset_items),
--     payment_milestone_presets (+ payment_milestone_preset_items).
--
-- audit_log is append-only (invariant #3, no DELETE RLS policy) — never truncated here.
--
-- IMPORTANT: user_capabilities has an FK -> projects (on_delete=NO ACTION), and it is
-- the ONLY external table referencing the wipe set (verified via pg_constraint). That
-- FK has two consequences:
--   * TRUNCATE projects ... CASCADE would truncate the ENTIRE user_capabilities table
--     (TRUNCATE CASCADE is table-level, not row-level) — wiping every permission row.
--   * TRUNCATE without CASCADE refuses, because projects is referenced by a FK.
-- So we cannot truncate projects with or without CASCADE while user_capabilities exists
-- outside the list. Instead: include user_capabilities IN the TRUNCATE list (no CASCADE
-- needed — the list is then fully self-contained), but stash its tenant-wide rows in a
-- TEMP table first and re-insert them after. Project-scoped rows are intentionally
-- dropped (their projects are gone). Whole thing is one transaction; CASCADE is omitted
-- as a guard so any unforeseen external dependency errors loudly instead of silently
-- over-deleting. Idempotent.

BEGIN;

-- (1) Preserve tenant-wide capability grants; project-scoped ones are dropped.
CREATE TEMP TABLE _keep_caps ON COMMIT DROP AS
  SELECT * FROM user_capabilities WHERE scope_project_id IS NULL;

-- (2) Truncate client/operational data + user_capabilities. No CASCADE — self-contained.
TRUNCATE TABLE
  user_capabilities,
  payment_records,
  payment_schedule,
  material_consumption,
  material_plan,
  expenses,
  site_check_ins,
  project_table_row_revisions,
  project_table_rows,
  project_table_sections,
  project_table_columns,
  project_tables,
  work_log,
  checkpoint_items,
  project_checkpoints,
  project_assignments,
  projects,
  owner_broadcast_recipients,
  owner_broadcasts,
  team_daily_tasks,
  bridge_messages,
  media_assets,
  updates,
  calendar_events,
  enquiry_reminders,
  enquiry_remarks,
  enquiry_phones,
  enquiries,
  customers,
  public_abuse_log,
  public_rate_limit_buckets,
  member_tasks,
  personal_reminders,
  attendance_logs,
  team_performance_monthly,
  notification_recipients,
  notifications
RESTART IDENTITY;

-- (3) Restore the preserved tenant-wide capability rows.
INSERT INTO user_capabilities SELECT * FROM _keep_caps;

COMMIT;
