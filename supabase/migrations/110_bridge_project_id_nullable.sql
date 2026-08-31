-- 110: bridge_messages.project_id must be nullable for a DM to exist.
--
-- 020 created the column NOT NULL, when a message could only ever belong to a
-- project. 107 added conversation_id but left the old constraint in place, so
-- every DM insert failed on it. Found by the verification probe.
--
-- The NOT NULL is replaced by a CHECK that keeps the real invariant — a message
-- belongs to *something* — rather than dropping the guarantee entirely.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

ALTER TABLE bridge_messages ALTER COLUMN project_id DROP NOT NULL;

-- conversation_id is not itself made NOT NULL: it was added in 107 and
-- backfilled, but making it NOT NULL would break any insert path that still
-- supplies only a project_id. The CHECK covers both shapes.
ALTER TABLE bridge_messages
  DROP CONSTRAINT IF EXISTS bridge_messages_has_thread;
ALTER TABLE bridge_messages
  ADD CONSTRAINT bridge_messages_has_thread
  CHECK (project_id IS NOT NULL OR conversation_id IS NOT NULL);
