-- 114: Payment wings (design / execution), Part A|B sub-phases, wing budgets,
--      preset scope tagging, and server-side milestone reordering.
--
-- Why:
--  1. A project is either design_only or design_and_execution (067). Payments
--     had no such split — one flat list, one budget. Now every milestone lives
--     in a WING (design | execution) and, within it, a PART (a | b).
--  2. Wing amounts are entered directly (projects.design_budget /
--     execution_budget) rather than derived from a percentage of budget_total.
--     A milestone's preset percentage applies to ITS OWN wing's budget.
--  3. Presets declare which project scope they suit, so a design-only project
--     is never offered a preset that carries execution milestones.
--  4. Milestones must be reorderable and insertable *between* existing rows.
--     payment_schedule has UNIQUE (project_id, sequence_order) DEFERRABLE
--     INITIALLY DEFERRED, so a whole-list renumber inside one statement is
--     safe; a client doing it row-by-row over HTTP is not. Two SECURITY DEFINER
--     RPCs do it in a single transaction instead.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── 1. Wing + part on payment_schedule ───────────────────────────────────
-- Existing rows become design-wing Part A: for a design_only project that is
-- correct, and for design_and_execution it is the least surprising default
-- (the owner re-files them from the UI). No row is stranded.
ALTER TABLE payment_schedule
  ADD COLUMN wing text NOT NULL DEFAULT 'design'
    CHECK (wing IN ('design', 'execution')),
  ADD COLUMN part text NOT NULL DEFAULT 'a'
    CHECK (part IN ('a', 'b'));

-- Ordering is per-project (the UNIQUE constraint from 027 is project-wide and
-- stays that way); this index serves the wing/part-grouped read.
CREATE INDEX idx_payment_schedule_wing
  ON payment_schedule(project_id, wing, part, sequence_order)
  WHERE deleted_at IS NULL;

-- ── 2. Wing budgets on projects ──────────────────────────────────────────
-- Amounts, not percentages. NULL = wing not budgeted yet; the app falls back to
-- budget_total so pre-existing projects keep computing exactly as before.
-- Deliberately NOT constrained to sum to budget_total: the owner enters these
-- incrementally and the UI warns on mismatch. A hard constraint would make the
-- first of the two edits impossible.
ALTER TABLE projects
  ADD COLUMN design_budget    numeric(14,2) NULL CHECK (design_budget    >= 0),
  ADD COLUMN execution_budget numeric(14,2) NULL CHECK (execution_budget >= 0);

-- ── 3. Preset scope + per-item wing/part ─────────────────────────────────
-- A preset tagged design_only offers only design milestones. One tagged
-- design_and_execution may carry both wings' items.
ALTER TABLE payment_milestone_presets
  ADD COLUMN scope text NOT NULL DEFAULT 'design_and_execution'
    CHECK (scope IN ('design_only', 'design_and_execution'));

ALTER TABLE payment_milestone_preset_items
  ADD COLUMN wing text NOT NULL DEFAULT 'design'
    CHECK (wing IN ('design', 'execution')),
  ADD COLUMN part text NOT NULL DEFAULT 'a'
    CHECK (part IN ('a', 'b'));

-- A design_only preset must not carry execution items — otherwise applying it
-- would silently create rows in a wing the project does not have.
CREATE OR REPLACE FUNCTION check_preset_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_scope text;
BEGIN
  SELECT scope INTO v_scope
    FROM payment_milestone_presets WHERE id = NEW.preset_id;

  IF v_scope = 'design_only' AND NEW.wing = 'execution' THEN
    RAISE EXCEPTION 'preset % is design_only and cannot hold execution milestones', NEW.preset_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_preset_item_scope
  BEFORE INSERT OR UPDATE ON payment_milestone_preset_items
  FOR EACH ROW EXECUTE FUNCTION check_preset_item_scope();

-- ── 4. Wing must match project scope ─────────────────────────────────────
-- Defence in depth behind the API check: a design_only project can never hold
-- an execution milestone, whatever the write path. Existing execution rows are
-- NOT deleted when a project flips to design_only (the UI hides them) — but no
-- NEW execution row can be written while it is design_only.
CREATE OR REPLACE FUNCTION check_payment_wing_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_scope text;
BEGIN
  IF NEW.wing <> 'execution' THEN
    RETURN NEW;
  END IF;

  -- Only guard genuinely new execution rows; leave already-stored ones editable
  -- so a scope flip does not freeze historical data.
  IF TG_OP = 'UPDATE' AND OLD.wing = 'execution' THEN
    RETURN NEW;
  END IF;

  SELECT scope INTO v_scope FROM projects WHERE id = NEW.project_id;
  IF v_scope = 'design_only' THEN
    RAISE EXCEPTION 'project % is design_only; execution milestones are not allowed', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_schedule_wing_scope
  BEFORE INSERT OR UPDATE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION check_payment_wing_scope();

-- ── 5. Reorder + insert-between ──────────────────────────────────────────
-- Both renumber the project's whole active list in ONE statement, relying on
-- the DEFERRABLE unique constraint to tolerate transient collisions.

-- Move one milestone to a new position within its (wing, part) group.
-- p_target_index is 0-based within that group after removal of the moved row.
CREATE OR REPLACE FUNCTION reorder_payment_milestone(
  p_project_id   uuid,
  p_schedule_id  uuid,
  p_wing         text,
  p_part         text,
  p_target_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_scope text;
BEGIN
  IF NOT has_capability('customer_payments:create_schedule') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_wing NOT IN ('design', 'execution') OR p_part NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'invalid wing/part';
  END IF;

  SELECT scope INTO v_scope FROM projects WHERE id = p_project_id;
  IF v_scope = 'design_only' AND p_wing = 'execution' THEN
    RAISE EXCEPTION 'project % is design_only', p_project_id;
  END IF;

  -- Re-file the row into the destination group, then renumber everything.
  UPDATE payment_schedule
     SET wing = p_wing, part = p_part
   WHERE id = p_schedule_id
     AND project_id = p_project_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone % not found on project %', p_schedule_id, p_project_id;
  END IF;

  -- Rank the OTHER rows within their own group first (0-based), so the moved
  -- row's p_target_index is on the same scale. Comparing p_target_index against
  -- raw sequence_order would be wrong: sequence_order is project-wide, while
  -- p_target_index counts only within the destination group.
  WITH ranked AS (
    SELECT
      id,
      wing,
      part,
      sequence_order,
      ROW_NUMBER() OVER (
        PARTITION BY wing, part ORDER BY sequence_order
      ) - 1 AS idx_in_group
    FROM payment_schedule
    WHERE project_id = p_project_id
      AND deleted_at IS NULL
      AND id <> p_schedule_id
  ),
  grouped AS (
    SELECT
      id,
      wing,
      part,
      -- The moved row sorts at p_target_index; ties break in its favour (*2 vs
      -- *2+1 puts it just BEFORE the row currently at that index).
      ROW_NUMBER() OVER (
        PARTITION BY wing, part
        ORDER BY sort_key, sequence_order
      ) AS pos_in_group
    FROM (
      SELECT id, wing, part, sequence_order, idx_in_group * 2 + 1 AS sort_key
        FROM ranked
      UNION ALL
      SELECT id, wing, part, sequence_order, p_target_index * 2 AS sort_key
        FROM payment_schedule
       WHERE id = p_schedule_id
    ) s
  ),
  ordered AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE wing WHEN 'design' THEN 0 ELSE 1 END,
          CASE part WHEN 'a' THEN 0 ELSE 1 END,
          pos_in_group
      ) AS new_order
    FROM grouped
  )
  UPDATE payment_schedule ps
     SET sequence_order = o.new_order
    FROM ordered o
   WHERE ps.id = o.id
     AND ps.sequence_order IS DISTINCT FROM o.new_order;
END;
$$;

-- Renumber the project's active milestones into canonical wing/part order.
-- Called after an insert-between so sequence_order has no gaps or duplicates.
CREATE OR REPLACE FUNCTION resequence_payment_schedule(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT has_capability('customer_payments:create_schedule') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH ordered AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE wing WHEN 'design' THEN 0 ELSE 1 END,
          CASE part WHEN 'a' THEN 0 ELSE 1 END,
          sequence_order
      ) AS new_order
    FROM payment_schedule
    WHERE project_id = p_project_id
      AND deleted_at IS NULL
  )
  UPDATE payment_schedule ps
     SET sequence_order = o.new_order
    FROM ordered o
   WHERE ps.id = o.id
     AND ps.sequence_order IS DISTINCT FROM o.new_order;
END;
$$;

-- Insert a milestone at a given position inside a (wing, part) group.
-- Opens the slot by pushing later rows down, then resequences.
CREATE OR REPLACE FUNCTION insert_payment_milestone_at(
  p_project_id     uuid,
  p_wing           text,
  p_part           text,
  p_after_order    int,          -- insert AFTER this sequence_order; 0 = first in group
  p_milestone_name text,
  p_amount_due     numeric,
  p_due_date       date,
  p_notes          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_id uuid;
  v_slot   int;
BEGIN
  IF NOT has_capability('customer_payments:create_schedule') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_wing NOT IN ('design', 'execution') OR p_part NOT IN ('a', 'b') THEN
    RAISE EXCEPTION 'invalid wing/part';
  END IF;

  -- Push every row at or after the slot down by one, in a single statement.
  v_slot := GREATEST(p_after_order, 0) + 1;

  UPDATE payment_schedule
     SET sequence_order = sequence_order + 1
   WHERE project_id = p_project_id
     AND deleted_at IS NULL
     AND sequence_order >= v_slot;

  INSERT INTO payment_schedule
    (project_id, milestone_name, amount_due, due_date, sequence_order, notes, wing, part)
  VALUES
    (p_project_id, p_milestone_name, p_amount_due, p_due_date, v_slot, p_notes, p_wing, p_part)
  RETURNING id INTO v_new_id;

  -- Collapse any gap the push left and enforce canonical wing/part ordering.
  PERFORM resequence_payment_schedule(p_project_id);

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_payment_milestone(uuid, uuid, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION resequence_payment_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_payment_milestone_at(uuid, text, text, int, text, numeric, date, text) TO authenticated;

-- ── 6. Expose wing/part through the payments view ────────────────────────
-- CREATE OR REPLACE cannot insert columns mid-list ("cannot change name of
-- view column"), so the view is dropped and rebuilt. Nothing depends on it in
-- SQL — callers are PostgREST selects — so DROP is safe without CASCADE.
DROP VIEW IF EXISTS v_payment_status;

CREATE VIEW v_payment_status AS
SELECT
  ps.id              AS schedule_id,
  ps.tenant_id,
  ps.project_id,
  ps.milestone_name,
  ps.amount_due,
  ps.due_date,
  ps.sequence_order,
  ps.wing,
  ps.part,
  ps.notes,
  ps.is_paid,
  ps.triggered_at,
  ps.deleted_at,
  ps.created_at,
  ps.updated_at,
  COALESCE(SUM(pr.amount_paid), 0)                AS amount_received,
  COALESCE(SUM(pr.amount_paid), 0) - ps.amount_due AS variance
FROM payment_schedule ps
LEFT JOIN payment_records pr ON pr.payment_schedule_id = ps.id
WHERE ps.deleted_at IS NULL
GROUP BY ps.id;

-- DROP discarded the grants from 028 and 999_zz — both are restored here.
GRANT SELECT ON v_payment_status TO authenticated;
GRANT SELECT ON v_payment_status TO service_role;
