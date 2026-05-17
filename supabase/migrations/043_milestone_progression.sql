-- Phase 10 · Milestone Progression (started_at + sequencing enforcement)
-- Adds started_at column for "Under Progress" (orange) state.
-- Enforces sequential progression: cannot start checkpoint N+1 until N is approved.

-- ── Add started_at column ─────────────────────────────────────────────
ALTER TABLE project_checkpoints ADD COLUMN started_at timestamptz NULL;

-- ── Enforce checkpoint progression ────────────────────────────────────
-- Rules:
--   1. Cannot set started_at if approved_at IS NOT NULL (already completed, locked).
--   2. Cannot set started_at if any earlier checkpoint (lower sequence_order) has approved_at IS NULL.
--   3. Cannot set approved_at if started_at IS NULL (must start before completing).
CREATE OR REPLACE FUNCTION enforce_checkpoint_progression()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_unapproved_before int;
BEGIN
  -- Rule 1: Cannot start an already-completed checkpoint
  IF NEW.started_at IS NOT NULL AND OLD.started_at IS NULL THEN
    IF OLD.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot start checkpoint % — already completed (approved_at set)', NEW.id;
    END IF;

    -- Rule 2: All earlier checkpoints must be approved
    SELECT COUNT(*) INTO v_unapproved_before
    FROM project_checkpoints
    WHERE project_id = NEW.project_id
      AND sequence_order < NEW.sequence_order
      AND approved_at IS NULL;

    IF v_unapproved_before > 0 THEN
      RAISE EXCEPTION 'Cannot start checkpoint % — % earlier checkpoint(s) not yet completed',
        NEW.id, v_unapproved_before;
    END IF;
  END IF;

  -- Rule 3: Cannot complete (approve) without starting first
  IF NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL THEN
    IF COALESCE(NEW.started_at, OLD.started_at) IS NULL THEN
      RAISE EXCEPTION 'Cannot complete checkpoint % — not yet started (started_at is NULL)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_checkpoint_progression
  BEFORE UPDATE ON project_checkpoints
  FOR EACH ROW EXECUTE FUNCTION enforce_checkpoint_progression();

-- ── Partial index for progression queries ─────────────────────────────
CREATE INDEX idx_checkpoints_progression
  ON project_checkpoints(project_id, sequence_order);

-- ── Update the v_project_checkpoint_status view to include started_at ─
-- DROP first because column order shifts with the new started_at column.
DROP VIEW IF EXISTS v_project_checkpoint_status;
CREATE VIEW v_project_checkpoint_status AS
SELECT
  pc.*,
  CASE
    WHEN pc.approved_at IS NOT NULL                    THEN 'complete'
    WHEN pc.started_at IS NOT NULL                     THEN 'in_progress'
    WHEN pc.due_date < CURRENT_DATE                    THEN 'overdue'
    ELSE                                                    'pending'
  END AS status
FROM project_checkpoints pc;

-- ── Update v_checkpoint_progress to include started_at ────────────────
DROP VIEW IF EXISTS v_checkpoint_progress;
CREATE VIEW v_checkpoint_progress AS
SELECT
  pc.id            AS checkpoint_id,
  pc.tenant_id,
  pc.project_id,
  pc.name,
  pc.sequence_order,
  pc.due_date,
  pc.started_at,
  pc.completed_at,
  pc.approved_at,
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
GROUP BY pc.id, pc.tenant_id, pc.project_id, pc.name,
         pc.sequence_order, pc.due_date, pc.started_at,
         pc.completed_at, pc.approved_at;
