-- Phase 1 · RLS policies for all Phase 1 tables
-- Pattern: SELECT uses has_capability() + is_assigned_to_project() where applicable.
-- No direct role checks — always via has_capability().

-- ── helpers: same-tenant predicate (used in many policies) ───────────
-- Extracted into a reusable expression via a helper view/function approach:
-- We inline the tenant check to avoid a function call per row.

-- ── projects ──────────────────────────────────────────────────────────

CREATE POLICY "projects: tenant members can view assigned or all"
  ON projects FOR SELECT
  USING (
    deleted_at IS NULL
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR (has_capability('project:view_assigned') AND is_assigned_to_project(id))
    )
  );

CREATE POLICY "projects: create requires capability"
  ON projects FOR INSERT
  WITH CHECK (
    has_capability('project:create')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "projects: edit requires capability"
  ON projects FOR UPDATE
  USING (
    deleted_at IS NULL
    AND has_capability('project:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Soft delete: project:delete capability; sets deleted_at (UPDATE).
-- Hard delete: never allowed via RLS; service role only during purge.
CREATE POLICY "projects: delete requires capability"
  ON projects FOR DELETE
  USING (has_capability('project:delete'));

-- ── work_log ──────────────────────────────────────────────────────────

CREATE POLICY "work_log: assigned users or view_all can read"
  ON work_log FOR SELECT
  USING (
    deleted_at IS NULL
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR is_assigned_to_project(project_id)
    )
  );

-- Own entries OR owner/PM with progress:update capability
CREATE POLICY "work_log: log own hours or with capability"
  ON work_log FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      user_id = auth.uid()
      OR has_capability('progress:update')
    )
    AND is_assigned_to_project(project_id)
  );

-- No UPDATE or DELETE on work_log — append-only correction pattern.

-- ── project_assignments ───────────────────────────────────────────────

CREATE POLICY "project_assignments: view if assigned or view_all"
  ON project_assignments FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR is_assigned_to_project(project_id)
    )
  );

CREATE POLICY "project_assignments: manage requires team:assign_to_project"
  ON project_assignments FOR INSERT
  WITH CHECK (
    has_capability('team:assign_to_project')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_assignments: update requires team:assign_to_project"
  ON project_assignments FOR UPDATE
  USING (has_capability('team:assign_to_project'));

CREATE POLICY "project_assignments: delete requires team:assign_to_project"
  ON project_assignments FOR DELETE
  USING (has_capability('team:assign_to_project'));

-- ── project_checkpoints ───────────────────────────────────────────────

CREATE POLICY "project_checkpoints: view if assigned or view_all"
  ON project_checkpoints FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR is_assigned_to_project(project_id)
    )
  );

CREATE POLICY "project_checkpoints: create with checklist:edit or project:edit"
  ON project_checkpoints FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (has_capability('checklist:edit') OR has_capability('project:edit'))
    AND (
      has_capability('project:view_all')
      OR is_assigned_to_project(project_id)
    )
  );

CREATE POLICY "project_checkpoints: update with checklist:edit or project:edit"
  ON project_checkpoints FOR UPDATE
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (has_capability('checklist:edit') OR has_capability('project:edit'))
  );

CREATE POLICY "project_checkpoints: delete with project:edit"
  ON project_checkpoints FOR DELETE
  USING (has_capability('project:edit'));

-- ── checkpoint_templates ──────────────────────────────────────────────
-- All authenticated tenant members can read templates (needed for project creation).
-- Only users with project:edit can create/update non-system templates.

CREATE POLICY "checkpoint_templates: all tenant members can read"
  ON checkpoint_templates FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "checkpoint_templates: create requires project:edit"
  ON checkpoint_templates FOR INSERT
  WITH CHECK (
    has_capability('project:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "checkpoint_templates: update non-system requires project:edit"
  ON checkpoint_templates FOR UPDATE
  USING (
    has_capability('project:edit')
    AND is_system = false
  );

CREATE POLICY "checkpoint_templates: delete non-system requires project:edit"
  ON checkpoint_templates FOR DELETE
  USING (
    has_capability('project:edit')
    AND is_system = false
  );

-- ── checkpoint_template_items ─────────────────────────────────────────

CREATE POLICY "checkpoint_template_items: all tenant members can read"
  ON checkpoint_template_items FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "checkpoint_template_items: manage requires project:edit"
  ON checkpoint_template_items FOR ALL
  USING (
    has_capability('project:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    has_capability('project:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── checkpoint_items ──────────────────────────────────────────────────

CREATE POLICY "checkpoint_items: view if assigned or view_all"
  ON checkpoint_items FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR EXISTS (
        SELECT 1 FROM project_checkpoints pc
        WHERE pc.id = checkpoint_id
          AND is_assigned_to_project(pc.project_id)
      )
    )
  );

CREATE POLICY "checkpoint_items: update with progress:update"
  ON checkpoint_items FOR UPDATE
  USING (
    has_capability('progress:update')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "checkpoint_items: create with checklist:edit"
  ON checkpoint_items FOR INSERT
  WITH CHECK (
    (has_capability('checklist:edit') OR has_capability('progress:update'))
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "checkpoint_items: delete with checklist:edit"
  ON checkpoint_items FOR DELETE
  USING (has_capability('checklist:edit'));

-- ── project_tables ────────────────────────────────────────────────────

CREATE POLICY "project_tables: view with project_table:view or assigned"
  ON project_tables FOR SELECT
  USING (
    deleted_at IS NULL
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
    AND (
      has_capability('project:view_all')
      OR (has_capability('project_table:view') AND is_assigned_to_project(project_id))
    )
  );

CREATE POLICY "project_tables: create with project_table:create"
  ON project_tables FOR INSERT
  WITH CHECK (
    has_capability('project_table:create')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_tables: update with project_table:edit"
  ON project_tables FOR UPDATE
  USING (
    deleted_at IS NULL
    AND has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_tables: delete with project_table:edit"
  ON project_tables FOR DELETE
  USING (has_capability('project_table:edit'));

-- ── project_table_columns, sections, rows, revisions ─────────────────
-- Inherit access from the parent project_table.

CREATE POLICY "project_table_columns: view"
  ON project_table_columns FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_table_columns: manage with project_table:edit"
  ON project_table_columns FOR ALL
  USING (has_capability('project_table:edit'))
  WITH CHECK (has_capability('project_table:edit'));

CREATE POLICY "project_table_sections: view"
  ON project_table_sections FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_table_sections: manage with project_table:edit"
  ON project_table_sections FOR ALL
  USING (has_capability('project_table:edit'))
  WITH CHECK (has_capability('project_table:edit'));

CREATE POLICY "project_table_rows: view"
  ON project_table_rows FOR SELECT
  USING (
    deleted_at IS NULL
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_table_rows: manage with project_table:edit"
  ON project_table_rows FOR ALL
  USING (
    deleted_at IS NULL
    AND has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Revisions: read-only (inserted by trigger/API logic, no UPDATE/DELETE)
CREATE POLICY "project_table_row_revisions: view"
  ON project_table_row_revisions FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "project_table_row_revisions: insert with project_table:edit"
  ON project_table_row_revisions FOR INSERT
  WITH CHECK (
    has_capability('project_table:edit')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── table_presets ──────────────────────────────────────────────────────
-- All tenant members read; table_preset:manage required for writes.

CREATE POLICY "table_presets: all tenant members can read"
  ON table_presets FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "table_presets: manage requires table_preset:manage"
  ON table_presets FOR INSERT
  WITH CHECK (
    has_capability('table_preset:manage')
    AND tenant_id = (
      SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "table_presets: update non-system requires table_preset:manage"
  ON table_presets FOR UPDATE
  USING (
    has_capability('table_preset:manage')
    AND is_system = false
  );

CREATE POLICY "table_presets: delete non-system requires table_preset:manage"
  ON table_presets FOR DELETE
  USING (
    has_capability('table_preset:manage')
    AND is_system = false
  );

CREATE POLICY "table_preset_columns: tenant read"
  ON table_preset_columns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM table_presets tp
    WHERE tp.id = preset_id
      AND tp.tenant_id = (
        SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
      )
  ));

CREATE POLICY "table_preset_columns: manage requires table_preset:manage"
  ON table_preset_columns FOR ALL
  USING (has_capability('table_preset:manage'))
  WITH CHECK (has_capability('table_preset:manage'));

CREATE POLICY "table_preset_sections: tenant read"
  ON table_preset_sections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM table_presets tp
    WHERE tp.id = preset_id
      AND tp.tenant_id = (
        SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
      )
  ));

CREATE POLICY "table_preset_sections: manage requires table_preset:manage"
  ON table_preset_sections FOR ALL
  USING (has_capability('table_preset:manage'))
  WITH CHECK (has_capability('table_preset:manage'));

CREATE POLICY "table_preset_rows: tenant read"
  ON table_preset_rows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM table_presets tp
    WHERE tp.id = preset_id
      AND tp.tenant_id = (
        SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL
      )
  ));

CREATE POLICY "table_preset_rows: manage requires table_preset:manage"
  ON table_preset_rows FOR ALL
  USING (has_capability('table_preset:manage'))
  WITH CHECK (has_capability('table_preset:manage'));

-- ── Privilege hardening for Phase 1 tables ────────────────────────────

REVOKE ALL ON TABLE projects                   FROM anon;
REVOKE ALL ON TABLE work_log                   FROM anon;
REVOKE ALL ON TABLE project_assignments        FROM anon;
REVOKE ALL ON TABLE project_checkpoints        FROM anon;
REVOKE ALL ON TABLE checkpoint_templates       FROM anon;
REVOKE ALL ON TABLE checkpoint_template_items  FROM anon;
REVOKE ALL ON TABLE checkpoint_items           FROM anon;
REVOKE ALL ON TABLE project_tables             FROM anon;
REVOKE ALL ON TABLE project_table_columns      FROM anon;
REVOKE ALL ON TABLE project_table_sections     FROM anon;
REVOKE ALL ON TABLE project_table_rows         FROM anon;
REVOKE ALL ON TABLE project_table_row_revisions FROM anon;
REVOKE ALL ON TABLE table_presets              FROM anon;
REVOKE ALL ON TABLE table_preset_columns       FROM anon;
REVOKE ALL ON TABLE table_preset_sections      FROM anon;
REVOKE ALL ON TABLE table_preset_rows          FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects                    TO authenticated;
GRANT SELECT, INSERT                 ON TABLE work_log                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_assignments         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_checkpoints         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_templates        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_template_items   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE checkpoint_items            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_tables              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_columns       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_sections      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_table_rows          TO authenticated;
GRANT SELECT, INSERT                 ON TABLE project_table_row_revisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_presets               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_columns        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_sections       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE table_preset_rows           TO authenticated;
