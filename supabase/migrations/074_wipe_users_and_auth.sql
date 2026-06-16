-- 074_wipe_users_and_auth.sql
-- One-time wipe of ALL users (auth + app) ahead of loading the new client's users.
-- Runs after 073 (client/operational data already wiped). Structure unchanged.
-- Verified against the live cloud DB on 2026-06-07.
--
-- DELETES: auth.users (the actual login accounts). public.users FKs to auth.users
--   with ON DELETE CASCADE, so deleting auth.users cascades to public.users, which in
--   turn cascades (ON DELETE CASCADE) to user_capabilities, user_sessions,
--   team_member_tags, push_subscriptions.
--
-- KEEPS: tenants (+ its config), enquiry_intake, audit_log/audit_export_log, and all
--   presets/templates. After this migration the tenant has ZERO users until new user
--   data is loaded — no one can log in in the meantime (intended).
--
-- TWO blockers had to be cleared first (both are ON DELETE NO ACTION FKs into users):
--   1) Kept presets carry a created_by audit-trail column referencing soon-deleted
--      users. Null them so the delete is not blocked; presets remain usable.
--   2) audit_log.actor_id (NO ACTION) references ~51 of these users, but audit_log is
--      append-only / hash-chained (invariant #3) — it must NOT be UPDATEd manually
--      (that would invalidate row_hash). Instead we change the FK to ON DELETE SET NULL
--      (its original design intent: "null for system/cron"). The FK action nulls
--      actor_id as a side effect of the user delete; it does NOT re-run audit_trigger,
--      so the stored hash chain stays valid.
--
-- NOTE: scripts/migrate.ts already wraps each file in BEGIN/COMMIT, so this file does
-- not declare its own transaction.

-- (1) audit_log.actor_id FK -> ON DELETE SET NULL (preserves append-only hash chain).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- (2) Null created_by on kept presets/templates (NO ACTION FK into users).
UPDATE checkpoint_templates        SET created_by = NULL WHERE created_by IS NOT NULL;
UPDATE table_presets               SET created_by = NULL WHERE created_by IS NOT NULL;
UPDATE material_plan_presets       SET created_by = NULL WHERE created_by IS NOT NULL;
UPDATE payment_milestone_presets   SET created_by = NULL WHERE created_by IS NOT NULL;

-- (3) user_capabilities.granted_by and user_sessions.revoked_by are NO ACTION FKs into
--     users (distinct from their CASCADE user_id FK). Deleting them up front removes the
--     blocker; their rows are going away with the users anyway.
DELETE FROM user_capabilities;
DELETE FROM user_sessions;
DELETE FROM team_member_tags;

-- (4) Delete the auth accounts. Cascades: auth.users -> public.users -> (team_member_tags,
--     push_subscriptions, + any remaining user_id rows). audit_log.actor_id -> NULL.
DELETE FROM auth.users;
