-- 126 · Site check-in: geofence auto check-in/out, end-of-day close, morning reminder
--
-- Site engineers forget to tap Check In / Check Out. Three parts:
--
--   A. The /site page checks the engineer in when it is opened inside a
--      project's geofence, and out when GPS leaves it (app open only — a web
--      app cannot read location in the background). The API re-verifies the
--      distance; these columns record that the action was automatic.
--   B. close_stale_site_checkins() closes any engineer session still open past
--      the tenant's workday end + grace. Every 15 minutes, like 101's
--      close_stale_attendance().
--   C. remind_site_checkin() pushes a reminder at 10:00 IST, Mon–Sat, to every
--      active site engineer with a live project and no check-in of either kind
--      today (and not on approved leave). Rides the existing pipeline:
--      notification_recipients INSERT → webhook → send-push edge function.
--
-- Only source = 'check_in' rows are engineer sessions. source = 'manual' rows
-- are owner-logged customer visits (106) and are never touched here.

-- ── A/B · how each leg happened ──────────────────────────────────────

ALTER TABLE site_check_ins
  ADD COLUMN IF NOT EXISTS checkin_method text NOT NULL DEFAULT 'button'
    CHECK (checkin_method IN ('button', 'geofence')),
  ADD COLUMN IF NOT EXISTS checkout_method text
    CHECK (checkout_method IN ('button', 'geofence', 'end_of_day'));

COMMENT ON COLUMN site_check_ins.checkin_method IS
  'button = engineer tapped Check In; geofence = /site checked them in on entering the site radius (API-verified distance).';
COMMENT ON COLUMN site_check_ins.checkout_method IS
  'NULL while open (or closed before 126). button / geofence (left the site radius, API-verified) / end_of_day (close_stale_site_checkins — the time is the cutoff, not a real departure).';

-- ── B · end-of-day close ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION close_stale_site_checkins()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_closed int := 0;
BEGIN
  WITH due AS (
    SELECT s.id, s.checked_in_at,
           -- Cutoff on the LOCAL day the session began.
           (((s.checked_in_at AT TIME ZONE COALESCE(t.timezone, 'Asia/Kolkata'))::date
             + COALESCE(t.workday_end, '18:00'::time))::timestamp
             AT TIME ZONE COALESCE(t.timezone, 'Asia/Kolkata'))
             + make_interval(mins => COALESCE(t.late_grace_minutes, 15)) AS cutoff_at
      FROM site_check_ins s
      JOIN tenants t ON t.id = s.tenant_id
     WHERE s.checked_out_at IS NULL
       AND s.source = 'check_in'
  )
  UPDATE site_check_ins s
     SET checked_out_at   = GREATEST(d.checked_in_at, d.cutoff_at),
         duration_minutes = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                              GREATEST(d.checked_in_at, d.cutoff_at) - d.checked_in_at
                            )) / 60)::int),
         checkout_method  = 'end_of_day'
    FROM due d
   WHERE s.id = d.id
     AND now() >= d.cutoff_at;

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

COMMENT ON FUNCTION close_stale_site_checkins() IS
  'Closes engineer site sessions left open past workday_end + grace on the day they began. Stamps the cutoff (a check-in after the cutoff closes at its own time, 0 min). Idempotent.';

REVOKE ALL ON FUNCTION close_stale_site_checkins() FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-stale-site-checkins') THEN
    PERFORM cron.unschedule('close-stale-site-checkins');
  END IF;
END $$;

SELECT cron.schedule(
  'close-stale-site-checkins',
  '*/15 * * * *',
  $$SELECT close_stale_site_checkins()$$
);

-- ── C · morning reminder ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remind_site_checkin()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r      record;
  v_sent int := 0;
BEGIN
  FOR r IN
    SELECT u.id AS user_id, u.tenant_id,
           (now() AT TIME ZONE COALESCE(t.timezone, 'Asia/Kolkata'))::date AS today,
           COALESCE(t.timezone, 'Asia/Kolkata') AS tz
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
     WHERE u.role = 'site_engineer'
       AND u.is_active = true
       AND u.deleted_at IS NULL
       AND EXISTS (
             SELECT 1 FROM project_assignments pa
               JOIN projects p ON p.id = pa.project_id
              WHERE pa.user_id = u.id AND p.status = 'active' AND p.deleted_at IS NULL)
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM site_check_ins s
       WHERE s.user_id = r.user_id
         AND (s.checked_in_at AT TIME ZONE r.tz)::date = r.today);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM attendance_logs a
       WHERE a.user_id = r.user_id AND a.work_date = r.today AND a.check_in_at IS NOT NULL);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM leave_requests l
       WHERE l.user_id = r.user_id AND l.status = 'approved'
         AND r.today BETWEEN l.start_date AND l.end_date);

    IF emit_notification(
         p_tenant_id   => r.tenant_id,
         p_kind        => 'site_checkin_reminder',
         p_severity    => 'info',
         p_source_type => 'site_check_in',
         p_title       => 'You have not checked in today',
         p_body        => 'Open the app at your site — it checks you in automatically.',
         p_dedupe_key  => 'site_checkin_reminder:' || r.user_id::text || ':' || r.today::text,
         p_user_ids    => ARRAY[r.user_id]
       ) IS NOT NULL THEN
      v_sent := v_sent + 1;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION remind_site_checkin() IS
  'Pushes one reminder per day to each active site engineer with a live project who has no site or office check-in today and is not on approved leave. Deduped per user per local day.';

REVOKE ALL ON FUNCTION remind_site_checkin() FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-site-checkin') THEN
    PERFORM cron.unschedule('remind-site-checkin');
  END IF;
END $$;

-- 04:30 UTC = 10:00 IST. Mon–Sat. pg_cron runs in UTC; the only tenant is IST.
SELECT cron.schedule(
  'remind-site-checkin',
  '30 4 * * 1-6',
  $$SELECT remind_site_checkin()$$
);
