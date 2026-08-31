-- 107: Bridge becomes a chat — DM threads, per-conversation read state,
--      attachments, and a DB-side unread count.
--
-- Bridge could only ever address a project. Everything here exists to add
-- 1:1 direct messages without forking the message table in two.
--
-- Four decisions worth the ink:
--
-- 1. ONE CONVERSATION TABLE for both kinds. The alternative — nullable
--    project_id plus nullable peer columns on bridge_messages — makes every
--    read `WHERE project_id = x OR (a = me AND b = you)`, which no index
--    serves and which forces RLS into two disjoint branches.
--
-- 2. DM IDENTITY IS ORDERED. dm_lo < dm_hi is a CHECK, not a convention, so
--    "A to B" and "B to A" are the same row and the partial UNIQUE index can
--    enforce it. Without the ordering, two people opening each other at the
--    same instant create two threads and each sees half the conversation.
--
-- 3. chat_reads REPLACES bridge_reads. The old PK is (user_id, project_id),
--    which cannot key a DM. Backfilled here; the DROP is the last statement
--    in the file so a failed backfill aborts with the old table intact.
--
-- 4. CHAT IMAGES ARE NOT media_assets. That table's project_id is NOT NULL
--    (a DM has no project), and prunePrivateMedia() keeps only the 15 newest
--    per kind per project — pointed at chat it would delete conversation
--    history. Same bucket and same webp pipeline, different table, no Drive
--    push and no pruning.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('project', 'dm')),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  dm_lo           uuid REFERENCES users(id)    ON DELETE CASCADE,
  dm_hi           uuid REFERENCES users(id)    ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- The two shapes are mutually exclusive. A row cannot be half a DM.
  CONSTRAINT chat_conv_shape CHECK (
       (kind = 'project' AND project_id IS NOT NULL AND dm_lo IS NULL     AND dm_hi IS NULL)
    OR (kind = 'dm'      AND project_id IS NULL     AND dm_lo IS NOT NULL AND dm_hi IS NOT NULL
        AND dm_lo < dm_hi)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conv_project_uniq
  ON chat_conversations (project_id) WHERE kind = 'project';
CREATE UNIQUE INDEX IF NOT EXISTS chat_conv_dm_uniq
  ON chat_conversations (dm_lo, dm_hi) WHERE kind = 'dm';
-- Sorts the conversation list without touching bridge_messages.
CREATE INDEX IF NOT EXISTS chat_conv_recent
  ON chat_conversations (tenant_id, last_message_at DESC NULLS LAST);
-- Serves "my DMs" from either side without a scan.
CREATE INDEX IF NOT EXISTS chat_conv_dm_lo ON chat_conversations (dm_lo) WHERE kind = 'dm';
CREATE INDEX IF NOT EXISTS chat_conv_dm_hi ON chat_conversations (dm_hi) WHERE kind = 'dm';

-- ---------------------------------------------------------------------------
-- 2. Attachments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  bucket       text NOT NULL DEFAULT 'media-private',
  storage_path text NOT NULL,
  webp_path    text,
  mime_type    text NOT NULL,
  byte_size    integer NOT NULL,
  -- Mirrors media_assets: nothing is served to a viewer until it is clean.
  scan_status  text NOT NULL DEFAULT 'pending'
               CHECK (scan_status IN ('pending', 'clean', 'infected', 'error')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_attachments_uploader ON chat_attachments (uploaded_by);

-- ---------------------------------------------------------------------------
-- 3. Messages gain a conversation, a quote, and an attachment
-- ---------------------------------------------------------------------------

ALTER TABLE bridge_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES chat_conversations(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: a quoted message that vanishes must degrade the
  -- reply to an unquoted one, never delete it.
  ADD COLUMN IF NOT EXISTS reply_to_id     uuid REFERENCES bridge_messages(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_id   uuid REFERENCES chat_attachments(id)   ON DELETE SET NULL;

-- The thread read: every message in a conversation, oldest first.
CREATE INDEX IF NOT EXISTS bridge_messages_conversation
  ON bridge_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Backfill: one conversation per project that has a thread
-- ---------------------------------------------------------------------------

-- Every project gets a conversation row, not only those with messages: the
-- picker lists all active projects, and a thread that does not exist until
-- someone speaks would 404 on first open.
INSERT INTO chat_conversations (tenant_id, kind, project_id, last_message_at)
SELECT p.tenant_id,
       'project',
       p.id,
       (SELECT max(created_at) FROM bridge_messages m WHERE m.project_id = p.id)
FROM   projects p
ON CONFLICT DO NOTHING;

UPDATE bridge_messages m
SET    conversation_id = c.id
FROM   chat_conversations c
WHERE  c.kind = 'project'
  AND  c.project_id = m.project_id
  AND  m.conversation_id IS NULL;

-- A project message must now belong to a conversation. DM messages have a
-- NULL project_id, so this is asserted rather than made NOT NULL.
DO $$
DECLARE v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM bridge_messages WHERE conversation_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % messages without a conversation', v_orphans;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Read state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_reads (
  user_id         uuid        NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS chat_reads_conversation ON chat_reads (conversation_id);

INSERT INTO chat_reads (user_id, conversation_id, tenant_id, last_read_at)
SELECT r.user_id, c.id, r.tenant_id, r.last_read_at
FROM   bridge_reads r
JOIN   chat_conversations c ON c.kind = 'project' AND c.project_id = r.project_id
ON CONFLICT DO NOTHING;

-- Parity check before the one-way step. Only rows whose project still exists
-- can carry over; a read row for a deleted project has nowhere to go and is
-- excluded from both sides of the comparison.
DO $$
DECLARE v_src bigint; v_dst bigint;
BEGIN
  SELECT count(*) INTO v_src
  FROM bridge_reads r
  WHERE EXISTS (SELECT 1 FROM chat_conversations c
                WHERE c.kind = 'project' AND c.project_id = r.project_id);
  SELECT count(*) INTO v_dst FROM chat_reads;
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Read-state backfill mismatch: % source rows, % copied', v_src, v_dst;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. last_message_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_chat_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE chat_conversations
    SET    last_message_at = NEW.created_at
    WHERE  id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bridge_message_touch_conversation ON bridge_messages;
CREATE TRIGGER bridge_message_touch_conversation
  AFTER INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION touch_chat_conversation();

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

-- ENABLE alone leaves the table readable by the table owner. Both are
-- required — 081/097 exist because this was missed before.
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat_reads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reads         FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_attachments   FORCE  ROW LEVEL SECURITY;

-- A DM is visible to its two participants and to nobody else — owners
-- included. There is deliberately no admin backdoor: adding one later is a
-- decision someone should have to make on purpose.
DROP POLICY IF EXISTS chat_conv_select ON chat_conversations;
CREATE POLICY chat_conv_select ON chat_conversations FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    (kind = 'dm' AND auth.uid() IN (dm_lo, dm_hi))
    OR (kind = 'project' AND (
          has_capability('bridge:read', project_id)
          OR is_assigned_to_project(project_id)
       ))
  )
);

-- Only DM rows are insertable by a user, and only ones they are half of.
-- Project conversations are created by this migration and by the project
-- trigger below, never by a client.
DROP POLICY IF EXISTS chat_conv_insert ON chat_conversations;
CREATE POLICY chat_conv_insert ON chat_conversations FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND kind = 'dm'
  AND auth.uid() IN (dm_lo, dm_hi)
);

-- No UPDATE/DELETE policy: conversations are not editable or removable by
-- clients. last_message_at is maintained by a SECURITY DEFINER trigger.

DROP POLICY IF EXISTS chat_reads_own_rows ON chat_reads;
CREATE POLICY chat_reads_own_rows ON chat_reads FOR ALL
  USING      (user_id = auth.uid() AND tenant_id = current_user_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = current_user_tenant_id());

-- An attachment is readable by anyone who can read a message carrying it, and
-- by its uploader in the window between upload and the message insert.
DROP POLICY IF EXISTS chat_attachments_select ON chat_attachments;
CREATE POLICY chat_attachments_select ON chat_attachments FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM bridge_messages m
      WHERE m.attachment_id = chat_attachments.id
    )
  )
);

-- Rows are written by the upload route under the service client; a client
-- inserting its own attachment row would be claiming a storage path nobody
-- verified. No INSERT policy is granted to authenticated.

-- ---------------------------------------------------------------------------
-- 8. Messages RLS — extend to conversations
-- ---------------------------------------------------------------------------

-- 021's policies gate on project_id, which is NULL for a DM: under them a DM
-- message is invisible to everyone, its author included. Both are replaced by
-- conversation-aware versions that keep the project branch byte-identical.
DROP POLICY IF EXISTS bridge_select ON bridge_messages;
CREATE POLICY bridge_select ON bridge_messages FOR SELECT USING (
  tenant_id = current_user_tenant_id()
  AND (
    (project_id IS NOT NULL AND (
        has_capability('bridge:read', project_id)
        OR is_assigned_to_project(project_id)
    ))
    OR EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = bridge_messages.conversation_id
        AND c.kind = 'dm'
        AND auth.uid() IN (c.dm_lo, c.dm_hi)
    )
  )
);

DROP POLICY IF EXISTS bridge_insert ON bridge_messages;
CREATE POLICY bridge_insert ON bridge_messages FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND author_id = auth.uid()
  AND (
    (project_id IS NOT NULL AND (
        has_capability('bridge:write', project_id)
        OR is_assigned_to_project(project_id)
    ))
    OR EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = bridge_messages.conversation_id
        AND c.kind = 'dm'
        AND auth.uid() IN (c.dm_lo, c.dm_hi)
    )
  )
);

-- ---------------------------------------------------------------------------
-- 9. New projects get a conversation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_project_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO chat_conversations (tenant_id, kind, project_id)
  VALUES (NEW.tenant_id, 'project', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_create_conversation ON projects;
CREATE TRIGGER project_create_conversation
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION create_project_conversation();

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------

-- Listed explicitly rather than a blanket GRANT ALL: 092's lesson is that the
-- table-level grant is what actually decides column access.
GRANT SELECT, INSERT                 ON chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_reads         TO authenticated;
GRANT SELECT                         ON chat_attachments   TO authenticated;
GRANT ALL ON chat_conversations, chat_reads, chat_attachments TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Realtime
-- ---------------------------------------------------------------------------

-- chat_conversations is published so a brand-new DM appears in the recipient's
-- list without a refetch. bridge_messages is already published (098).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 12. Retire bridge_reads — LAST, so a failure above leaves it intact
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS bridge_reads;
