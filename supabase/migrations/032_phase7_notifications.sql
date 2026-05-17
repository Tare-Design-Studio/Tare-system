-- Phase 7 · Event-driven notification helpers + RLS fix

-- ── Fix notifications SELECT RLS policy ───────────────────────────────────
-- Phase 0 policy gated on audit_log:view (Owner-only). Replace with a join
-- to notification_recipients so all roles can read their own notifications.
DROP POLICY IF EXISTS "authenticated can read own tenant notifications" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM notification_recipients nr
      WHERE nr.notification_id = notifications.id
        AND nr.user_id = auth.uid()
    )
  );

-- ── emit_site_checkin_notification() ─────────────────────────────────────
-- Called from /api/projects/[id]/checkin after every site check-in.
-- Real-time: fires immediately on each check-in.
-- Emits site_checkin_recorded (info) or site_checkin_out_of_geofence (warning) to Owner.
CREATE OR REPLACE FUNCTION emit_site_checkin_notification(
  p_project_id      uuid,
  p_user_id         uuid,
  p_checkin_id      uuid,
  p_within_geofence boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant_id    uuid;
  v_project_name text;
  v_user_name    text;
BEGIN
  SELECT p.tenant_id, p.name INTO v_tenant_id, v_project_name
  FROM projects p WHERE p.id = p_project_id;

  SELECT full_name INTO v_user_name FROM users WHERE id = p_user_id;

  IF p_within_geofence THEN
    PERFORM emit_notification(
      p_tenant_id   => v_tenant_id,
      p_kind        => 'site_checkin_recorded',
      p_severity    => 'info',
      p_source_type => 'site_check_in',
      p_source_id   => p_checkin_id,
      p_title       => v_user_name || ' checked in at ' || v_project_name,
      p_body        => NULL,
      p_dedupe_key  => 'site_checkin_recorded:' || p_checkin_id::text
    );
  ELSE
    PERFORM emit_notification(
      p_tenant_id   => v_tenant_id,
      p_kind        => 'site_checkin_out_of_geofence',
      p_severity    => 'warning',
      p_source_type => 'site_check_in',
      p_source_id   => p_checkin_id,
      p_title       => v_user_name || ' checked in outside geofence — ' || v_project_name,
      p_body        => 'GPS coordinates were outside the project site radius.',
      p_dedupe_key  => 'site_checkin_oob:' || p_checkin_id::text
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION emit_site_checkin_notification(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION emit_site_checkin_notification(uuid, uuid, uuid, boolean) TO authenticated;

-- ── compact_old_notifications() ───────────────────────────────────────────
-- Manual or future-scheduled cleanup of notifications older than 90 days.
CREATE OR REPLACE FUNCTION compact_old_notifications()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM notification_recipients
  WHERE notification_id IN (
    SELECT id FROM notifications
    WHERE created_at < now() - interval '90 days'
  );
  DELETE FROM notifications
  WHERE created_at < now() - interval '90 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION compact_old_notifications() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION compact_old_notifications() TO notification_writer;
