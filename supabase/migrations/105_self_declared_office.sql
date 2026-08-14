-- 105_self_declared_office.sql
-- Let a member name their office when GPS cannot resolve it.
--
-- Problem: 093 resolves the office by distance, and app/api/attendance/route.ts
-- only attempts that when lat/lng are present. A member who denied location, or
-- whose fix timed out, gets check_in_office_id = NULL — and the presence board
-- then shows a bare "At work" with no office. On this tenant that is ~70% of
-- rows, which is why the Mysore/Bangalore split reads as inconsistent: it is not
-- a display bug, the office was never captured.
--
-- Fix: when GPS is unavailable the client asks the member which office they are
-- at and sends office_id. That is a claim, not a measurement, so it is recorded
-- in the same column but flagged — otherwise a self-declared office would be
-- indistinguishable from a geofence-verified one and the flag on the row
-- (check_in_within_geofence) would be the only hint, which reads as "outside the
-- fence" rather than "we never knew".
--
-- Existing NULL rows are deliberately left alone: there is no evidence of which
-- office those check-ins happened at, and guessing would write an assumption
-- into attendance history as though it were recorded fact.
--
-- Rollback: ALTER TABLE attendance_logs
--   DROP COLUMN check_in_office_self_declared,
--   DROP COLUMN check_out_office_self_declared;

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS check_in_office_self_declared  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_out_office_self_declared boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance_logs.check_in_office_self_declared IS
  'True when check_in_office_id came from the member picking an office because GPS was unavailable, rather than from a geofence match. Payroll and the presence board should treat it as unverified.';

COMMENT ON COLUMN attendance_logs.check_out_office_self_declared IS
  'As check_in_office_self_declared, for the check-out leg.';

-- Same rule as every other derived attendance column (088/093/101): the client
-- may not stamp these directly. The API route sets them with the service client
-- alongside the office id it accepted, so a member cannot mark their own
-- self-declared check-in as geofence-verified.
REVOKE UPDATE (check_in_office_self_declared, check_out_office_self_declared)
  ON attendance_logs FROM authenticated;
