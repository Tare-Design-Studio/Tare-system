-- Phase 5 · Payment Schedule + Payment Records + Milestone Coupling

-- ── payment_schedule ─────────────────────────────────────────────────────
CREATE TABLE payment_schedule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_name  text NOT NULL,
  amount_due      numeric(14,2) NOT NULL CHECK (amount_due > 0),
  due_date        date NOT NULL,
  sequence_order  int NOT NULL,
  notes           text,
  is_paid         boolean NOT NULL DEFAULT false,
  triggered_at    timestamptz,           -- set when linked checkpoint is approved
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sequence_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_payment_schedule_project  ON payment_schedule(project_id, sequence_order);
CREATE INDEX idx_payment_schedule_active   ON payment_schedule(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_schedule_unpaid   ON payment_schedule(project_id, due_date) WHERE is_paid = false AND deleted_at IS NULL;

ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization
CREATE TRIGGER trg_payment_schedule_set_tenant
  BEFORE INSERT ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- Touch updated_at
CREATE TRIGGER trg_payment_schedule_touch
  BEFORE UPDATE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── payment_records ───────────────────────────────────────────────────────
CREATE TABLE payment_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  payment_schedule_id  uuid REFERENCES payment_schedule(id),
  project_id           uuid NOT NULL REFERENCES projects(id),
  amount_paid          numeric(14,2) NOT NULL CHECK (amount_paid > 0),
  paid_on              date NOT NULL,
  method               text CHECK (method IN ('bank','upi','cheque','cash')),
  reference            text,
  notes                text,
  recorded_by          uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_records_schedule ON payment_records(payment_schedule_id);
CREATE INDEX idx_payment_records_project  ON payment_records(project_id, paid_on DESC);

ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization
CREATE TRIGGER trg_payment_records_set_tenant
  BEFORE INSERT ON payment_records
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- Auto-set recorded_by from auth.uid()
CREATE OR REPLACE FUNCTION set_recorded_by_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.recorded_by IS NULL THEN
    NEW.recorded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_records_set_recorded_by
  BEFORE INSERT ON payment_records
  FOR EACH ROW EXECUTE FUNCTION set_recorded_by_auth();

-- ── recompute is_paid after record insert/update/delete ──────────────────
CREATE OR REPLACE FUNCTION recompute_payment_is_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_schedule_id uuid;
  v_amount_due  numeric(14,2);
  v_received    numeric(14,2);
BEGIN
  -- Determine which schedule row to recompute
  IF TG_OP = 'DELETE' THEN
    v_schedule_id := OLD.payment_schedule_id;
  ELSE
    v_schedule_id := NEW.payment_schedule_id;
  END IF;

  IF v_schedule_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT amount_due INTO v_amount_due
    FROM payment_schedule
   WHERE id = v_schedule_id;

  SELECT COALESCE(SUM(amount_paid), 0) INTO v_received
    FROM payment_records
   WHERE payment_schedule_id = v_schedule_id;

  UPDATE payment_schedule
     SET is_paid = (v_received >= v_amount_due)
   WHERE id = v_schedule_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_payment_records_recompute
  AFTER INSERT OR UPDATE OR DELETE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION recompute_payment_is_paid();

-- ── checkpoint approval → set triggered_at ───────────────────────────────
CREATE OR REPLACE FUNCTION mark_payment_triggered_on_checkpoint_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.approved_at IS NULL
     AND NEW.approved_at IS NOT NULL
     AND NEW.triggers_payment_id IS NOT NULL
  THEN
    UPDATE payment_schedule
       SET triggered_at = now()
     WHERE id = NEW.triggers_payment_id
       AND triggered_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checkpoint_approval_triggers_payment
  AFTER UPDATE ON project_checkpoints
  FOR EACH ROW EXECUTE FUNCTION mark_payment_triggered_on_checkpoint_approval();

-- ── FK: project_checkpoints.triggers_payment_id → payment_schedule ───────
-- Null out any stale values first (defensive — Phase 5 hadn't shipped yet)
UPDATE project_checkpoints SET triggers_payment_id = NULL WHERE triggers_payment_id IS NOT NULL;

ALTER TABLE project_checkpoints
  ADD CONSTRAINT project_checkpoints_triggers_payment_id_fk
  FOREIGN KEY (triggers_payment_id) REFERENCES payment_schedule(id) ON DELETE SET NULL;
