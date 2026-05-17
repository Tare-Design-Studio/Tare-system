-- Phase 10 · Multiple phones per enquiry + enquiry soft delete

-- ── enquiry_phones ────────────────────────────────────────────────────
CREATE TABLE enquiry_phones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  enquiry_id  uuid NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  label       text NULL,
  is_primary  boolean DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiry_phones_enquiry ON enquiry_phones(enquiry_id);

ALTER TABLE enquiry_phones ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization
CREATE OR REPLACE FUNCTION set_tenant_from_enquiry()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM enquiries WHERE id = NEW.enquiry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enquiry % not found', NEW.enquiry_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enquiry_phones_set_tenant
  BEFORE INSERT ON enquiry_phones
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_enquiry();

-- RLS mirrors enquiries
CREATE POLICY enquiry_phones_select ON enquiry_phones
  FOR SELECT TO authenticated
  USING (has_capability('enquiry:view'));

CREATE POLICY enquiry_phones_insert ON enquiry_phones
  FOR INSERT TO authenticated
  WITH CHECK (has_capability('enquiry:edit'));

CREATE POLICY enquiry_phones_delete ON enquiry_phones
  FOR DELETE TO authenticated
  USING (has_capability('enquiry:edit'));

-- ── Backfill existing phone data ──────────────────────────────────────
DO $$
BEGIN
  INSERT INTO enquiry_phones (tenant_id, enquiry_id, phone, is_primary)
  SELECT e.tenant_id, e.id, e.phone, true
  FROM enquiries e
  WHERE e.phone IS NOT NULL AND e.phone <> '';
END $$;

-- ── Add deleted_at to enquiries for soft delete ───────────────────────
-- (Only add if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'enquiries' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE enquiries ADD COLUMN deleted_at timestamptz NULL;
  END IF;
END $$;
