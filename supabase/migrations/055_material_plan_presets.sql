-- Phase 10 · Material Plan Presets
-- Owner / PM creates reusable material plan templates.
-- When applied to a project, creates material_plan rows (material_name, unit, planned_quantity).

-- ── material_plan_presets ─────────────────────────────────────────────
CREATE TABLE material_plan_presets (
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

CREATE INDEX idx_material_plan_presets_tenant
  ON material_plan_presets(tenant_id) WHERE deleted_at IS NULL;

ALTER TABLE material_plan_presets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_material_plan_presets_touch
  BEFORE UPDATE ON material_plan_presets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- tenant_id populated from auth.uid() when NULL (mirrors 051 payment-preset fix)
CREATE TRIGGER trg_material_plan_presets_set_tenant
  BEFORE INSERT ON material_plan_presets
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_creating_user();

-- RLS: read + write gated by materials:plan
CREATE POLICY material_plan_presets_select ON material_plan_presets
  FOR SELECT TO authenticated
  USING (has_capability('materials:plan'));

CREATE POLICY material_plan_presets_insert ON material_plan_presets
  FOR INSERT TO authenticated
  WITH CHECK (has_capability('materials:plan'));

CREATE POLICY material_plan_presets_update ON material_plan_presets
  FOR UPDATE TO authenticated
  USING (has_capability('materials:plan'));

CREATE POLICY material_plan_presets_delete ON material_plan_presets
  FOR DELETE TO authenticated
  USING (has_capability('materials:plan') AND is_system = false);

-- ── material_plan_preset_items ────────────────────────────────────────
CREATE TABLE material_plan_preset_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id         uuid NOT NULL REFERENCES material_plan_presets(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  material_name     text NOT NULL,
  unit              text NOT NULL,
  planned_quantity  numeric(12,2) NOT NULL CHECK (planned_quantity > 0),
  sequence_order    int NOT NULL,
  UNIQUE (preset_id, sequence_order)
);

CREATE INDEX idx_material_plan_preset_items_preset
  ON material_plan_preset_items(preset_id);

ALTER TABLE material_plan_preset_items ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for preset items
CREATE OR REPLACE FUNCTION set_tenant_from_material_plan_preset()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM material_plan_presets WHERE id = NEW.preset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'material_plan_preset % not found', NEW.preset_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_material_plan_preset_items_set_tenant
  BEFORE INSERT ON material_plan_preset_items
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_material_plan_preset();

-- RLS mirrors parent
CREATE POLICY material_plan_preset_items_select ON material_plan_preset_items
  FOR SELECT TO authenticated
  USING (has_capability('materials:plan'));

CREATE POLICY material_plan_preset_items_insert ON material_plan_preset_items
  FOR INSERT TO authenticated
  WITH CHECK (has_capability('materials:plan'));

CREATE POLICY material_plan_preset_items_update ON material_plan_preset_items
  FOR UPDATE TO authenticated
  USING (has_capability('materials:plan'));

CREATE POLICY material_plan_preset_items_delete ON material_plan_preset_items
  FOR DELETE TO authenticated
  USING (has_capability('materials:plan'));

-- ── Data API grants (Supabase no longer auto-exposes new tables) ──────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_plan_presets      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_plan_presets      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_plan_preset_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE material_plan_preset_items TO service_role;
