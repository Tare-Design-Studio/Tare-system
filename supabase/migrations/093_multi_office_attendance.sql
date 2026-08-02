-- 093: Multiple office locations (Mysore, Bangalore, …) for attendance check-in.
--
-- Before this, the office lived in three columns on `tenants`:
--   office_lat, office_lng, office_geofence_radius_m
-- One studio, one office. The client now works out of more than one office and a
-- member should be able to check in at whichever one they are standing in.
--
-- Approach: a proper `offices` table, and the check-in path resolves which
-- office the member is inside by distance rather than being told. The member
-- does not pick from a dropdown — picking is how you get people checking in at
-- an office they are not at.
--
-- The three `tenants` columns are LEFT IN PLACE, deliberately:
--   * dropping them would break any read still pointed at them,
--   * migration 069 (demo seed) writes them,
--   * the existing value is real data whose city is unconfirmed.
-- They are no longer read by the attendance path. Marked deprecated in SCHEMA.md.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS offices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  address           text,
  lat               double precision NOT NULL,
  lng               double precision NOT NULL,
  geofence_radius_m int         NOT NULL DEFAULT 200
                                CHECK (geofence_radius_m BETWEEN 50 AND 5000),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Two offices in one studio cannot share a name; the name is what shows up on
  -- the attendance record and in the owner's reports.
  UNIQUE (tenant_id, name),
  CHECK (lat BETWEEN -90 AND 90),
  CHECK (lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_offices_tenant ON offices(tenant_id) WHERE is_active;

CREATE TRIGGER offices_touch_updated
  BEFORE UPDATE ON offices
  FOR EACH ROW EXECUTE FUNCTION touch_attendance_updated_at();

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

-- Every member needs to read the office list: the check-in screen shows which
-- office it matched them to, and the presence board labels people by office.
CREATE POLICY offices_read_own_tenant ON offices
  FOR SELECT USING (tenant_id = current_user_tenant_id());

-- Only someone who can configure attendance may add or move an office.
-- Moving an office moves the geofence, which decides who is marked absent, so
-- this reuses the existing office_attendance:configure capability rather than
-- inventing a new one.
CREATE POLICY offices_write_settings_cap ON offices
  FOR ALL
  USING (tenant_id = current_user_tenant_id() AND has_capability('office_attendance:configure'))
  WITH CHECK (tenant_id = current_user_tenant_id() AND has_capability('office_attendance:configure'));

GRANT SELECT ON offices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON offices TO authenticated;
GRANT ALL ON offices TO service_role;

-- Which office did this attendance row happen at. NULL = matched no office
-- (working remote, or on site). Kept nullable on purpose: an out-of-geofence
-- check-in is still a real check-in and must not be rejected.
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS check_in_office_id  uuid REFERENCES offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_out_office_id uuid REFERENCES offices(id) ON DELETE SET NULL;

-- 092 replaced the table-wide UPDATE grant with a column list. These two new
-- columns are written by the app on check-in/check-out, so they must be added
-- to that list or every check-in fails with a permission error.
GRANT UPDATE (check_in_office_id, check_out_office_id) ON attendance_logs TO authenticated;

-- Carry the existing single office across so attendance keeps working from the
-- moment this migration lands. The city of these coordinates is unconfirmed
-- (they sit well south of Bangalore), so the name says exactly that rather than
-- guessing — the owner renames it in Settings once confirmed.
INSERT INTO offices (tenant_id, name, lat, lng, geofence_radius_m)
SELECT t.id,
       'Main office (confirm location)',
       t.office_lat,
       t.office_lng,
       COALESCE(t.office_geofence_radius_m, 200)
FROM tenants t
WHERE t.office_lat IS NOT NULL
  AND t.office_lng IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM offices o WHERE o.tenant_id = t.id);

-- Nearest active office within its own radius, for a given point.
-- Radius is per-office, so "nearest" alone is not enough — a point can be
-- nearest to office A while only actually being inside office B's larger
-- geofence. Rank by distance among offices whose radius actually contains the
-- point.
CREATE OR REPLACE FUNCTION resolve_office_at(
  p_tenant_id uuid,
  p_lat       double precision,
  p_lng       double precision
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM offices o
  WHERE o.tenant_id = p_tenant_id
    AND o.is_active
    AND p_lat IS NOT NULL
    AND p_lng IS NOT NULL
    AND (
      6371000 * 2 * atan2(
        sqrt(
          sin(radians(p_lat - o.lat) / 2) ^ 2 +
          cos(radians(o.lat)) * cos(radians(p_lat)) *
          sin(radians(p_lng - o.lng) / 2) ^ 2
        ),
        sqrt(
          1 - (
            sin(radians(p_lat - o.lat) / 2) ^ 2 +
            cos(radians(o.lat)) * cos(radians(p_lat)) *
            sin(radians(p_lng - o.lng) / 2) ^ 2
          )
        )
      )
    ) <= o.geofence_radius_m
  ORDER BY (
    6371000 * 2 * atan2(
      sqrt(
        sin(radians(p_lat - o.lat) / 2) ^ 2 +
        cos(radians(o.lat)) * cos(radians(p_lat)) *
        sin(radians(p_lng - o.lng) / 2) ^ 2
      ),
      sqrt(
        1 - (
          sin(radians(p_lat - o.lat) / 2) ^ 2 +
          cos(radians(o.lat)) * cos(radians(p_lat)) *
          sin(radians(p_lng - o.lng) / 2) ^ 2
        )
      )
    )
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_office_at(uuid, double precision, double precision) FROM public;
GRANT EXECUTE ON FUNCTION resolve_office_at(uuid, double precision, double precision) TO authenticated, service_role;
