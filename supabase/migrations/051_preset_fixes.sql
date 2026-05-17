-- Phase 10 · Preset fixes
-- 1. payment_milestone_presets had no tenant_id trigger → INSERT violated NOT NULL.
-- 2. service_role lacked table privileges on table_preset_* child tables
--    (granted to service_role only in 999_zz, which is not yet applied) →
--    table preset column/section/row routes (service client) failed silently.

-- ── 1. Denormalize tenant_id onto payment_milestone_presets ────────────
-- Tenant comes from the creating user. Mirrors set_tenant_from_user().
CREATE OR REPLACE FUNCTION set_tenant_from_creating_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'cannot resolve tenant_id for current user';
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_presets_set_tenant
  BEFORE INSERT ON payment_milestone_presets
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_creating_user();

-- ── 2. service_role privileges on table preset child tables ────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_presets        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_columns  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_sections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_rows     TO service_role;
