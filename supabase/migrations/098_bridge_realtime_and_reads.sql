-- 098: Make Bridge behave like a chat instead of a shared notepad.
--
-- Two independent gaps, both required before the UI can work:
--
-- 1. `bridge_messages` was never added to the `supabase_realtime` publication.
--    071 added 19 content tables and this was not one of them, so a posted
--    message only ever appeared after a full page reload. RealtimeRefresher
--    subscribed /bridge to `projects` + `project_assignments` — the two tables
--    whose changes do not matter on that screen.
--
-- 2. There was no read state anywhere, so with ~56 active projects in the
--    picker the only way to find the thread with new activity was to open each
--    one. `bridge_reads` stores one row per (user, project) holding the last
--    time that user looked at that thread; unread count is derived at read time
--    rather than stored, so it cannot drift out of sync with the messages.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Realtime
-- ---------------------------------------------------------------------------

-- Idempotent: re-adding a table already in the publication is an error, so the
-- membership is checked first (same guard as 071).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'bridge_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bridge_messages;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Per-user read state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bridge_reads (
  user_id      uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

-- The unread sweep is "every project this user has read state for", so the PK
-- (user_id first) already serves it. This index serves the reverse direction:
-- cascade deletes when a project is removed.
CREATE INDEX IF NOT EXISTS bridge_reads_project_idx ON bridge_reads (project_id);

-- No index is added on bridge_messages: 020 already created
-- bridge_messages(project_id, created_at ASC), which serves the unread count
-- scan. A btree is readable in either direction, so a DESC twin would be dead
-- weight on every insert.

-- ENABLE alone leaves the table readable by anything connecting as the table
-- owner. Both are required — see 081/097, which exist because this was missed.
ALTER TABLE bridge_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_reads FORCE  ROW LEVEL SECURITY;

-- Read state is private to its owner. There is no cross-user read of this
-- table anywhere in the app: nobody needs to know when someone else last
-- opened a thread, and exposing it would turn Bridge into a read-receipt
-- system that was never asked for.
DROP POLICY IF EXISTS bridge_reads_own_rows ON bridge_reads;
CREATE POLICY bridge_reads_own_rows ON bridge_reads
  FOR ALL
  USING      (user_id = auth.uid() AND tenant_id = current_user_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = current_user_tenant_id());

-- 092's lesson: a table-level grant is what actually decides column access, so
-- these are listed explicitly rather than relying on a blanket GRANT ALL.
GRANT SELECT, INSERT, UPDATE, DELETE ON bridge_reads TO authenticated;
GRANT ALL ON bridge_reads TO service_role;
