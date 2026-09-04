-- 123: Reorderable / insertable / deletable progress milestones.
--
-- project_checkpoints has UNIQUE (project_id, sequence_order) from 011, but
-- unlike payment_schedule (027) it is NOT deferrable, so a renumber cannot pass
-- through a transient collision. Make it deferrable, then add the same three
-- helpers payment_schedule got in 114/115: reorder, resequence, insert-at.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── 1. Make the ordering constraint deferrable ───────────────────────────
-- The constraint from 011 is unnamed in the migration but Postgres names it
-- project_checkpoints_project_id_sequence_order_key by convention. Dropped and
-- re-added because a UNIQUE constraint's deferrability cannot be altered.
ALTER TABLE project_checkpoints
  DROP CONSTRAINT IF EXISTS project_checkpoints_project_id_sequence_order_key;

ALTER TABLE project_checkpoints
  ADD CONSTRAINT project_checkpoints_project_id_sequence_order_key
  UNIQUE (project_id, sequence_order) DEFERRABLE INITIALLY DEFERRED;

-- ── 2. Resequence ────────────────────────────────────────────────────────
-- Collapse gaps and duplicates into a dense 1..N ordering for one project.
CREATE OR REPLACE FUNCTION resequence_project_checkpoints(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT has_capability('project:edit') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sequence_order, created_at) AS new_order
    FROM project_checkpoints
    WHERE project_id = p_project_id
  )
  UPDATE project_checkpoints pc
     SET sequence_order = o.new_order
    FROM ordered o
   WHERE pc.id = o.id
     AND pc.sequence_order IS DISTINCT FROM o.new_order;
END;
$$;

-- ── 3. Reorder ───────────────────────────────────────────────────────────
-- Move one checkpoint to a 0-based position in the project's list. The whole
-- renumber is one statement, so the deferrable constraint only sees transient
-- collisions.
--
-- Progression (043) is deliberately not re-checked here: its trigger fires on
-- started_at / approved_at transitions, not on sequence_order, so reordering
-- around an already-completed milestone is allowed.
CREATE OR REPLACE FUNCTION reorder_project_checkpoint(
  p_project_id    uuid,
  p_checkpoint_id uuid,
  p_target_index  int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT has_capability('project:edit') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM project_checkpoints
     WHERE id = p_checkpoint_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'checkpoint % not found on project %', p_checkpoint_id, p_project_id;
  END IF;

  -- Rank the OTHER rows 0-based so p_target_index is on the same scale, then
  -- interleave the moved row at its requested slot: *2 vs *2+1 breaks the tie
  -- in the moved row's favour, placing it just BEFORE the row sitting there.
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sequence_order) - 1 AS idx
    FROM project_checkpoints
    WHERE project_id = p_project_id
      AND id <> p_checkpoint_id
  ),
  ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_key) AS new_order
    FROM (
      SELECT id, idx * 2 + 1 AS sort_key FROM ranked
      UNION ALL
      SELECT p_checkpoint_id, p_target_index * 2
    ) s
  )
  UPDATE project_checkpoints pc
     SET sequence_order = o.new_order
    FROM ordered o
   WHERE pc.id = o.id
     AND pc.sequence_order IS DISTINCT FROM o.new_order;
END;
$$;

-- ── 4. Insert at a position ──────────────────────────────────────────────
-- p_after_order = 0 inserts first; otherwise the new row lands directly after
-- that sequence_order. Later rows are pushed down in one statement.
CREATE OR REPLACE FUNCTION insert_project_checkpoint_at(
  p_project_id       uuid,
  p_after_order      int,
  p_name             text,
  p_due_date         date,
  p_requires_approval boolean DEFAULT false
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
  IF NOT has_capability('project:edit') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'checkpoint name is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'project % not found', p_project_id;
  END IF;

  v_slot := GREATEST(COALESCE(p_after_order, 0), 0) + 1;

  UPDATE project_checkpoints
     SET sequence_order = sequence_order + 1
   WHERE project_id = p_project_id
     AND sequence_order >= v_slot;

  INSERT INTO project_checkpoints
    (project_id, name, sequence_order, due_date, requires_approval)
  VALUES
    (p_project_id, btrim(p_name), v_slot, p_due_date, COALESCE(p_requires_approval, false))
  RETURNING id INTO v_new_id;

  PERFORM resequence_project_checkpoints(p_project_id);

  RETURN v_new_id;
END;
$$;

-- ── 5. Delete ────────────────────────────────────────────────────────────
-- project_checkpoints has no deleted_at column, so this is a hard delete.
-- checkpoint_items cascade; payment_schedule.triggers_payment_id is a FK the
-- other way (ON DELETE SET NULL on the checkpoint side) and is unaffected.
CREATE OR REPLACE FUNCTION delete_project_checkpoint(
  p_project_id    uuid,
  p_checkpoint_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT has_capability('project:edit') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM project_checkpoints
   WHERE id = p_checkpoint_id
     AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkpoint % not found on project %', p_checkpoint_id, p_project_id;
  END IF;

  PERFORM resequence_project_checkpoints(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION resequence_project_checkpoints(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_project_checkpoint(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_project_checkpoint_at(uuid, int, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_project_checkpoint(uuid, uuid) TO authenticated;
