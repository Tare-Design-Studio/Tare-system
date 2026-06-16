-- demo_teardown_v2.sql — reverses scripts/seed-demo.ts (2026-06-11 demonstration data).
--
-- Run manually before any prod cutover or to clear the demo:
--   psql "$DATABASE_URL" -f supabase/demo_teardown_v2.sql
-- (or via the pg driver — this file contains no \-commands)
--
-- ⚠️ Kept OUT of supabase/migrations/ on purpose: the migrate runner applies every
--    *.sql in that folder, so a teardown placed there would auto-run and wipe the
--    seed immediately. (Same rule as demo_teardown.sql for the old 069 seed.)
--
-- This seed enriched 9 REAL Tare projects in place and used REAL Tare users as
-- authors/assignees. Teardown therefore:
--   1. deletes every demo CHILD row strictly by the `dec0de00-…` UUID namespace
--      (FK-ordered) — never touches real users or real project rows; and
--   2. nulls the demo-only enrichment columns on the 9 enriched projects back to
--      the bare state the base Tare seed left them in (name/slug/scope/stage/status
--      are untouched).
--
-- Real Tare data (20 users, 45 projects, presets, tenant config) is never deleted.

BEGIN;
SET LOCAL session_replication_role = replica; -- skip auth.uid()-based RLS/triggers

-- 1) child rows by namespace (FK-ordered: leaves first)
DELETE FROM team_performance_monthly      WHERE id::text LIKE 'dec0de00-%';
DELETE FROM attendance_logs               WHERE id::text LIKE 'dec0de00-%';
DELETE FROM owner_broadcast_recipients    WHERE id::text LIKE 'dec0de00-%';
DELETE FROM owner_broadcasts              WHERE id::text LIKE 'dec0de00-%';
DELETE FROM team_daily_tasks              WHERE id::text LIKE 'dec0de00-%';
DELETE FROM member_tasks                  WHERE id::text LIKE 'dec0de00-%';
DELETE FROM personal_reminders            WHERE id::text LIKE 'dec0de00-%';
DELETE FROM calendar_events               WHERE id::text LIKE 'dec0de00-%';
DELETE FROM bridge_messages               WHERE id::text LIKE 'dec0de00-%';
DELETE FROM media_assets                  WHERE id::text LIKE 'dec0de00-%';
DELETE FROM updates                       WHERE id::text LIKE 'dec0de00-%';
DELETE FROM site_check_ins                WHERE id::text LIKE 'dec0de00-%';
DELETE FROM expenses                      WHERE id::text LIKE 'dec0de00-%';
DELETE FROM material_consumption          WHERE id::text LIKE 'dec0de00-%';
DELETE FROM material_plan                 WHERE id::text LIKE 'dec0de00-%';
DELETE FROM payment_records               WHERE id::text LIKE 'dec0de00-%';
DELETE FROM checkpoint_items              WHERE id::text LIKE 'dec0de00-%';
-- checkpoints reference payment_schedule (triggers_payment_id) → delete checkpoints first
DELETE FROM project_checkpoints           WHERE id::text LIKE 'dec0de00-%';
DELETE FROM payment_schedule              WHERE id::text LIKE 'dec0de00-%';
DELETE FROM project_table_rows            WHERE id::text LIKE 'dec0de00-%';
DELETE FROM project_table_columns         WHERE id::text LIKE 'dec0de00-%';
DELETE FROM project_tables                WHERE id::text LIKE 'dec0de00-%';
DELETE FROM project_assignments           WHERE id::text LIKE 'dec0de00-%';
DELETE FROM enquiry_reminders             WHERE id::text LIKE 'dec0de00-%';
DELETE FROM enquiries                     WHERE id::text LIKE 'dec0de00-%';
DELETE FROM customers                     WHERE id::text LIKE 'dec0de00-%';

-- 2) revert demo enrichment on the 9 real projects (base Tare seed left these NULL)
UPDATE projects
   SET customer_id        = NULL,
       project_type       = NULL,
       budget_total       = NULL,
       start_date         = NULL,
       expected_end_date  = NULL,
       whatsapp_group_url = NULL
 WHERE id IN (
   '2ccbf822-3d4c-42dc-8aa1-df1c92862396', -- HARSHA
   '145eb7d1-6dde-4a6d-b640-a5e5f86ac4ff', -- VARUN
   'da8ef362-22c0-4dae-9eb5-0865179ec6a0', -- NIHARIKA
   '09040ba3-6014-4f85-8d93-933b5686175e', -- SURESH
   '3c5c733d-4fa6-46f7-a361-0206ffb1122f', -- RANGA SRINIVAS
   '93f6455e-2cbb-4127-a3c0-3965e5e3d8f1', -- MOHAN
   'de633dc0-b8d2-4a16-b2c4-c745b9f83da1', -- PRAKASH
   '27ab356d-dd6a-4cd5-89b2-17c057702d17', -- SHEELA
   '36a9e90d-3d66-403f-bb71-33554d2251ef'  -- M.G.R RESTAURANT
 );

COMMIT;
