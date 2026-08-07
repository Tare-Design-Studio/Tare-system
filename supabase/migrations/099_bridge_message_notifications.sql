-- 099: Notify on a new bridge message, and clear it once the thread is read.
--
-- Bridge had no notification path at all: 041 only generates personal-reminder
-- notifications, so a site engineer could post and nobody learned about it
-- until they happened to open the page.
--
-- Three decisions, all deliberate:
--
-- 1. RECIPIENTS — everyone assigned to the project, plus the tenant's owners,
--    minus the author. Threads are readable tenant-wide (094), so "everyone who
--    can read it" would notify ~20 people about all ~56 projects and be muted
--    within a week. Assignment is the honest signal of who is working the site.
--
-- 2. ONE LIVE NOTIFICATION PER THREAD, not per message. Chat arrives in bursts;
--    a row per message buries the bell. The dedupe_key is the project, so a
--    second message updates the existing notification in place.
--
--    emit_notification() cannot be reused here: it is ON CONFLICT DO NOTHING,
--    which is right for cron (never emit twice) and wrong for chat (a new
--    message in a thread you have already read must raise it again). This
--    function instead UPSERTs the notification and *resets* is_read on the
--    recipients, so a collapsed thread comes back unread when it moves.
--
-- 3. IN-APP BELL ONLY. No web push row is written; 033's push path is left
--    alone until real message volume is known.
--
-- Reading the thread clears the notification — see clear_bridge_notification(),
-- called by POST /api/bridge/reads when a thread is opened.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- Emit / collapse
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_bridge_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_name text;
  v_author_name  text;
  v_dedupe_key   text;
  v_notif_id     uuid;
  v_preview      text;
BEGIN
  SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
  SELECT full_name INTO v_author_name FROM users WHERE id = NEW.author_id;

  -- One notification per (project, recipient set) for as long as it stays
  -- unread. Not time-bucketed: an unread thread must not spawn a second row
  -- just because the hour rolled over.
  v_dedupe_key := 'bridge:' || NEW.project_id::text;

  v_preview := CASE NEW.message_type
    WHEN 'material_request' THEN 'Material request: ' ||
      COALESCE(NEW.structured_payload->>'item_name', 'item')
    WHEN 'clarification'    THEN 'Clarification: ' || COALESCE(NEW.body, '')
    WHEN 'drawing_ref'      THEN 'Drawing reference'
    ELSE COALESCE(NEW.body, '')
  END;

  -- Trim the preview so the bell row stays one line.
  IF length(v_preview) > 120 THEN
    v_preview := left(v_preview, 117) || '…';
  END IF;

  -- UPSERT rather than DO NOTHING: the title/body must reflect the newest
  -- message, and created_at must move so the bell sorts it to the top.
  INSERT INTO notifications (
    tenant_id, kind, severity, title, body, source_type, source_id, dedupe_key
  )
  VALUES (
    NEW.tenant_id,
    'bridge_message',
    'info',
    COALESCE(v_project_name, 'Project') || ' — Bridge',
    COALESCE(v_author_name, 'Someone') || ': ' || v_preview,
    'bridge_message',
    NEW.project_id,     -- the THREAD, not the message: the bell links to the
                        -- thread, and clearing is per-thread.
    v_dedupe_key
  )
  ON CONFLICT (tenant_id, dedupe_key) DO UPDATE
    SET title      = EXCLUDED.title,
        body       = EXCLUDED.body,
        created_at = now()
  RETURNING id INTO v_notif_id;

  -- Recipients: assigned members + owners, never the author.
  INSERT INTO notification_recipients (notification_id, user_id)
  SELECT v_notif_id, u.id
  FROM   users u
  WHERE  u.tenant_id = NEW.tenant_id
    AND  u.is_active = true
    AND  u.deleted_at IS NULL
    AND  u.id <> NEW.author_id
    AND  (
           u.role = 'owner'
           OR EXISTS (
             SELECT 1 FROM project_assignments pa
             WHERE pa.project_id = NEW.project_id
               AND pa.user_id    = u.id
           )
         )
  -- A thread that was read and then moved again must go unread. Without this
  -- reset the collapsed notification would stay marked read forever and the
  -- second message would never surface.
  ON CONFLICT (notification_id, user_id) DO UPDATE
    SET is_read = false,
        read_at = NULL;

  RETURN NEW;
END;
$$;

-- AFTER INSERT: notification failure must never roll back the message itself.
DROP TRIGGER IF EXISTS bridge_message_notify ON bridge_messages;
CREATE TRIGGER bridge_message_notify
  AFTER INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_bridge_message();

-- ---------------------------------------------------------------------------
-- Clear on read
-- ---------------------------------------------------------------------------

-- Called when a user opens a thread. Marks that user's bridge notification for
-- the project read — the notification disappears from their bell while
-- everyone else's stays until they each open it.
--
-- SECURITY DEFINER because notification_recipients has no UPDATE policy for
-- authenticated (006 grants SELECT only). The function is therefore its own
-- authorization boundary: it writes exactly one row, keyed on auth.uid(), and
-- takes no user_id argument — so a caller can only ever clear their own.
CREATE OR REPLACE FUNCTION clear_bridge_notification(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE notification_recipients nr
  SET    is_read = true,
         read_at = now()
  FROM   notifications n
  WHERE  n.id            = nr.notification_id
    AND  nr.user_id      = auth.uid()
    AND  nr.is_read      = false
    AND  n.kind          = 'bridge_message'
    AND  n.source_id     = p_project_id
    -- Tenant check is belt-and-braces: source_id already pins the project.
    AND  n.tenant_id     = current_user_tenant_id();
END;
$$;

REVOKE EXECUTE ON FUNCTION clear_bridge_notification(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION clear_bridge_notification(uuid) TO authenticated;
