-- 071: Enable Supabase Realtime for content tables that drive visible pages.
--
-- The app mounts a single global client subscriber (components/realtime/
-- RealtimeRefresher.tsx) that listens for changes on these tables and calls
-- router.refresh() (debounced, paused while the tab is hidden) so whichever
-- page is showing re-fetches its server data when the DB changes.
--
-- Supabase Realtime is opt-in per table: a table only emits change events once
-- it is a member of the supabase_realtime publication. We add only the tables
-- whose rows appear on a page. High-churn / non-content tables (audit_log,
-- attendance_logs, user_capabilities, presets, users, tenants) are intentionally
-- left out to avoid needless refreshes.
--
-- Default REPLICA IDENTITY (primary key) is sufficient — the subscriber only
-- needs to know a change happened, not the old row values. RLS still applies to
-- realtime, so each client only receives events for rows it can read.

BEGIN;

DO $$
DECLARE
  t text;
  content_tables text[] := ARRAY[
    'updates',
    'notification_recipients',
    'owner_broadcasts',
    'owner_broadcast_recipients',
    'member_tasks',
    'team_daily_tasks',
    'expenses',
    'material_plan',
    'material_consumption',
    'site_check_ins',
    'enquiries',
    'enquiry_reminders',
    'payment_records',
    'payment_schedule',
    'projects',
    'project_assignments',
    'calendar_events',
    'personal_reminders',
    'media_assets'
  ];
BEGIN
  FOREACH t IN ARRAY content_tables LOOP
    -- Skip if the table isn't present in this environment.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    -- Add to the realtime publication if not already a member.
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
