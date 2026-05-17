-- Phase 10 · Material Plan ↔ Site Execution Table ↔ Expenses linkage
-- Links material_plan rows to specific project table rows (Site Execution table).
-- Links expenses to material_plan rows for spend tracking.

-- ── Material plan → project table linkage ─────────────────────────────
ALTER TABLE material_plan
  ADD COLUMN linked_project_table_id uuid NULL
  REFERENCES project_tables(id) ON DELETE SET NULL;

ALTER TABLE material_plan
  ADD COLUMN linked_project_table_row_id uuid NULL
  REFERENCES project_table_rows(id) ON DELETE SET NULL;

-- ── Expenses → material plan linkage ──────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN linked_material_plan_id uuid NULL
  REFERENCES material_plan(id) ON DELETE SET NULL;
