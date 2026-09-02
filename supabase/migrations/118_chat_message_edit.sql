-- 118: Let an author edit their own chat message, and mark it as edited.
--
-- Messages were effectively append-only: bridge_messages has SELECT and INSERT
-- policies (021, 107) and no UPDATE or DELETE policy at all, so RLS denies both
-- to everyone -- verified against the live database, including the author's own
-- direct UPDATE.
--
-- Worth recording precisely, because the table grants do NOT say this.
-- `authenticated` actually holds UPDATE, DELETE and TRUNCATE on
-- bridge_messages: Supabase's default blanket grants to the role predate
-- 999_zz, whose narrower `GRANT SELECT, INSERT` only adds and never revokes.
-- The table is protected today by the ABSENCE of a policy, not by the grants.
-- Section 3 revokes the surplus so the two agree.
--
-- The edit therefore goes through a SECURITY DEFINER function that hard-codes
-- every condition an edit must satisfy, rather than adding an UPDATE policy: a
-- policy plus the pre-existing grant would make every column of every visible
-- row writable from a client, for the sake of one field. The RPC keeps the
-- writable surface to exactly `body`.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. edited_at
-- ---------------------------------------------------------------------------
-- NULL means never edited -- that is the marker the UI reads, so it must stay
-- NULL for the entire existing history rather than being backfilled to now().
ALTER TABLE bridge_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. edit_chat_message()
-- ---------------------------------------------------------------------------
-- Author-only, no time limit (the product decision). SECURITY DEFINER bypasses
-- RLS, so every check the policies would have made is made explicitly here.
--
-- Deliberately NOT editable:
--   * message_type, attachment_id -- editing text must not turn an image
--     message into a text one, or swap which file a message points at.
--   * conversation_id, project_id, author_id -- an edit cannot move a message
--     to another thread or re-attribute it.
CREATE OR REPLACE FUNCTION edit_chat_message(
  p_message_id uuid,
  p_body       text
)
RETURNS TABLE (id uuid, body text, edited_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_msg bridge_messages%ROWTYPE;
  v_body text;
BEGIN
  SELECT * INTO v_msg FROM bridge_messages m WHERE m.id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  -- Authorship is the whole authorization model here: you may edit your own
  -- message and nobody else's, regardless of any capability held.
  IF v_msg.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'not your message';
  END IF;

  -- Re-assert the tenant boundary. SECURITY DEFINER has bypassed the SELECT
  -- policy that would normally have made this impossible to reach.
  IF v_msg.tenant_id <> current_user_tenant_id() THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  v_body := btrim(p_body);
  IF v_body = '' THEN
    RAISE EXCEPTION 'message body cannot be empty';
  END IF;
  IF length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message body too long';
  END IF;

  -- An attachment-only message has a NULL body and no text to edit. Allowing it
  -- would let a caption appear on a message that never had one, which reads as
  -- the file itself having changed.
  IF v_msg.body IS NULL THEN
    RAISE EXCEPTION 'this message has no text to edit';
  END IF;

  RETURN QUERY
  UPDATE bridge_messages m
     SET body = v_body,
         -- Only stamped when the text actually changed, so re-saving identical
         -- text does not mark an untouched message as edited.
         edited_at = CASE WHEN m.body IS DISTINCT FROM v_body THEN now() ELSE m.edited_at END
   WHERE m.id = p_message_id
  RETURNING m.id, m.body, m.edited_at;
END;
$$;

GRANT EXECUTE ON FUNCTION edit_chat_message(uuid, text) TO authenticated;
