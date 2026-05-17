-- Phase 0 · Notifications scaffold (minimal — no push delivery yet)

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  kind        text NOT NULL,
  severity    notification_severity NOT NULL DEFAULT 'info',
  title       text NOT NULL,
  body        text,
  source_type text NOT NULL,              -- required: e.g. 'checkpoint', 'enquiry'
  source_id   uuid,
  dedupe_key  text NOT NULL,              -- prevents duplicate emissions from cron jobs
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read own tenant notifications"
  ON notifications FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
    AND has_capability('audit_log:view') -- owners see all; others see their own via recipients
  );

-- ── Notification recipients ────────────────────────────────────────
CREATE TABLE notification_recipients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id      uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read              boolean NOT NULL DEFAULT false,
  read_at              timestamptz,
  is_acknowledged      boolean NOT NULL DEFAULT false,
  acknowledged_at      timestamptz,
  push_attempts        int NOT NULL DEFAULT 0,
  push_last_attempt_at timestamptz,
  push_delivered       boolean NOT NULL DEFAULT false,
  push_last_error      text,

  UNIQUE (notification_id, user_id)
);

CREATE INDEX idx_notif_recipients_unread
  ON notification_recipients(user_id, is_read)
  WHERE is_read = false;

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notification_recipients"
  ON notification_recipients FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users update own notification_recipients"
  ON notification_recipients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Push subscriptions (table only — ingestion in Phase 7) ─────────
CREATE TABLE push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh_key   text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── emit_notification() ────────────────────────────────────────────
-- Only callable by notification_writer role (and SECURITY DEFINER callers).
-- Revoked from anon / authenticated / public.
CREATE OR REPLACE FUNCTION emit_notification(
  p_tenant_id   uuid,
  p_kind        text,
  p_severity    notification_severity,
  p_source_type text,                     -- NOT NULL enforced below
  p_title       text,
  p_body        text DEFAULT NULL,
  p_source_id   uuid DEFAULT NULL,
  p_dedupe_key  text DEFAULT NULL,
  p_user_ids    uuid[] DEFAULT NULL       -- NULL = emit to owner(s) only
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_notification_id uuid;
  v_dedupe_key      text;
  v_uid             uuid;
BEGIN
  IF p_source_type IS NULL THEN
    RAISE EXCEPTION 'p_source_type is required';
  END IF;

  v_dedupe_key := COALESCE(p_dedupe_key, p_kind || ':' || p_source_type || ':' || COALESCE(p_source_id::text, '') || ':' || extract(epoch from date_trunc('hour', now()))::text);

  INSERT INTO notifications (tenant_id, kind, severity, title, body, source_type, source_id, dedupe_key)
  VALUES (p_tenant_id, p_kind, p_severity, p_title, p_body, p_source_type, p_source_id, v_dedupe_key)
  ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_notification_id;

  IF v_notification_id IS NULL THEN RETURN NULL; END IF; -- duplicate, silently skip

  -- Resolve recipients: explicit list or fallback to owner
  IF p_user_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      INSERT INTO notification_recipients (notification_id, user_id)
      VALUES (v_notification_id, v_uid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    INSERT INTO notification_recipients (notification_id, user_id)
    SELECT v_notification_id, id FROM users
     WHERE tenant_id = p_tenant_id AND role = 'owner' AND is_active = true AND deleted_at IS NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_notification_id;
END;
$$;

-- Lock down emit_notification to notification_writer only
REVOKE EXECUTE ON FUNCTION emit_notification FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION emit_notification TO notification_writer;
