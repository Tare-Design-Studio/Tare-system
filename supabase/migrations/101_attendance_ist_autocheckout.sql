-- 101: Attendance correctness — IST day boundaries, auto check-out, geofence backfill.
--
-- Three client-reported defects, all in the office attendance path:
--
--   #1 "people aren't being logged out even after logging out — still says
--      clocked in". 13 rows sat with last_check_in_at set on a past work_date.
--   #2 "system should automatically log out everyone at 6.15pm and it comes
--      out as OT". No job existed; an open row also gets overtime_minutes=NULL
--      from stamp_attendance_workday(), so a forgotten check-out earned no OT.
--   #3 "flagged / out of geofence even though check-ins were from the office".
--
-- Root cause shared by #1 and #2 is the timezone. The DB session TimeZone is
-- UTC and the tenant works in IST (UTC+5:30), so:
--
--   * `work_date + workday_end_snapshot` in stamp_attendance_workday() evaluated
--     to 18:00 UTC = 23:30 IST. Overtime only began accruing at half past
--     eleven at night — 1 row of 72 had any OT, and a genuine 18:16 IST
--     check-out recorded 0 minutes instead of 16.
--   * The API's `new Date().toISOString().slice(0,10)` (fixed separately in
--     app/api/attendance/route.ts) took the UTC date, which is still yesterday
--     until 05:30 IST.
--
-- #3 needs no code change: it was already fixed by 093, which introduced the
-- offices table. Every flagged row predates the Mysore office row and every
-- check-in after it is correctly inside the fence. Measured distances on the
-- flagged rows are 5–55m from the office — well inside the 200m radius. What
-- remains is stale data, backfilled below.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT — no COMMIT here.

-- ── Tenant timezone ────────────────────────────────────────────────
--
-- The workday window is a wall-clock concept ("the day ends at six"), so it can
-- only be interpreted against a zone. Storing it per tenant keeps a future
-- second-city tenant correct instead of hardcoding IST in a function body.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';

COMMENT ON COLUMN tenants.timezone IS
  'IANA zone the workday window (workday_start/workday_end) is expressed in. The DB session runs in UTC, so every date+time comparison against a work_date must be resolved through this zone.';

-- Reject a typo'd zone at write time rather than silently falling back to UTC
-- and quietly corrupting overtime for the whole tenant.
DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_timezone_valid
    CHECK (now() AT TIME ZONE timezone IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Overtime / lateness, resolved in the tenant's zone ─────────────
--
-- Same contract as 088 (BEFORE INSERT OR UPDATE, unconditionally overwrites any
-- client-supplied value, columns still REVOKEd from `authenticated`). The only
-- change is that the wall-clock window is now converted from the tenant's zone
-- to an absolute instant before being compared to a timestamptz.
--
-- `(work_date + t)::timestamp AT TIME ZONE zone` reads as: take the naive local
-- wall clock on that date, and tell me the instant it corresponds to in `zone`.
-- That is the correct direction — the reverse would shift by the offset twice.

CREATE OR REPLACE FUNCTION stamp_attendance_workday()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start time;
  v_end   time;
  v_grace int;
  v_tz    text;
  v_eod   timestamptz;
BEGIN
  SELECT workday_start, workday_end, late_grace_minutes, timezone
    INTO v_start, v_end, v_grace, v_tz
    FROM tenants WHERE id = NEW.tenant_id;

  v_tz := COALESCE(v_tz, 'Asia/Kolkata');

  IF NEW.workday_end_snapshot IS NULL THEN
    NEW.workday_end_snapshot := COALESCE(v_end, '18:00'::time);
  END IF;

  IF NEW.check_in_at IS NOT NULL THEN
    NEW.is_late := NEW.check_in_at > (
      ((NEW.work_date + COALESCE(v_start, '09:30'::time))::timestamp
        AT TIME ZONE v_tz)
      + make_interval(mins => COALESCE(v_grace, 15))
    );
  ELSE
    NEW.is_late := NULL;
  END IF;

  -- Unconditional: any client-supplied overtime_minutes is discarded here.
  IF NEW.check_out_at IS NULL THEN
    NEW.overtime_minutes := NULL;
  ELSE
    v_eod := (NEW.work_date + NEW.workday_end_snapshot)::timestamp
               AT TIME ZONE v_tz;
    NEW.overtime_minutes := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NEW.check_out_at - v_eod)) / 60)::int
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ── Auto check-out ─────────────────────────────────────────────────
--
-- Closes cycles still open past the cutoff (workday_end + grace, so 18:15 IST
-- on the default window) and folds the open cycle into accumulated_minutes the
-- same way the check-out API path does.
--
-- ASSUMPTION FLAGGED FOR THE CLIENT: check_out_at is stamped with the ACTUAL
-- time the job runs, not a flat 18:15. Stamping 18:15 would erase real overtime
-- for anyone genuinely still working at 9pm — and, since OT accrues against
-- 18:00, a literal 18:15 stamp would hand everyone exactly 15 minutes and
-- nobody any more, which cannot be the intent. Running every 15 minutes from
-- the cutoff to end of day means a forgotten check-out is closed within 15
-- minutes of the person actually leaving, and their OT reflects that.
--
-- auto_checked_out marks these rows so the owner can tell a real check-out from
-- a system-closed one, and so payroll can question the ones that look wrong.

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS auto_checked_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance_logs.auto_checked_out IS
  'True when close_stale_attendance() closed this row because the member never checked out. The recorded check_out_at is when the job ran, not a real action by the member.';

-- Derived, never client-supplied — same rule as overtime_minutes / is_late.
REVOKE UPDATE (auto_checked_out) ON attendance_logs FROM authenticated;

CREATE OR REPLACE FUNCTION close_stale_attendance()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_closed int := 0;
BEGIN
  WITH cutoffs AS (
    SELECT
      a.id,
      a.last_check_in_at,
      a.accumulated_minutes,
      ((a.work_date
        + COALESCE(a.workday_end_snapshot, t.workday_end, '18:00'::time))::timestamp
        AT TIME ZONE COALESCE(t.timezone, 'Asia/Kolkata'))
        + make_interval(mins => COALESCE(t.late_grace_minutes, 15)) AS cutoff_at
    FROM attendance_logs a
    JOIN tenants t ON t.id = a.tenant_id
    WHERE a.last_check_in_at IS NOT NULL
  ),
  due AS (
    SELECT id, last_check_in_at, accumulated_minutes, cutoff_at
      FROM cutoffs
     WHERE now() >= cutoff_at
  )
  UPDATE attendance_logs a
     SET check_out_at = GREATEST(d.last_check_in_at, d.cutoff_at),
         last_check_in_at = NULL,
         auto_checked_out = true,
         accumulated_minutes = COALESCE(d.accumulated_minutes, 0) + GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (
             GREATEST(d.last_check_in_at, d.cutoff_at) - d.last_check_in_at
           )) / 60)::int
         )
    FROM due d
   WHERE a.id = d.id;

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

COMMENT ON FUNCTION close_stale_attendance() IS
  'Closes attendance cycles left open past the tenant cutoff (workday_end + grace). Stamps the real closing time so genuine overtime survives, and flags the row auto_checked_out. Idempotent — a row with last_check_in_at NULL is never touched again.';

REVOKE ALL ON FUNCTION close_stale_attendance() FROM public, anon, authenticated;

-- Every 15 minutes. Cheap (indexed-ish scan of one partial set of open rows)
-- and bounds how long a forgotten check-out can inflate someone's day.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-stale-attendance') THEN
    PERFORM cron.unschedule('close-stale-attendance');
  END IF;
END $$;

SELECT cron.schedule(
  'close-stale-attendance',
  '*/15 * * * *',
  $$SELECT close_stale_attendance()$$
);

-- ── Backfill #1: the 13 stuck-open rows ────────────────────────────
--
-- These are past days, so the cutoff is long gone and the job above would close
-- them on its next tick anyway. Doing it here makes the fix immediate rather
-- than leaving the client staring at "still clocked in" for another 15 minutes.

SELECT close_stale_attendance();

-- ── Backfill #2: overtime recomputed in IST ────────────────────────
--
-- Every historical row was stamped against 18:00 UTC (23:30 IST), so stored
-- overtime is wrong for the whole table. Touching workday_end_snapshot re-fires
-- the corrected trigger, which recomputes overtime_minutes and is_late — the
-- same re-stamp technique 088 used for its own backfill.

UPDATE attendance_logs
   SET workday_end_snapshot = workday_end_snapshot
 WHERE check_out_at IS NOT NULL
    OR check_in_at IS NOT NULL;

-- ── Backfill #3: the false out-of-geofence flags ───────────────────
--
-- Rows written before their office existed in `offices` were flagged false with
-- a NULL office. Re-evaluate those against the offices that exist now, matching
-- the API's rule exactly: nearest active office whose own radius contains the
-- point.
--
-- Scoped deliberately narrowly. Only rows with coordinates, only rows currently
-- flagged false with no office attached, and only where a match is actually
-- found — a genuinely remote check-in has no match and keeps its false flag.
-- Nothing that was correctly recorded is rewritten.

WITH matched AS (
  SELECT DISTINCT ON (a.id)
         a.id,
         o.id AS office_id
    FROM attendance_logs a
    JOIN offices o
      ON o.tenant_id = a.tenant_id
     AND o.is_active
     AND (
       6371000 * 2 * atan2(
         sqrt(
           sin(radians(o.lat - a.check_in_lat) / 2) ^ 2
           + cos(radians(a.check_in_lat)) * cos(radians(o.lat))
             * sin(radians(o.lng - a.check_in_lng) / 2) ^ 2
         ),
         sqrt(
           1 - (
             sin(radians(o.lat - a.check_in_lat) / 2) ^ 2
             + cos(radians(a.check_in_lat)) * cos(radians(o.lat))
               * sin(radians(o.lng - a.check_in_lng) / 2) ^ 2
           )
         )
       )
     ) <= o.geofence_radius_m
   WHERE a.check_in_lat IS NOT NULL
     AND a.check_in_lng IS NOT NULL
     AND a.check_in_within_geofence IS DISTINCT FROM true
     AND a.check_in_office_id IS NULL
   ORDER BY a.id,
     (
       6371000 * 2 * atan2(
         sqrt(
           sin(radians(o.lat - a.check_in_lat) / 2) ^ 2
           + cos(radians(a.check_in_lat)) * cos(radians(o.lat))
             * sin(radians(o.lng - a.check_in_lng) / 2) ^ 2
         ),
         sqrt(
           1 - (
             sin(radians(o.lat - a.check_in_lat) / 2) ^ 2
             + cos(radians(a.check_in_lat)) * cos(radians(o.lat))
               * sin(radians(o.lng - a.check_in_lng) / 2) ^ 2
           )
         )
       )
     ) ASC
)
UPDATE attendance_logs a
   SET check_in_within_geofence = true,
       check_in_office_id = m.office_id
  FROM matched m
 WHERE a.id = m.id;

-- Same treatment for the check-out side, which has its own flag and office.
WITH matched AS (
  SELECT DISTINCT ON (a.id)
         a.id,
         o.id AS office_id
    FROM attendance_logs a
    JOIN offices o
      ON o.tenant_id = a.tenant_id
     AND o.is_active
     AND (
       6371000 * 2 * atan2(
         sqrt(
           sin(radians(o.lat - a.check_out_lat) / 2) ^ 2
           + cos(radians(a.check_out_lat)) * cos(radians(o.lat))
             * sin(radians(o.lng - a.check_out_lng) / 2) ^ 2
         ),
         sqrt(
           1 - (
             sin(radians(o.lat - a.check_out_lat) / 2) ^ 2
             + cos(radians(a.check_out_lat)) * cos(radians(o.lat))
               * sin(radians(o.lng - a.check_out_lng) / 2) ^ 2
           )
         )
       )
     ) <= o.geofence_radius_m
   WHERE a.check_out_lat IS NOT NULL
     AND a.check_out_lng IS NOT NULL
     AND a.check_out_within_geofence IS DISTINCT FROM true
     AND a.check_out_office_id IS NULL
   ORDER BY a.id,
     (
       6371000 * 2 * atan2(
         sqrt(
           sin(radians(o.lat - a.check_out_lat) / 2) ^ 2
           + cos(radians(a.check_out_lat)) * cos(radians(o.lat))
             * sin(radians(o.lng - a.check_out_lng) / 2) ^ 2
         ),
         sqrt(
           1 - (
             sin(radians(o.lat - a.check_out_lat) / 2) ^ 2
             + cos(radians(a.check_out_lat)) * cos(radians(o.lat))
               * sin(radians(o.lng - a.check_out_lng) / 2) ^ 2
           )
         )
       )
     ) ASC
)
UPDATE attendance_logs a
   SET check_out_within_geofence = true,
       check_out_office_id = m.office_id
  FROM matched m
 WHERE a.id = m.id;
