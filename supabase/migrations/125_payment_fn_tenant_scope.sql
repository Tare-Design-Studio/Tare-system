-- 125: Tenant-scope the payment-schedule helpers from 114/115.
--
-- Same vulnerability class as 123, fixed for checkpoints in 124. These three
-- functions are SECURITY DEFINER (so RLS does not apply inside them) and gated
-- only on has_capability('customer_payments:create_schedule'), which checks the
-- CALLER's own tenant and never inspects p_project_id's. A holder of that
-- capability in one tenant could reorder and insert payment milestones on
-- another tenant's project by passing a foreign project id.
--
-- Confirmed by probe before this fix: an attacker in tenant A successfully ran
-- reorder_payment_milestone and insert_payment_milestone_at against a project
-- in tenant B.
--
-- Bodies below are copied from the LIVE definitions (pg_get_functiondef), not
-- reconstructed from the 114/115 text — CREATE OR REPLACE rewrites the whole
-- function, so any drift between file and installed state would be silently
-- reverted. Only the guard at the top of each differs: the bare capability
-- check is replaced by assert_can_edit_payments(), which checks capability AND
-- tenant together.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- Payments analogue of assert_can_edit_project (124). Reports a foreign project
-- as 'not found' so the error cannot be used to probe other tenants' ids.
CREATE OR REPLACE FUNCTION assert_can_edit_payments(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_mine   uuid := auth_tenant_id();
BEGIN
  IF NOT has_capability('customer_payments:create_schedule') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT tenant_id INTO v_tenant
    FROM projects
   WHERE id = p_project_id
     AND deleted_at IS NULL;

  IF v_tenant IS NULL OR v_mine IS NULL OR v_tenant <> v_mine THEN
    RAISE EXCEPTION 'project % not found', p_project_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION assert_can_edit_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assert_can_edit_payments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.resequence_payment_schedule(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM assert_can_edit_payments(p_project_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.reorder_payment_milestone(p_project_id uuid, p_schedule_id uuid, p_wing text, p_part text, p_target_index integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_scope text;
BEGIN
  PERFORM assert_can_edit_payments(p_project_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.insert_payment_milestone_at(p_project_id uuid, p_wing text, p_part text, p_after_order integer, p_milestone_name text, p_amount_due numeric, p_due_date date, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_new_id uuid;
  v_slot   int;
BEGIN
  PERFORM assert_can_edit_payments(p_project_id);

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
$function$;
-- DROP/CREATE inside CREATE OR REPLACE does not touch grants, but 114's were
-- attached to the same signatures — restated so a future reader sees them.
GRANT EXECUTE ON FUNCTION reorder_payment_milestone(uuid, uuid, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION resequence_payment_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_payment_milestone_at(uuid, text, text, int, text, numeric, date, text) TO authenticated;
