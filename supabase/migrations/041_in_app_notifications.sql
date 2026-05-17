-- 041_in_app_notifications.sql
-- Extends existing notification system for team member in-app (no web push for TM)
-- Adds: broadcast acknowledgement link on owner_broadcast_recipients (already exists in Phase 3)
-- Adds: pg_cron job to fire reminder notifications for personal_reminders

BEGIN;

-- Personal reminder notifications: pg_cron fires every 5 min, emits for reminders due within next minute
-- (reuses the emit_notification() pattern from Phase 7)

CREATE OR REPLACE FUNCTION generate_personal_reminder_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  notif_id uuid;
BEGIN
  FOR r IN
    SELECT pr.id, pr.user_id, pr.tenant_id, pr.title, pr.type, pr.reminder_at
    FROM personal_reminders pr
    WHERE pr.is_done = false
      AND pr.reminder_at BETWEEN now() AND now() + interval '5 minutes'
  LOOP
    BEGIN
      SELECT emit_notification(
        p_tenant_id    => r.tenant_id,
        p_kind         => 'personal_reminder_due',
        p_severity     => 'info',
        p_source_type  => 'personal_reminder',
        p_source_id    => r.id,
        p_title        => CASE r.type
                            WHEN 'meeting'  THEN 'Meeting reminder — ' || r.title
                            WHEN 'deadline' THEN 'Deadline reminder — ' || r.title
                            ELSE 'Reminder — ' || r.title
                          END,
        p_body         => 'Your reminder is due now.',
        p_url          => NULL,
        p_user_ids     => ARRAY[r.user_id],
        p_dedupe_key   => 'personal_reminder_' || r.id::text || '_' || date_trunc('hour', r.reminder_at)::text
      ) INTO notif_id;
    EXCEPTION WHEN unique_violation THEN
      -- Already emitted, skip
    END;
  END LOOP;
END;
$$;

-- Schedule: every 5 minutes
SELECT cron.schedule(
  'generate-personal-reminder-notifications',
  '*/5 * * * *',
  $$SELECT generate_personal_reminder_notifications()$$
);

COMMIT;
