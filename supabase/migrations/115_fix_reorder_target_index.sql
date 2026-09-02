-- 115: Fix reorder_payment_milestone's target-index scale.
--
-- Bug in 114: the moved row's desired position was compared against the other
-- rows' raw `sequence_order`, which is PROJECT-WIDE, while p_target_index counts
-- only within the destination (wing, part) group. Moving a row to index 2 of a
-- 3-row group landed it at index 1 — the row went to the wrong slot whenever the
-- group did not start at sequence_order 1, i.e. for every group after the first.
--
-- Fix: rank the other rows within their own group (0-based) before comparing, so
-- both sides of the ORDER BY are on the same scale.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

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

GRANT EXECUTE ON FUNCTION reorder_payment_milestone(uuid, uuid, text, text, int) TO authenticated;
