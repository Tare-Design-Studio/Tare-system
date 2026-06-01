-- 068: Attendance — accumulate worked minutes across multiple check-in/out cycles
--      + grant site engineers office attendance.
--
-- The existing total_minutes is GENERATED from first check-in → last check-out,
-- so multiple cycles in a day (with breaks) over-count and a re-check-in could
-- never be checked out again. We add:
--   accumulated_minutes — running sum of each CLOSED cycle (check_out − check_in)
--   last_check_in_at    — start of the currently-open cycle (NULL when checked out)
-- The app increments accumulated_minutes on every check-out.
--
-- Site engineers were never granted office_attendance:write_own, so they could
-- not use the office check-in/out. Grant it to existing site engineers; new ones
-- get it from SITE_ENGINEER_CAPABILITIES in lib/auth/capabilities.ts.

BEGIN;

ALTER TABLE attendance_logs
  ADD COLUMN accumulated_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN last_check_in_at    timestamptz;

-- Backfill: existing single-cycle rows — seed accumulated from the generated total
-- and clear last_check_in_at (those rows are treated as closed/complete).
UPDATE attendance_logs
  SET accumulated_minutes = COALESCE(total_minutes, 0);

-- Grant office attendance to existing site engineers.
-- scope_project_id is NULL here; UNIQUE treats NULLs as distinct, so guard with NOT EXISTS.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT u.tenant_id, u.id, 'office_attendance:write_own', true, 'manual'
FROM users u
WHERE u.role = 'site_engineer'
  AND NOT EXISTS (
    SELECT 1 FROM user_capabilities c
    WHERE c.user_id = u.id
      AND c.capability = 'office_attendance:write_own'
      AND c.scope_project_id IS NULL
  );

COMMIT;
