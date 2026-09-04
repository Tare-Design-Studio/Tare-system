-- 124: Tenant-scope the checkpoint helpers added in 123.
--
-- Bug in 123: the four functions are SECURITY DEFINER, so RLS does not apply
-- inside them, and their only gate was has_capability('project:edit'). That
-- checks the CALLER holds the capability in the caller's OWN tenant — it never
-- looks at which tenant p_project_id belongs to. A project:edit holder in one
-- tenant could therefore reorder, insert into, and delete another tenant's
-- progress milestones by passing a foreign project id, which the API routes
-- take straight from the URL.
--
-- Confirmed by probe before this fix: an attacker in tenant A reordered,
-- inserted into and deleted checkpoints on a project in tenant B.
--
-- Fix: resolve the project's tenant and require it to match the caller's own
-- before any mutation. Done in the DB rather than the routes so the guarantee
-- holds for every caller, not just the two routes that exist today.
--
-- The mismatch is reported as "not found", not "forbidden": a foreign project
-- id should be indistinguishable from a nonexistent one, so this cannot be used
-- to probe which project ids exist in other tenants.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

-- ── Caller's tenant ──────────────────────────────────────────────────────
-- No such helper existed. STABLE + SECURITY DEFINER to read users regardless of
-- the caller's RLS, matching has_capability (005).
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tenant_id
    FROM users
   WHERE id = auth.uid()
     AND is_active
     AND deleted_at IS NULL;
$$;

-- Raise unless p_project_id is a live project in the caller's own tenant AND
-- the caller holds project:edit. Both checks together, so no caller of the
-- four functions below can accidentally apply only one.
CREATE OR REPLACE FUNCTION assert_can_edit_project(p_project_id uuid)
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
  IF NOT has_capability('project:edit') THEN
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

-- ── Re-declare the four functions from 123 with the tenant gate ──────────
-- Bodies are otherwise unchanged from 123; only the guard at the top differs.

CREATE OR REPLACE FUNCTION resequence_project_checkpoints(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM assert_can_edit_project(p_project_id);

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
  PERFORM assert_can_edit_project(p_project_id);

  IF NOT EXISTS (
    SELECT 1 FROM project_checkpoints
     WHERE id = p_checkpoint_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'checkpoint % not found on project %', p_checkpoint_id, p_project_id;
  END IF;

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
  -- Also replaces 123's own projects lookup, which checked existence but not
  -- tenant.
  PERFORM assert_can_edit_project(p_project_id);

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'checkpoint name is required';
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
  PERFORM assert_can_edit_project(p_project_id);

  DELETE FROM project_checkpoints
   WHERE id = p_checkpoint_id
     AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkpoint % not found on project %', p_checkpoint_id, p_project_id;
  END IF;

  PERFORM resequence_project_checkpoints(p_project_id);
END;
$$;

-- auth_tenant_id and assert_can_edit_project are internal guards, not endpoints:
-- callable so the functions above can PERFORM them, but not granted to anon.
REVOKE ALL ON FUNCTION auth_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION assert_can_edit_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION assert_can_edit_project(uuid) TO authenticated;
