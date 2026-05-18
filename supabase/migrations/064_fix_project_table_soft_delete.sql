-- 064: Fix project_tables soft-delete (real root cause)
--
-- Migration 058 fixed the UPDATE policy's WITH CHECK, but the soft-delete
-- UPDATE still fails RLS: Postgres also enforces the SELECT policy's USING
-- ('deleted_at IS NULL') against the post-update row. Setting deleted_at to a
-- non-null value makes the new row fail the SELECT policy, reported as
-- "new row violates row-level security policy for table project_tables".
--
-- Fix: soft-delete through a SECURITY DEFINER function (bypasses RLS for the
-- write) that itself enforces the project_table:edit capability. Mirrors the
-- delete_table_column() pattern from migration 063.

CREATE OR REPLACE FUNCTION soft_delete_project_table(p_project_id uuid, p_table_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_capability('project_table:edit') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE project_tables
  SET deleted_at = now()
  WHERE id = p_table_id
    AND project_id = p_project_id
    AND deleted_at IS NULL
    AND tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
  RETURNING id INTO v_id;

  RETURN v_id; -- NULL when nothing matched (not found / already deleted)
END;
$$;
