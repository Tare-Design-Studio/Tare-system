-- 108: One round trip for the whole chat sidebar and the nav badge.
--
-- /api/bridge/reads used to SELECT up to 2000 message rows into Node and count
-- them in JavaScript. That was tolerable when one page used it. The nav badge
-- makes it app-wide, so counting moves into Postgres where the
-- (conversation_id, created_at) index from 107 does the work and ~20 small
-- rows come back instead of 2000 large ones.
--
-- SECURITY INVOKER (the default) is deliberate and load-bearing: the function
-- must see exactly what the caller can see. A DEFINER version would hand every
-- caller counts for threads they cannot read — including other people's DMs.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE OR REPLACE FUNCTION chat_unread_counts()
RETURNS TABLE (
  conversation_id uuid,
  kind            text,
  project_id      uuid,
  peer_id         uuid,
  title           text,
  unread          integer,
  last_message_at timestamptz,
  preview         text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    c.id,
    c.kind,
    c.project_id,
    -- The other participant, from the caller's point of view.
    CASE WHEN c.kind = 'dm'
         THEN CASE WHEN c.dm_lo = auth.uid() THEN c.dm_hi ELSE c.dm_lo END
    END AS peer_id,
    CASE WHEN c.kind = 'project'
         THEN p.name
         ELSE (SELECT u.full_name FROM users u
               WHERE u.id = CASE WHEN c.dm_lo = auth.uid() THEN c.dm_hi ELSE c.dm_lo END)
    END AS title,
    COALESCE((
      SELECT count(*) FROM bridge_messages m
      WHERE m.conversation_id = c.id
        -- Never count your own messages as unread.
        AND m.author_id <> auth.uid()
        -- A thread never opened counts as fully unread: that is the state a
        -- new member is in, and showing zero there hides every live thread.
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    ), 0)::integer AS unread,
    c.last_message_at,
    (SELECT left(COALESCE(m.body, ''), 80) FROM bridge_messages m
     WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC LIMIT 1) AS preview
  FROM chat_conversations c
  LEFT JOIN projects p  ON p.id = c.project_id
  LEFT JOIN chat_reads r ON r.conversation_id = c.id AND r.user_id = auth.uid()
  -- RLS on chat_conversations already restricts this to threads the caller may
  -- see. The extra predicate drops finished project threads from the sidebar
  -- without hiding a DM.
  WHERE c.kind = 'dm'
     OR p.status NOT IN ('cancelled', 'completed')
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION chat_unread_counts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION chat_unread_counts() TO authenticated;

-- ---------------------------------------------------------------------------
-- Open-or-create a DM
-- ---------------------------------------------------------------------------

-- The ordering rule (dm_lo < dm_hi) lives in one place: here. A client that
-- built the pair itself would get it wrong half the time, and the CHECK would
-- reject it with an error the UI cannot explain.
--
-- SECURITY INVOKER, so chat_conv_insert still applies: the caller can only
-- ever create a DM they are part of.
CREATE OR REPLACE FUNCTION open_dm(p_peer uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_lo     uuid;
  v_hi     uuid;
  v_id     uuid;
  v_tenant uuid := current_user_tenant_id();
BEGIN
  IF v_me IS NULL OR p_peer IS NULL OR p_peer = v_me THEN
    RAISE EXCEPTION 'Invalid DM peer';
  END IF;

  -- The peer must be a live user in the caller's own tenant. Without this a
  -- caller could open a thread against a uuid from another tenant and leak
  -- their own name and messages across the boundary.
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_peer
      AND u.tenant_id = v_tenant
      AND u.is_active = true
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Peer not available';
  END IF;

  IF v_me < p_peer THEN v_lo := v_me;   v_hi := p_peer;
  ELSE                  v_lo := p_peer; v_hi := v_me;
  END IF;

  SELECT id INTO v_id FROM chat_conversations
  WHERE kind = 'dm' AND dm_lo = v_lo AND dm_hi = v_hi;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- ON CONFLICT covers the race the ordered pair makes detectable: both
  -- parties opening the thread in the same instant.
  INSERT INTO chat_conversations (tenant_id, kind, dm_lo, dm_hi)
  VALUES (v_tenant, 'dm', v_lo, v_hi)
  ON CONFLICT (dm_lo, dm_hi) WHERE kind = 'dm' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM chat_conversations
    WHERE kind = 'dm' AND dm_lo = v_lo AND dm_hi = v_hi;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION open_dm(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION open_dm(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- DM notifications
-- ---------------------------------------------------------------------------

-- 099 notifies assigned members + owners for a project message. A DM has
-- neither, so it needs its own recipient rule: the one other participant.
CREATE OR REPLACE FUNCTION notify_dm_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_conv    chat_conversations%ROWTYPE;
  v_peer    uuid;
  v_author  text;
  v_notif   uuid;
  v_preview text;
BEGIN
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_conv FROM chat_conversations WHERE id = NEW.conversation_id;
  -- Project messages are 099's job; this trigger handles DMs only.
  IF v_conv.kind <> 'dm' THEN RETURN NEW; END IF;

  v_peer := CASE WHEN v_conv.dm_lo = NEW.author_id THEN v_conv.dm_hi ELSE v_conv.dm_lo END;
  SELECT full_name INTO v_author FROM users WHERE id = NEW.author_id;

  v_preview := COALESCE(NEW.body, 'Sent an image');
  IF length(v_preview) > 120 THEN v_preview := left(v_preview, 117) || '…'; END IF;

  -- One notification per DM thread, same collapse rule as 099: chat arrives
  -- in bursts and a row per message buries the bell.
  INSERT INTO notifications (
    tenant_id, kind, severity, title, body, source_type, source_id, dedupe_key
  )
  VALUES (
    NEW.tenant_id, 'chat_dm', 'info',
    COALESCE(v_author, 'Someone'), v_preview,
    'chat_conversation', v_conv.id,
    'dm:' || v_conv.id::text
  )
  ON CONFLICT (tenant_id, dedupe_key) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = now()
  RETURNING id INTO v_notif;

  INSERT INTO notification_recipients (notification_id, user_id)
  VALUES (v_notif, v_peer)
  -- A thread read and then moved again must go unread, or the second message
  -- never surfaces.
  ON CONFLICT (notification_id, user_id) DO UPDATE
    SET is_read = false, read_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bridge_message_notify_dm ON bridge_messages;
CREATE TRIGGER bridge_message_notify_dm
  AFTER INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_dm_message();

-- Clearing a conversation's bell entry on open. 099's clear_bridge_notification
-- keys on a project id; this one keys on a conversation and covers both kinds.
CREATE OR REPLACE FUNCTION clear_chat_notification(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_project uuid;
BEGIN
  SELECT project_id INTO v_project
  FROM chat_conversations WHERE id = p_conversation_id;

  UPDATE notification_recipients nr
  SET    is_read = true, read_at = now()
  FROM   notifications n
  WHERE  n.id       = nr.notification_id
    AND  nr.user_id = auth.uid()
    AND  nr.is_read = false
    AND  n.tenant_id = current_user_tenant_id()
    AND  (
          (n.kind = 'chat_dm'        AND n.source_id = p_conversation_id)
       OR (n.kind = 'bridge_message' AND n.source_id = v_project AND v_project IS NOT NULL)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION clear_chat_notification(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION clear_chat_notification(uuid) TO authenticated;
