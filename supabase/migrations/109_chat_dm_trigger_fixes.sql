-- 109: Make the pre-existing bridge_messages triggers DM-aware.
--
-- Both problems below were found by the 107/108 verification probe, not by the
-- type checker — they live entirely in trigger bodies written when a message
-- could only ever belong to a project.
--
-- 1. trg_bridge_set_tenant runs set_tenant_from_project() BEFORE INSERT, which
--    does `SELECT ... FROM projects WHERE id = NEW.project_id` and raises
--    'project % not found' when nothing matches. A DM has project_id NULL, so
--    *every* DM insert failed. The shared helper is used by many other tables
--    and is deliberately left alone; bridge_messages gets its own.
--
-- 2. notify_bridge_message() (099) fires on every insert. Its recipient query
--    is "owners of the tenant, plus anyone assigned to NEW.project_id, minus
--    the author" — with project_id NULL the assignment branch matches nobody
--    but the owner branch still matches, so sending a DM raised a bell
--    notification, carrying a preview of the message body, for every owner in
--    the tenant. They could not open the thread (RLS holds), but the preview
--    text was already in the notification. That is a disclosure, and it is
--    fixed here by making the trigger return early for a non-project message.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 1. Tenant denormalisation that tolerates a project-less message
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_bridge_message_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant_id uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    -- Unchanged behaviour for project threads, including the mismatch guard.
    SELECT tenant_id INTO v_tenant_id FROM projects WHERE id = NEW.project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project % not found', NEW.project_id;
    END IF;
  ELSIF NEW.conversation_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM chat_conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'conversation % not found', NEW.conversation_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'bridge_message requires a project_id or a conversation_id';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'tenant_id mismatch: supplied % but thread belongs to %',
      NEW.tenant_id, v_tenant_id;
  END IF;

  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bridge_set_tenant ON bridge_messages;
CREATE TRIGGER trg_bridge_set_tenant
  BEFORE INSERT ON bridge_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_bridge_message_tenant();

-- ---------------------------------------------------------------------------
-- 2. Stop the project notifier from firing on DMs
-- ---------------------------------------------------------------------------

-- Only the guard at the top is new; the rest is 099 verbatim.
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
  -- A DM has no project and no assignees. Without this the owner branch of the
  -- recipient query below matched every owner in the tenant and handed them a
  -- preview of a private message.
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_project_name FROM projects WHERE id = NEW.project_id;
  SELECT full_name INTO v_author_name FROM users WHERE id = NEW.author_id;

  v_dedupe_key := 'bridge:' || NEW.project_id::text;

  v_preview := CASE NEW.message_type
    WHEN 'material_request' THEN 'Material request: ' ||
      COALESCE(NEW.structured_payload->>'item_name', 'item')
    WHEN 'clarification'    THEN 'Clarification: ' || COALESCE(NEW.body, '')
    WHEN 'drawing_ref'      THEN 'Drawing reference'
    ELSE COALESCE(NEW.body, '')
  END;

  IF length(v_preview) > 120 THEN
    v_preview := left(v_preview, 117) || '…';
  END IF;

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
    NEW.project_id,
    v_dedupe_key
  )
  ON CONFLICT (tenant_id, dedupe_key) DO UPDATE
    SET title      = EXCLUDED.title,
        body       = EXCLUDED.body,
        created_at = now()
  RETURNING id INTO v_notif_id;

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
  ON CONFLICT (notification_id, user_id) DO UPDATE
    SET is_read = false,
        read_at = NULL;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The material-request trigger is project-only too
-- ---------------------------------------------------------------------------

-- bridge_material_request_to_plan (020) inserts a draft material_plan row keyed
-- on NEW.project_id. A material_request is only offered in the project composer,
-- but the API accepts the type on any conversation, so the guard is made
-- explicit rather than relying on the UI. Everything else — column list,
-- planned_quantity, the 'unit' default, SECURITY, and RETURN NULL (it is an
-- AFTER trigger) — is 020 verbatim.
CREATE OR REPLACE FUNCTION bridge_material_request_to_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.message_type = 'material_request'
     AND NEW.structured_payload IS NOT NULL
     AND NEW.project_id IS NOT NULL
  THEN
    INSERT INTO material_plan (
      tenant_id,
      project_id,
      item_name,
      unit,
      planned_quantity,
      source_bridge_message_id
    )
    VALUES (
      NEW.tenant_id,
      NEW.project_id,
      NEW.structured_payload->>'item_name',
      COALESCE(NEW.structured_payload->>'unit', 'unit'),
      COALESCE((NEW.structured_payload->>'quantity')::numeric, 1),
      NEW.id
    );
  END IF;

  RETURN NULL;
END;
$$;
