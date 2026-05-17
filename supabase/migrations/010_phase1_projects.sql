-- Phase 1 · Projects, Work Log, Assignments
-- Review Gate approvals applied:
--   1. project_type: ADD 'urban' to existing enum (cannot drop 'landscape' — Postgres restriction)
--   2. user_capabilities.scope_project_id FK added now that projects table exists
--   3. site_lat / site_lng / site_geofence_radius_m on projects (F4 locked decision)
--   4. on_hold_reason enforcement trigger
--   5. Slug auto-generation trigger

-- ── Extend project_type enum to include 'urban' ──────────────────────
ALTER TYPE project_type ADD VALUE IF NOT EXISTS 'urban';

-- ── projects ─────────────────────────────────────────────────────────
CREATE TABLE projects (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid NOT NULL REFERENCES tenants(id),
  name                            text NOT NULL,
  slug                            text NOT NULL,
  customer_id                     uuid,              -- FK added after customers table (Phase 4)
  project_type                    project_type,
  current_stage                   project_stage NOT NULL DEFAULT 'design',
  stage_changed_at                timestamptz,
  stage_changed_by                uuid REFERENCES users(id),
  site_location                   text,
  -- F4: GPS-based geofence for site check-in validation (Phase 2)
  site_lat                        numeric(9,6),
  site_lng                        numeric(9,6),
  site_geofence_radius_m          int CHECK (site_geofence_radius_m BETWEEN 50 AND 2000) DEFAULT 250,
  status                          project_status NOT NULL DEFAULT 'planning',
  on_hold_reason                  text,
  budget_total                    numeric(14,2),
  estimated_work_hours            int,
  estimated_duration_days         int,
  start_date                      date,
  expected_end_date               date,
  actual_start_date               date,
  actual_end_date                 date,
  customer_portal_hash            text UNIQUE,
  customer_portal_hash_generated_at timestamptz,
  customer_portal_enabled         boolean DEFAULT false,
  drive_folder_url                text,
  share_drive_with_customer       boolean DEFAULT false,
  -- Migration aid: placeholder name pending Owner rename
  is_placeholder                  boolean DEFAULT false,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid REFERENCES users(id),
  updated_by                      uuid REFERENCES users(id),
  deleted_at                      timestamptz,
  UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_projects_tenant        ON projects(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status        ON projects(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_portal_hash   ON projects(customer_portal_hash) WHERE customer_portal_hash IS NOT NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ── Slug auto-generation ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_project_slug()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_base  text;
  v_slug  text;
  v_count int := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  -- Lowercase, replace non-alphanumeric runs with hyphens, trim
  v_base := regexp_replace(
    regexp_replace(lower(trim(NEW.name)), '[^a-z0-9]+', '-', 'g'),
    '^-|-$', '', 'g'
  );

  -- Ensure uniqueness within tenant
  LOOP
    v_slug := CASE WHEN v_count = 0 THEN v_base
                   ELSE v_base || '-' || substring(md5(random()::text), 1, 4)
              END;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM projects WHERE tenant_id = NEW.tenant_id AND slug = v_slug
    );
    v_count := v_count + 1;
    IF v_count > 20 THEN
      RAISE EXCEPTION 'Could not generate unique slug for project name "%"', NEW.name;
    END IF;
  END LOOP;

  NEW.slug := v_slug;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_slug
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION generate_project_slug();

-- ── on_hold_reason enforcement ────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_on_hold_reason()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'on_hold' AND (NEW.on_hold_reason IS NULL OR trim(NEW.on_hold_reason) = '') THEN
    RAISE EXCEPTION 'on_hold_reason is required when status is on_hold';
  END IF;
  -- Clear reason when leaving on_hold
  IF OLD.status = 'on_hold' AND NEW.status <> 'on_hold' THEN
    NEW.on_hold_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_on_hold_reason
  BEFORE INSERT OR UPDATE OF status, on_hold_reason ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_on_hold_reason();

-- ── updated_at ────────────────────────────────────────────────────────
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Retrospectively add FK for user_capabilities.scope_project_id ─────
-- (deferred from Phase 0 because projects table did not exist yet)
ALTER TABLE user_capabilities
  ADD CONSTRAINT fk_user_capabilities_project
  FOREIGN KEY (scope_project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- ── work_log ──────────────────────────────────────────────────────────
-- tenant_id denormalized via set_tenant_from_project() trigger.
CREATE TABLE work_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  hours                 numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  worked_on             date NOT NULL DEFAULT CURRENT_DATE,
  notes                 text,
  -- Append-only correction pattern: insert a new row referencing the original.
  -- A trigger flips the original's is_corrected = true when corrects_work_log_id is set.
  corrects_work_log_id  uuid REFERENCES work_log(id),
  is_corrected          boolean DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES users(id),
  deleted_at            timestamptz
);

CREATE INDEX idx_work_log_project_date ON work_log(project_id, worked_on);
CREATE INDEX idx_work_log_corrects     ON work_log(corrects_work_log_id) WHERE corrects_work_log_id IS NOT NULL;
CREATE INDEX idx_work_log_user         ON work_log(user_id, worked_on);

ALTER TABLE work_log ENABLE ROW LEVEL SECURITY;

-- Trigger: when a correction row is inserted, mark the original as corrected.
CREATE OR REPLACE FUNCTION mark_work_log_corrected()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.corrects_work_log_id IS NOT NULL THEN
    UPDATE work_log SET is_corrected = true WHERE id = NEW.corrects_work_log_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_log_mark_corrected
  AFTER INSERT ON work_log
  FOR EACH ROW EXECUTE FUNCTION mark_work_log_corrected();

-- Tenant denormalization for work_log
CREATE TRIGGER trg_work_log_set_tenant
  BEFORE INSERT ON work_log
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- ── v_project_variance ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_project_variance AS
SELECT
  p.id AS project_id,
  p.tenant_id,
  p.estimated_work_hours,
  COALESCE((
    SELECT SUM(hours) FROM work_log wl
    WHERE wl.project_id = p.id AND wl.is_corrected = false AND wl.deleted_at IS NULL
  ), 0) AS actual_hours,
  CASE
    WHEN p.estimated_work_hours IS NULL OR p.estimated_work_hours = 0 THEN NULL
    ELSE ROUND(
      (COALESCE((
        SELECT SUM(hours) FROM work_log wl
        WHERE wl.project_id = p.id AND wl.is_corrected = false AND wl.deleted_at IS NULL
      ), 0) - p.estimated_work_hours) * 100.0 / p.estimated_work_hours, 2)
  END AS hours_variance_pct,
  p.estimated_duration_days,
  CASE
    WHEN p.actual_end_date IS NOT NULL AND p.actual_start_date IS NOT NULL
      THEN p.actual_end_date - p.actual_start_date
    WHEN p.actual_start_date IS NOT NULL
      THEN CURRENT_DATE - p.actual_start_date
    ELSE NULL
  END AS actual_duration_days
FROM projects p
WHERE p.deleted_at IS NULL;

-- ── project_assignments ───────────────────────────────────────────────
CREATE TABLE project_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_on_project   text NOT NULL CHECK (role_on_project IN (
    'pm', 'site_engineer', 'team_member',
    'lead_architect', 'design_support', 'drafting', 'coordination'
  )),
  contribution_pct  numeric(5,2) CHECK (contribution_pct BETWEEN 0 AND 100),
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  assigned_by       uuid REFERENCES users(id),
  UNIQUE (project_id, user_id, role_on_project)
);

CREATE INDEX idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX idx_project_assignments_user    ON project_assignments(user_id);

ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for project_assignments
CREATE TRIGGER trg_project_assignments_set_tenant
  BEFORE INSERT ON project_assignments
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- Per-project contribution_pct sum must not exceed 100%.
CREATE OR REPLACE FUNCTION check_contribution_sum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_total numeric;
BEGIN
  IF NEW.contribution_pct IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(contribution_pct), 0) INTO v_total
    FROM project_assignments
   WHERE project_id = NEW.project_id
     AND id IS DISTINCT FROM NEW.id;  -- exclude self on UPDATE

  IF v_total + NEW.contribution_pct > 100 THEN
    RAISE EXCEPTION
  'Total contribution_pct for project % would exceed 100%% (current sum: %, adding: %)',
  NEW.project_id, v_total, NEW.contribution_pct;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_contribution_sum
  BEFORE INSERT OR UPDATE OF contribution_pct ON project_assignments
  FOR EACH ROW EXECUTE FUNCTION check_contribution_sum();
