-- Phase 10 · Payment Milestone Presets
-- Owner creates reusable payment milestone templates.
-- When applied to a project, creates payment_schedule rows by percentage × budget_total.

-- ── payment_milestone_presets ─────────────────────────────────────────
CREATE TABLE payment_milestone_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  name        text NOT NULL,
  is_system   boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_payment_presets_tenant
  ON payment_milestone_presets(tenant_id) WHERE deleted_at IS NULL;

ALTER TABLE payment_milestone_presets ENABLE ROW LEVEL SECURITY;

-- Touch updated_at
CREATE TRIGGER trg_payment_presets_touch
  BEFORE UPDATE ON payment_milestone_presets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: read via customer_payments:view, write via customer_payments:create_schedule
CREATE POLICY payment_presets_select ON payment_milestone_presets
  FOR SELECT TO authenticated
  USING (has_capability('customer_payments:view'));

CREATE POLICY payment_presets_insert ON payment_milestone_presets
  FOR INSERT TO authenticated
  WITH CHECK (has_capability('customer_payments:create_schedule'));

CREATE POLICY payment_presets_update ON payment_milestone_presets
  FOR UPDATE TO authenticated
  USING (has_capability('customer_payments:create_schedule'));

CREATE POLICY payment_presets_delete ON payment_milestone_presets
  FOR DELETE TO authenticated
  USING (has_capability('customer_payments:create_schedule') AND is_system = false);

-- ── payment_milestone_preset_items ────────────────────────────────────
CREATE TABLE payment_milestone_preset_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id       uuid NOT NULL REFERENCES payment_milestone_presets(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  milestone_name  text NOT NULL,
  percentage      numeric(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  sequence_order  int NOT NULL,
  notes           text,
  UNIQUE (preset_id, sequence_order)
);

CREATE INDEX idx_payment_preset_items_preset
  ON payment_milestone_preset_items(preset_id);

ALTER TABLE payment_milestone_preset_items ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for preset items
CREATE OR REPLACE FUNCTION set_tenant_from_payment_preset()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM payment_milestone_presets WHERE id = NEW.preset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_milestone_preset % not found', NEW.preset_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_preset_items_set_tenant
  BEFORE INSERT ON payment_milestone_preset_items
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_payment_preset();

-- RLS mirrors parent
CREATE POLICY payment_preset_items_select ON payment_milestone_preset_items
  FOR SELECT TO authenticated
  USING (has_capability('customer_payments:view'));

CREATE POLICY payment_preset_items_insert ON payment_milestone_preset_items
  FOR INSERT TO authenticated
  WITH CHECK (has_capability('customer_payments:create_schedule'));

CREATE POLICY payment_preset_items_update ON payment_milestone_preset_items
  FOR UPDATE TO authenticated
  USING (has_capability('customer_payments:create_schedule'));

CREATE POLICY payment_preset_items_delete ON payment_milestone_preset_items
  FOR DELETE TO authenticated
  USING (has_capability('customer_payments:create_schedule'));

-- ── FK on projects for source preset tracking ─────────────────────────
ALTER TABLE projects
  ADD COLUMN source_payment_preset_id uuid NULL
  REFERENCES payment_milestone_presets(id) ON DELETE SET NULL;
