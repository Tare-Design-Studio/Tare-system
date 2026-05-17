-- Phase 2 · Site Check-Ins
-- Review Gate P1: gps_retained_until date column for GPS nulling cron
-- Review Gate P5: within_geofence stored boolean (computed server-side by API, not DB trigger)
-- gps_lat/gps_lng are nullable in DB (cron nulls them after retention); API enforces NOT NULL at insert via Zod

CREATE TABLE site_check_ins (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  user_id                 uuid NOT NULL REFERENCES users(id),
  project_id              uuid NOT NULL REFERENCES projects(id),
  checked_in_at           timestamptz NOT NULL DEFAULT now(),
  gps_lat                 numeric(9,6),    -- nulled by cron after gps_retained_until
  gps_lng                 numeric(9,6),    -- nulled by cron after gps_retained_until
  within_geofence         boolean NOT NULL, -- set by API via Haversine before INSERT
  geofence_failure_reason text,            -- set when within_geofence = false
  approved_by             uuid REFERENCES users(id),
  approved_at             timestamptz,
  notes                   text,
  gps_retained_until      date NOT NULL DEFAULT (current_date + interval '30 days')
);

CREATE INDEX idx_site_checkin_project_time ON site_check_ins(project_id, checked_in_at DESC);
CREATE INDEX idx_site_checkin_user         ON site_check_ins(user_id, checked_in_at DESC);
CREATE INDEX idx_site_checkin_tenant_date  ON site_check_ins(tenant_id, checked_in_at DESC);
-- partial index for "out of geofence" queries (Owner review queue)
CREATE INDEX idx_site_checkin_out_of_fence ON site_check_ins(tenant_id, checked_in_at DESC)
  WHERE within_geofence = false AND approved_by IS NULL;

ALTER TABLE site_check_ins ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_site_checkin_set_tenant
  BEFORE INSERT ON site_check_ins
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- ── GPS nulling extension to pg_cron job (add to 009_phase0_cron.sql pattern)
-- The cron job in 009 handles keep-alive. GPS nulling can reuse the same cron schedule.
-- Add this to the cron job or create a separate one:
--
--   SELECT cron.schedule(
--     'gps-null-expired',
--     '0 2 * * *',   -- 2 AM daily
--     $$
--       UPDATE site_check_ins
--         SET gps_lat = NULL, gps_lng = NULL
--       WHERE gps_retained_until < current_date
--         AND (gps_lat IS NOT NULL OR gps_lng IS NOT NULL);
--     $$
--   );
--
-- Not executed here as pg_cron may not be enabled yet in the migration runner.
