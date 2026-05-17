-- Phase 2 · Material Plan + Material Consumption
-- Review Gate P2: shared mark_original_as_corrected() parametric trigger
-- Review Gate P4: plan consistency trigger (copies name/unit from plan; rejects cross-project)

-- ── Shared parametric correction trigger ─────────────────────────────────
-- Reused by material_consumption, expenses. work_log keeps its own Phase 1 version.
CREATE OR REPLACE FUNCTION mark_original_as_corrected()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_corrects_col text := TG_ARGV[0];
  v_corrects_id  uuid;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_corrects_col) INTO v_corrects_id USING NEW;
  IF v_corrects_id IS NOT NULL THEN
    EXECUTE format('UPDATE %I SET is_corrected = true WHERE id = $1', TG_TABLE_NAME)
      USING v_corrects_id;
  END IF;
  RETURN NEW;
END $$;

-- ── material_plan ─────────────────────────────────────────────────────────
CREATE TABLE material_plan (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_name    text NOT NULL,
  unit             text NOT NULL,
  planned_quantity numeric(12,2) NOT NULL CHECK (planned_quantity > 0),
  planned_for_date date,
  planned_for_week date,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX idx_material_plan_project ON material_plan(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_material_plan_date    ON material_plan(project_id, planned_for_date) WHERE deleted_at IS NULL;

ALTER TABLE material_plan ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_material_plan_set_tenant
  BEFORE INSERT ON material_plan
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- ── material_consumption ──────────────────────────────────────────────────
CREATE TABLE material_consumption (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                        uuid NOT NULL REFERENCES tenants(id),
  project_id                       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_plan_id                 uuid REFERENCES material_plan(id),
  material_name                    text NOT NULL,
  unit                             text NOT NULL,
  quantity_used                    numeric(12,2) NOT NULL CHECK (quantity_used > 0),
  is_excess                        boolean NOT NULL DEFAULT false,
  excess_reason                    text,
  consumed_on                      date NOT NULL DEFAULT current_date,
  recorded_by                      uuid NOT NULL REFERENCES users(id),
  expense_id                       uuid,  -- FK to expenses added in 016
  corrects_material_consumption_id uuid REFERENCES material_consumption(id),
  is_corrected                     boolean NOT NULL DEFAULT false,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  deleted_at                       timestamptz
);

CREATE INDEX idx_mat_consumption_project  ON material_consumption(project_id, consumed_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_mat_consumption_plan     ON material_consumption(material_plan_id) WHERE material_plan_id IS NOT NULL;
CREATE INDEX idx_mat_consumption_corrects ON material_consumption(corrects_material_consumption_id) WHERE corrects_material_consumption_id IS NOT NULL;

ALTER TABLE material_consumption ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_mat_consumption_set_tenant
  BEFORE INSERT ON material_consumption
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- Correction trigger (parametric shared function)
CREATE TRIGGER trg_correct_material_consumption
  AFTER INSERT ON material_consumption
  FOR EACH ROW EXECUTE FUNCTION mark_original_as_corrected('corrects_material_consumption_id');

-- Plan consistency: always copy material_name/unit from plan; reject cross-project links
CREATE OR REPLACE FUNCTION enforce_material_plan_consistency()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_plan material_plan%ROWTYPE;
BEGIN
  IF NEW.material_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_plan FROM material_plan WHERE id = NEW.material_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_plan % not found', NEW.material_plan_id;
  END IF;
  IF v_plan.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'material_plan belongs to a different project';
  END IF;
  -- Always copy from plan to prevent silent name/unit mismatches
  NEW.material_name := v_plan.material_name;
  NEW.unit          := v_plan.unit;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_mat_consumption_plan_consistency
  BEFORE INSERT ON material_consumption
  FOR EACH ROW EXECUTE FUNCTION enforce_material_plan_consistency();

-- Auto-flag excess when total consumed (existing + new) exceeds plan × (1 + threshold%)
-- For corrections: excludes the row being corrected from the running total
CREATE OR REPLACE FUNCTION flag_material_excess()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_threshold  numeric;
  v_planned    numeric;
  v_existing   numeric;
BEGIN
  IF NEW.material_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT planned_quantity INTO v_planned
  FROM   material_plan WHERE id = NEW.material_plan_id;

  SELECT material_excess_threshold_pct INTO v_threshold
  FROM   tenants WHERE id = NEW.tenant_id;
  v_threshold := COALESCE(v_threshold, 15);

  -- Sum existing non-corrected rows, excluding the row this correction replaces
  SELECT COALESCE(SUM(quantity_used), 0)
  INTO   v_existing
  FROM   material_consumption
  WHERE  material_plan_id = NEW.material_plan_id
  AND    is_corrected      = false
  AND    deleted_at        IS NULL
  AND    id IS DISTINCT FROM NEW.corrects_material_consumption_id;

  IF (v_existing + NEW.quantity_used) > v_planned * (1 + v_threshold / 100.0) THEN
    NEW.is_excess := true;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_mat_consumption_flag_excess
  BEFORE INSERT ON material_consumption
  FOR EACH ROW EXECUTE FUNCTION flag_material_excess();
