-- Phase 2 · Expenses
-- Review Gate P3: BEFORE UPDATE trigger auto-sets approved_by/approved_at; enforces rejection_reason

CREATE TABLE expenses (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      uuid NOT NULL REFERENCES tenants(id),
  project_id                     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount                         numeric(12,2) NOT NULL CHECK (amount > 0),
  category                       text NOT NULL CHECK (category IN ('labour','transport','materials','misc')),
  description                    text,
  is_miscellaneous               boolean NOT NULL DEFAULT false,
  receipt_url                    text,
  spent_on                       date NOT NULL DEFAULT current_date,
  recorded_by                    uuid NOT NULL REFERENCES users(id),
  approval_status                text NOT NULL DEFAULT 'pending'
                                 CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by                    uuid REFERENCES users(id),
  approved_at                    timestamptz,
  rejection_reason               text,
  linked_material_consumption_id uuid REFERENCES material_consumption(id),
  linked_checkpoint_id           uuid REFERENCES project_checkpoints(id),
  corrects_expense_id            uuid REFERENCES expenses(id),
  is_corrected                   boolean NOT NULL DEFAULT false,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  deleted_at                     timestamptz
);

CREATE INDEX idx_expenses_project  ON expenses(project_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_status   ON expenses(project_id, approval_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_corrects ON expenses(corrects_expense_id) WHERE corrects_expense_id IS NOT NULL;
CREATE INDEX idx_expenses_recorder ON expenses(recorded_by, spent_on DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_expenses_set_tenant
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- Correction trigger (shared parametric)
CREATE TRIGGER trg_correct_expense
  AFTER INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION mark_original_as_corrected('corrects_expense_id');

-- Auto-populate approved_by/approved_at; enforce rejection_reason; block invalid transitions
CREATE OR REPLACE FUNCTION handle_expense_approval()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.approval_status = OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF OLD.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'expense approval_status can only transition from pending; use the correction pattern to revise an approved or rejected expense';
  END IF;

  IF NEW.approval_status = 'approved' THEN
    NEW.approved_by      := auth.uid();
    NEW.approved_at      := now();
    NEW.rejection_reason := NULL;
  ELSIF NEW.approval_status = 'rejected' THEN
    IF NEW.rejection_reason IS NULL OR trim(NEW.rejection_reason) = '' THEN
      RAISE EXCEPTION 'rejection_reason is required when rejecting an expense';
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_expenses_handle_approval
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION handle_expense_approval();

-- Cross-entity link validation
CREATE OR REPLACE FUNCTION validate_expense_links()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.linked_material_consumption_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM material_consumption
      WHERE id = NEW.linked_material_consumption_id AND project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'linked_material_consumption_id must belong to the same project';
    END IF;
  END IF;

  IF NEW.linked_checkpoint_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_checkpoints
      WHERE id = NEW.linked_checkpoint_id AND project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION 'linked_checkpoint_id must belong to the same project';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_expenses_validate_links
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION validate_expense_links();

-- Backfill FK on material_consumption.expense_id (expenses table now exists)
ALTER TABLE material_consumption
  ADD CONSTRAINT fk_mat_consumption_expense
  FOREIGN KEY (expense_id) REFERENCES expenses(id);
