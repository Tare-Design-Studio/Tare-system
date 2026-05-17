-- The audit page query embeds the actor relationship:
--   .select(`... actor:actor_id(id, full_name, email)`)
-- PostgREST resolves embedded resources through a foreign key. audit_log had
-- NO foreign key on actor_id, so the embed could not be resolved and the whole
-- query failed (returned null) — the audit page showed zero entries despite
-- 407 rows being present and RLS-visible.
--
-- Fix: add the missing FK audit_log.actor_id -> users(id).
-- NOT VALID skips the full-table scan; actor_id is nullable so deleted actors
-- are not a concern, and ON DELETE SET NULL keeps the chain intact if a user
-- row is ever hard-deleted.

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id)
  ON DELETE SET NULL
  NOT VALID;

ALTER TABLE audit_log VALIDATE CONSTRAINT audit_log_actor_id_fkey;

NOTIFY pgrst, 'reload schema';
