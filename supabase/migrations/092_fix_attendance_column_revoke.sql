-- 092: Make the attendance derived-column REVOKE from 088 actually bite.
--
-- 088 ran:
--   REVOKE UPDATE (overtime_minutes, is_late, workday_end_snapshot)
--     ON attendance_logs FROM authenticated;
--
-- which silently did nothing. An earlier migration had already granted
-- table-level `UPDATE ON attendance_logs TO authenticated`, and in Postgres a
-- table-level UPDATE grant is a distinct privilege from a column-level one —
-- revoking specific columns does not carve a hole in it. `authenticated` kept
-- UPDATE on every column, including the three derived ones.
--
-- Not exploitable: stamp_attendance_workday() is a BEFORE INSERT OR UPDATE
-- trigger that overwrites all three unconditionally, verified by writing 9999
-- into overtime_minutes and reading back the recomputed value. But 088 and
-- SCHEMA.md both claim a second layer of defence that was not present, and a
-- claimed control that does not exist is worse than an absent one.
--
-- Fix: drop the table-wide UPDATE grant and re-grant UPDATE column by column,
-- omitting the three derived columns. The app writes check-in/check-out times
-- and GPS; it never needs to write the derived values.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

REVOKE UPDATE ON attendance_logs FROM authenticated;

GRANT UPDATE (
  check_in_at,
  check_in_lat,
  check_in_lng,
  check_in_within_geofence,
  check_out_at,
  check_out_lat,
  check_out_lng,
  check_out_within_geofence,
  check_in_count,
  accumulated_minutes,
  last_check_in_at,
  work_date,
  updated_at
) ON attendance_logs TO authenticated;

-- service_role keeps full table access for the cron jobs and admin scripts.
GRANT UPDATE ON attendance_logs TO service_role;
