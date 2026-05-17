-- Phase 1 · Project Execution Tables + Table Presets
-- Execution tables are typed structured checklists (Drawing Register, site checklists).
-- Presets are tenant-level templates that get copied into projects on creation.

-- ── project_tables ────────────────────────────────────────────────────
CREATE TABLE project_tables (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text NOT NULL,
  table_owner_role text NOT NULL CHECK (table_owner_role IN ('team_member', 'site_engineer')),
  description      text,
  source_preset_id uuid,              -- references table_presets(id); copied not linked
  display_order    int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX idx_project_tables_project ON project_tables(project_id) WHERE deleted_at IS NULL;

ALTER TABLE project_tables ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_project_tables_updated_at
  BEFORE UPDATE ON project_tables
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_project_tables_set_tenant
  BEFORE INSERT ON project_tables
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project();

-- ── project_table_columns ─────────────────────────────────────────────
CREATE TABLE project_table_columns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  project_table_id uuid NOT NULL REFERENCES project_tables(id) ON DELETE CASCADE,
  name             text NOT NULL,
  column_kind      text NOT NULL CHECK (column_kind IN ('serial','text','checkbox','date','revision_text')),
  display_order    int NOT NULL,
  is_required      boolean DEFAULT false,
  UNIQUE (project_table_id, display_order)
);

ALTER TABLE project_table_columns ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for columns
CREATE OR REPLACE FUNCTION set_tenant_from_project_table()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM project_tables WHERE id = NEW.project_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_table % not found', NEW.project_table_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_table_columns_set_tenant
  BEFORE INSERT ON project_table_columns
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project_table();

-- ── project_table_sections ────────────────────────────────────────────
CREATE TABLE project_table_sections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  project_table_id uuid NOT NULL REFERENCES project_tables(id) ON DELETE CASCADE,
  name             text NOT NULL,
  display_order    int NOT NULL,
  UNIQUE (project_table_id, display_order)
);

ALTER TABLE project_table_sections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_table_sections_set_tenant
  BEFORE INSERT ON project_table_sections
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project_table();

-- ── project_table_rows ────────────────────────────────────────────────
-- cells JSONB keyed by column id: {"<col_uuid>": true, "<col_uuid>": "..."}
CREATE TABLE project_table_rows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  project_table_id uuid NOT NULL REFERENCES project_tables(id) ON DELETE CASCADE,
  section_id       uuid REFERENCES project_table_sections(id) ON DELETE SET NULL,
  display_order    int NOT NULL,
  cells            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES users(id),
  deleted_at       timestamptz
);

CREATE INDEX idx_table_rows_table_order ON project_table_rows(project_table_id, display_order)
  WHERE deleted_at IS NULL;

ALTER TABLE project_table_rows ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_table_rows_updated_at
  BEFORE UPDATE ON project_table_rows
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_table_rows_set_tenant
  BEFORE INSERT ON project_table_rows
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_project_table();

-- ── project_table_row_revisions ───────────────────────────────────────
-- Append-only revision history per row. Row itself reflects current state.
CREATE TABLE project_table_row_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  row_id          uuid NOT NULL REFERENCES project_table_rows(id) ON DELETE CASCADE,
  revision_number int NOT NULL,
  cells_before    jsonb,
  cells_after     jsonb,
  change_note     text,
  changed_by      uuid REFERENCES users(id),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, revision_number)
);

CREATE INDEX idx_row_revisions_row ON project_table_row_revisions(row_id);

ALTER TABLE project_table_row_revisions ENABLE ROW LEVEL SECURITY;

-- Tenant denormalization for revisions
CREATE OR REPLACE FUNCTION set_tenant_from_table_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM project_table_rows WHERE id = NEW.row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_table_row % not found', NEW.row_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_row_revisions_set_tenant
  BEFORE INSERT ON project_table_row_revisions
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_table_row();

-- Revision number auto-increment per row
CREATE OR REPLACE FUNCTION auto_revision_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_max int;
BEGIN
  SELECT COALESCE(MAX(revision_number), 0) INTO v_max
    FROM project_table_row_revisions WHERE row_id = NEW.row_id;
  NEW.revision_number := v_max + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_revision_number
  BEFORE INSERT ON project_table_row_revisions
  FOR EACH ROW EXECUTE FUNCTION auto_revision_number();

-- ── table_presets ──────────────────────────────────────────────────────
CREATE TABLE table_presets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  name                  text NOT NULL,
  description           text,
  table_owner_role      text NOT NULL CHECK (table_owner_role IN ('team_member', 'site_engineer')),
  is_system             boolean DEFAULT false,
  is_default_for_role   boolean DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES users(id),
  UNIQUE (tenant_id, name)
);

ALTER TABLE table_presets ENABLE ROW LEVEL SECURITY;

-- ── table_preset_columns ──────────────────────────────────────────────
CREATE TABLE table_preset_columns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id     uuid NOT NULL REFERENCES table_presets(id) ON DELETE CASCADE,
  name          text NOT NULL,
  column_kind   text NOT NULL CHECK (column_kind IN ('serial','text','checkbox','date','revision_text')),
  display_order int NOT NULL,
  is_required   boolean DEFAULT false,
  UNIQUE (preset_id, display_order)
);

ALTER TABLE table_preset_columns ENABLE ROW LEVEL SECURITY;

-- ── table_preset_sections ─────────────────────────────────────────────
CREATE TABLE table_preset_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id     uuid NOT NULL REFERENCES table_presets(id) ON DELETE CASCADE,
  name          text NOT NULL,
  display_order int NOT NULL,
  UNIQUE (preset_id, display_order)
);

ALTER TABLE table_preset_sections ENABLE ROW LEVEL SECURITY;

-- ── table_preset_rows ─────────────────────────────────────────────────
CREATE TABLE table_preset_rows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id     uuid NOT NULL REFERENCES table_presets(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES table_preset_sections(id) ON DELETE SET NULL,
  display_order int NOT NULL,
  cells         jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE table_preset_rows ENABLE ROW LEVEL SECURITY;

-- ── apply_table_preset() ───────────────────────────────────────────────
-- Called by the project creation API. Copies a preset's structure into
-- project_tables, project_table_columns, project_table_sections, project_table_rows.
-- No link back to the preset after copying — the project table owns its state.
CREATE OR REPLACE FUNCTION apply_table_preset(
  p_project_id   uuid,
  p_preset_id    uuid,
  p_created_by   uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tenant_id    uuid;
  v_preset       table_presets%ROWTYPE;
  v_table_id     uuid;
  v_col          table_preset_columns%ROWTYPE;
  v_sec          table_preset_sections%ROWTYPE;
  v_row          table_preset_rows%ROWTYPE;
  v_col_map      jsonb := '{}'::jsonb;
  v_sec_map      jsonb := '{}'::jsonb;
  v_new_col_id   uuid;
  v_new_sec_id   uuid;
  v_new_cells    jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM projects WHERE id = p_project_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id;
  END IF;

  SELECT * INTO v_preset FROM table_presets WHERE id = p_preset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_preset % not found', p_preset_id;
  END IF;

  -- Create the project table
  INSERT INTO project_tables (tenant_id, project_id, name, table_owner_role,
    description, source_preset_id, created_by)
  VALUES (v_tenant_id, p_project_id, v_preset.name, v_preset.table_owner_role,
    v_preset.description, p_preset_id, p_created_by)
  RETURNING id INTO v_table_id;

  -- Copy columns; build old→new id map for cell key translation
  FOR v_col IN SELECT * FROM table_preset_columns WHERE preset_id = p_preset_id ORDER BY display_order
  LOOP
    INSERT INTO project_table_columns (tenant_id, project_table_id, name, column_kind, display_order, is_required)
    VALUES (v_tenant_id, v_table_id, v_col.name, v_col.column_kind, v_col.display_order, v_col.is_required)
    RETURNING id INTO v_new_col_id;
    v_col_map := v_col_map || jsonb_build_object(v_col.id::text, v_new_col_id::text);
  END LOOP;

  -- Copy sections; build old→new section id map
  FOR v_sec IN SELECT * FROM table_preset_sections WHERE preset_id = p_preset_id ORDER BY display_order
  LOOP
    INSERT INTO project_table_sections (tenant_id, project_table_id, name, display_order)
    VALUES (v_tenant_id, v_table_id, v_sec.name, v_sec.display_order)
    RETURNING id INTO v_new_sec_id;
    v_sec_map := v_sec_map || jsonb_build_object(v_sec.id::text, v_new_sec_id::text);
  END LOOP;

  -- Copy rows; remap section_ids and cell keys
  FOR v_row IN SELECT * FROM table_preset_rows WHERE preset_id = p_preset_id ORDER BY display_order
  LOOP
    -- Remap cell keys from preset column ids to new project column ids
    SELECT jsonb_object_agg(
      COALESCE((v_col_map->>(kv.key)), kv.key),
      kv.value
    ) INTO v_new_cells
    FROM jsonb_each(v_row.cells) AS kv(key, value);

    INSERT INTO project_table_rows (
      tenant_id, project_table_id, section_id, display_order, cells, created_by
    ) VALUES (
      v_tenant_id, v_table_id,
      CASE WHEN v_row.section_id IS NOT NULL
           THEN (v_sec_map->>(v_row.section_id::text))::uuid
           ELSE NULL
      END,
      v_row.display_order,
      COALESCE(v_new_cells, '{}'::jsonb),
      p_created_by
    );
  END LOOP;

  RETURN v_table_id;
END;
$$;

REVOKE ALL ON FUNCTION apply_table_preset FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_table_preset TO authenticated;
