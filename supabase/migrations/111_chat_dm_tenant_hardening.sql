-- 111: Close the parallel DM-creation path that skips open_dm()'s tenant check.
--
-- Found in security review of 107/108, and confirmed against the live database:
-- open_dm() validates that the peer is a live user in the caller's own tenant,
-- but it is NOT the only way to create a conversation. 107 also granted INSERT
-- on chat_conversations directly to `authenticated`, and chat_conv_insert only
-- checked that the *caller* is one of the pair:
--
--   tenant_id = current_user_tenant_id() AND kind = 'dm' AND auth.uid() IN (dm_lo, dm_hi)
--
-- Nothing constrained the OTHER party. A client calling PostgREST directly
-- could therefore insert a DM row naming any user id at all as the peer —
-- including one from another tenant — and then post into it, at which point
-- notify_dm_message() writes a notification_recipients row for that peer. The
-- notifications tables carry no tenant predicate of their own (006/032), so the
-- message preview would surface in the victim's bell.
--
-- Verified on this database: the direct INSERT succeeds today, bypassing
-- open_dm(). The cross-tenant half could not be demonstrated here because the
-- database currently holds a single tenant — the hole is structural, not yet
-- reachable in this deployment.
--
-- Two layers, because either alone would leave a gap:
--   1. The policy itself validates the peer. This is the one that cannot be
--      bypassed, whatever entry point is used.
--   2. notify_dm_message() re-checks the peer's tenant before writing a
--      recipient row, so a conversation that somehow predates this policy
--      cannot notify across a tenant boundary.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. The peer must be a live user in the same tenant
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS chat_conv_insert ON chat_conversations;
CREATE POLICY chat_conv_insert ON chat_conversations FOR INSERT WITH CHECK (
  tenant_id = current_user_tenant_id()
  AND kind = 'dm'
  AND auth.uid() IN (dm_lo, dm_hi)
  -- Mirrors open_dm()'s check, at the layer no client can route around.
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = CASE WHEN dm_lo = auth.uid() THEN dm_hi ELSE dm_lo END
      AND u.tenant_id = current_user_tenant_id()
      AND u.is_active = true
      AND u.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 2. The notifier re-checks the tenant before naming a recipient
-- ---------------------------------------------------------------------------

-- Only the peer-tenant guard is new; the rest is 108 verbatim.
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
  IF v_conv.kind <> 'dm' THEN RETURN NEW; END IF;

  v_peer := CASE WHEN v_conv.dm_lo = NEW.author_id THEN v_conv.dm_hi ELSE v_conv.dm_lo END;

  -- A notification is the one artefact of a DM that escapes the conversation's
  -- own RLS, so the tenant boundary is re-asserted here rather than trusted
  -- from the conversation row.
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_peer AND u.tenant_id = NEW.tenant_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_author FROM users WHERE id = NEW.author_id;

  v_preview := COALESCE(NEW.body, 'Sent an image');
  IF length(v_preview) > 120 THEN v_preview := left(v_preview, 117) || '…'; END IF;

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
  ON CONFLICT (notification_id, user_id) DO UPDATE
    SET is_read = false, read_at = NULL;

  RETURN NEW;
END;
$$;
