-- Phase 0 · Tenants

CREATE TABLE tenants (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  slug                        text NOT NULL UNIQUE,

  -- Variance & thresholds
  variance_threshold_pct      numeric(5,2) NOT NULL DEFAULT 25,
  material_excess_threshold_pct numeric(5,2) NOT NULL DEFAULT 15,

  -- Retention
  soft_delete_retention_days  int NOT NULL DEFAULT 60,
  gps_retention_days          int NOT NULL DEFAULT 30,
  completed_reminders_visible boolean NOT NULL DEFAULT false,

  -- Office geofence (Team Member check-in)
  office_lat                  double precision,
  office_lng                  double precision,
  office_geofence_radius_m    int NOT NULL DEFAULT 200,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Single-tenant: RLS not needed on this table (service role manages it)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
