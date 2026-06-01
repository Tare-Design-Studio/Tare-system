-- 070: Site check-in → check-out + per-site worked hours.
--
-- site_check_ins was insert-only (one row per arrival). To track how long a site
-- engineer spends on each site we close each check-in with a check-out:
--   checked_out_at   — when the engineer left (NULL = currently on site / open).
--   duration_minutes — (checked_out_at − checked_in_at) in whole minutes, set on
--                      check-out. NULL while the session is open.
-- Per-site worked time = SUM(duration_minutes) over a project; an engineer's day
-- is "present" at a site if they have any check-in that day, "absent" (leave) if
-- none. This mirrors the office attendance check-in/out flow.

BEGIN;

ALTER TABLE site_check_ins
  ADD COLUMN checked_out_at   timestamptz,
  ADD COLUMN duration_minutes int;

-- Backfill: every pre-existing check-in (inserted before check-out existed) is
-- treated as a closed 8-hour session. This also guarantees no two existing rows
-- share an open session, so the partial unique index below can be created, and
-- nobody is left "stuck on site" indefinitely.
UPDATE site_check_ins
  SET checked_out_at   = checked_in_at + interval '8 hours',
      duration_minutes = 480
  WHERE checked_out_at IS NULL;

-- One open session per user per project at a time (partial unique index).
CREATE UNIQUE INDEX idx_site_checkin_open_session
  ON site_check_ins(user_id, project_id)
  WHERE checked_out_at IS NULL;

COMMIT;
