-- 060: Attendance re-check-in support
-- Team members can log attendance again on the same day. One row per day stays;
-- the row keeps the FIRST check-in and the LAST check-out, and tracks how many
-- times the member checked in via check_in_count.

ALTER TABLE attendance_logs
  ADD COLUMN check_in_count int NOT NULL DEFAULT 1;
