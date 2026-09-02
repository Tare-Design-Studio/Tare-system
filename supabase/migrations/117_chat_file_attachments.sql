-- 117: Let chat carry documents (PDF, DWG) alongside images.
--
-- Chat attachments were image-only: the upload route allowed five image MIME
-- types, and message_type's CHECK (020) had no value meaning "a file". Sending a
-- PDF would either be rejected at the route or, if forced through, be mislabelled
-- 'image' and render in an <img> tag that shows nothing.
--
-- Three changes, all additive:
--
--   1. message_type gains 'file'.
--   2. chat_attachments gains file_name.
--   3. the DM preview trigger learns to describe a file.
--
-- No scanner is added, per instruction. The posture is unchanged from 113 and is
-- now materially weaker in one respect worth stating plainly: a PDF or DWG is a
-- richer attack surface than a JPEG, and nothing in this stack inspects either.
-- The controls remain the private bucket, the 30-minute signed URL, and
-- participant-only RLS. Documented, not mitigated.

-- ---------------------------------------------------------------------------
-- 1. message_type gains 'file'
-- ---------------------------------------------------------------------------
-- The constraint is unnamed in 020 (inline CHECK), so Postgres generated
-- bridge_messages_message_type_check. Dropped by that generated name and
-- recreated rather than ALTERed: a CHECK cannot be widened in place.

ALTER TABLE bridge_messages
  DROP CONSTRAINT IF EXISTS bridge_messages_message_type_check;

ALTER TABLE bridge_messages
  ADD CONSTRAINT bridge_messages_message_type_check
  CHECK (message_type IN (
    'text',
    'image',
    'file',
    'drawing_ref',
    'material_request',
    'clarification'
  ));

-- ---------------------------------------------------------------------------
-- 2. The original filename
-- ---------------------------------------------------------------------------
-- storage_path is a UUID, which is right for the bucket and useless to a reader:
-- "9f3c...dwg" tells nobody which drawing it is. Nullable, because every row
-- that already exists predates this column and is an image rendered as a
-- thumbnail, where the name was never shown.

ALTER TABLE chat_attachments
  ADD COLUMN IF NOT EXISTS file_name text;

-- ---------------------------------------------------------------------------
-- 3. Notification preview
-- ---------------------------------------------------------------------------
-- notify_dm_message() (109, hardened in 111) builds the bell preview from
-- message_type. A 'file' message usually has a NULL body, so without this it
-- would raise a notification reading "" — a bell with no text.
--
-- Only the preview expression changes. The rest of the body is copied verbatim
-- from the LIVE definition (pg_get_functiondef), not reconstructed from the 109
-- and 111 migration text: CREATE OR REPLACE rewrites the whole function, so any
-- drift between what those files say and what is actually installed would be
-- silently reverted here -- including 111's peer tenant re-check.

CREATE OR REPLACE FUNCTION public.notify_dm_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- THE ONLY CHANGE IN THIS FUNCTION (117). Was:
  --   v_preview := COALESCE(NEW.body, 'Sent an image');
  -- which described a PDF or DWG as an image. A file message normally has a
  -- NULL body, so the fallback is what the recipient actually reads.
  v_preview := COALESCE(
    NEW.body,
    CASE NEW.message_type
      WHEN 'file'  THEN 'Sent a file'
      WHEN 'image' THEN 'Sent an image'
      ELSE 'Sent an image'
    END
  );
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
$function$;
