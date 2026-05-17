-- 040_attendance_logs.sql
-- Office attendance: check-in / check-out with GPS validation
-- Radius is stored on tenants.office_geofence_radius_m (default 200m)

BEGIN;

CREATE TABLE IF NOT EXISTS attendance_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date         date        NOT NULL DEFAULT current_date,
  check_in_at       timestamptz,
  check_in_lat      double precision,
  check_in_lng      double precision,
  check_in_within_geofence boolean,
  check_out_at      timestamptz,
  check_out_lat     double precision,
  check_out_lng     double precision,
  check_out_within_geofence boolean,
  -- Computed on check-out (minutes)
  total_minutes     int GENERATED ALWAYS AS (
    CASE
      WHEN check_in_at IS NOT NULL AND check_out_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (check_out_at - check_in_at))::int / 60
      ELSE NULL
    END
  ) STORED,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_attendance_tenant_date ON attendance_logs(tenant_id, work_date DESC);
CREATE INDEX idx_attendance_user_date   ON attendance_logs(user_id, work_date DESC);

CREATE OR REPLACE FUNCTION touch_attendance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_touch_updated
  BEFORE UPDATE ON attendance_logs
  FOR EACH ROW EXECUTE FUNCTION touch_attendance_updated_at();

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Members can insert/update their own row; not delete
CREATE POLICY "member_write_own_attendance"
  ON attendance_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND has_capability('office_attendance:write_own')
  );

CREATE POLICY "member_update_own_attendance"
  ON attendance_logs FOR UPDATE
  USING (
    user_id = auth.uid()
    AND has_capability('office_attendance:write_own')
  )
  WITH CHECK (user_id = auth.uid());

-- Members can read their own attendance
CREATE POLICY "member_read_own_attendance"
  ON attendance_logs FOR SELECT
  USING (user_id = auth.uid());

-- Owner can view all attendance in tenant
CREATE POLICY "owner_view_all_attendance"
  ON attendance_logs FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('office_attendance:view_all')
  );

-- Monthly summary view for owner
CREATE OR REPLACE VIEW v_attendance_monthly AS
SELECT
  al.tenant_id,
  al.user_id,
  u.full_name,
  date_trunc('month', al.work_date)::date AS month,
  COUNT(*) FILTER (WHERE al.check_in_at IS NOT NULL)  AS days_present,
  SUM(al.total_minutes) FILTER (WHERE al.total_minutes IS NOT NULL) AS total_minutes,
  ROUND(
    SUM(al.total_minutes)::numeric / NULLIF(COUNT(*) FILTER (WHERE al.total_minutes IS NOT NULL), 0), 1
  ) AS avg_minutes_per_day
FROM attendance_logs al
JOIN users u ON u.id = al.user_id
GROUP BY al.tenant_id, al.user_id, u.full_name, date_trunc('month', al.work_date)::date;

COMMIT;
