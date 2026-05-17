-- Phase 1 · Checkpoints, Templates, Checkpoint Items
-- Includes v_checkpoint_progress (F1 — used in Phase 6 customer portal)

-- ── project_checkpoints ───────────────────────────────────────────────
CREATE TABLE project_checkpoints (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                text NOT NULL,
  sequence_order      int NOT NULL,
  due_date            date NOT NULL,
  completed_at        timestamptz,
  requires_approval   boolean DEFAULT false,
  approved_at         timestamptz,
  approved_by         uuid REFERENCES users(id),
  -- FK to payment_schedule added in Phase 5 (after payment tables exist)
  triggers_payment_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sequence_order)
);

CREATE INDEX idx_checkpoints_project ON project_checkpoints(project_id);
CREATE INDEX idx_checkpoints_due      ON project_checkpoints(project_id, due_date) WHERE completed_at IS NULL;

ALTER TABLE project_checkpoints ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization
CREATE TRIGGER trg_checkpoints_set_tenant
  BEFORE INSERT ON project_checkpoints
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- ── v_project_checkpoint_status ───────────────────────────────────────
-- Status is computed on read (current_date is STABLE, not IMMUTABLE).
CREATE OR REPLACE VIEW v_project_checkpoint_status AS
SELECT
  pc.*,
  CASE
    WHEN pc.completed_at IS NOT NULL           THEN 'complete'
    WHEN pc.due_date < CURRENT_DATE            THEN 'overdue'
    ELSE                                            'pending'
  END AS status
FROM project_checkpoints pc;

-- ── checkpoint_templates ──────────────────────────────────────────────
CREATE TABLE checkpoint_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  name        text NOT NULL,
  description text,
  is_system   boolean DEFAULT false,    -- seeded system presets cannot be deleted
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id),
  UNIQUE (tenant_id, name)
);

ALTER TABLE checkpoint_templates ENABLE ROW LEVEL SECURITY;

-- ── checkpoint_template_items ─────────────────────────────────────────
CREATE TABLE checkpoint_template_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  template_id         uuid NOT NULL REFERENCES checkpoint_templates(id) ON DELETE CASCADE,
  sequence_order      int NOT NULL,
  name                text NOT NULL,
  default_offset_days int,             -- days from project start; null = user sets per project
  requires_approval   boolean DEFAULT false,
  default_payment_pct numeric(5,2),   -- % of project budget paid at this milestone
  UNIQUE (template_id, sequence_order)
);

CREATE INDEX idx_template_items_template ON checkpoint_template_items(template_id);

ALTER TABLE checkpoint_template_items ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for template items (user_id → tenant via template → tenants)
CREATE OR REPLACE FUNCTION set_tenant_from_checkpoint_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM checkpoint_templates WHERE id = NEW.template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkpoint_template % not found', NEW.template_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_items_set_tenant
  BEFORE INSERT ON checkpoint_template_items
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_checkpoint_template();

-- ── checkpoint_items (sub-tasks within a checkpoint) ──────────────────
CREATE TABLE checkpoint_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  checkpoint_id  uuid NOT NULL REFERENCES project_checkpoints(id) ON DELETE CASCADE,
  description    text NOT NULL,
  is_complete    boolean DEFAULT false,
  completed_by   uuid REFERENCES users(id),
  completed_at   timestamptz,
  photo_url      text,
  notes          text
);

CREATE INDEX idx_checkpoint_items_checkpoint ON checkpoint_items(checkpoint_id);

ALTER TABLE checkpoint_items ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for checkpoint_items
CREATE OR REPLACE FUNCTION set_tenant_from_checkpoint()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM project_checkpoints WHERE id = NEW.checkpoint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_checkpoint % not found', NEW.checkpoint_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checkpoint_items_set_tenant
  BEFORE INSERT ON checkpoint_items
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_checkpoint();

-- ── v_checkpoint_progress (F1 — Customer Portal Phase 6) ─────────────
-- Exposed now so Phase 6 can reference it without a new migration.
CREATE OR REPLACE VIEW v_checkpoint_progress AS
SELECT
  pc.id            AS checkpoint_id,
  pc.tenant_id,
  pc.project_id,
  pc.name,
  pc.sequence_order,
  pc.due_date,
  pc.completed_at,
  COUNT(ci.id)                                                        AS total_items,
  COUNT(ci.id) FILTER (WHERE ci.is_complete = true)                  AS completed_items,
  CASE
    WHEN COUNT(ci.id) = 0 THEN NULL
    ELSE ROUND(
      COUNT(ci.id) FILTER (WHERE ci.is_complete = true) * 100.0 / COUNT(ci.id), 1
    )
  END                                                                  AS progress_pct
FROM project_checkpoints pc
LEFT JOIN checkpoint_items ci ON ci.checkpoint_id = pc.id
GROUP BY pc.id, pc.tenant_id, pc.project_id, pc.name, pc.sequence_order, pc.due_date, pc.completed_at;

-- ── apply_checkpoint_template() ───────────────────────────────────────
-- Called by the project creation API. Copies template items into
-- project_checkpoints. After copying, no link back to template —
-- the project owns its own checkpoints.
CREATE OR REPLACE FUNCTION apply_checkpoint_template(
  p_project_id   uuid,
  p_template_id  uuid,
  p_start_date   date DEFAULT CURRENT_DATE
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant_id uuid;
  v_item      checkpoint_template_items%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM projects WHERE id = p_project_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id;
  END IF;

  FOR v_item IN
    SELECT * FROM checkpoint_template_items
    WHERE template_id = p_template_id
    ORDER BY sequence_order
  LOOP
    INSERT INTO project_checkpoints (
      tenant_id, project_id, name, sequence_order,
      due_date, requires_approval
    ) VALUES (
      v_tenant_id,
      p_project_id,
      v_item.name,
      v_item.sequence_order,
      p_start_date + COALESCE(v_item.default_offset_days, 30) * (v_item.sequence_order),
      v_item.requires_approval
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION apply_checkpoint_template FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_checkpoint_template TO authenticated;
