-- Phase 0 · RLS helper functions
-- All helpers use SECURITY DEFINER + search_path to prevent injection.

-- ── has_capability ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION has_capability(p_capability text, p_project_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_is_active boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT tenant_id, is_active
    INTO v_tenant_id, v_is_active
    FROM users
   WHERE id = v_user_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_capabilities
     WHERE user_id   = v_user_id
       AND capability = p_capability
       AND granted    = true
       AND tenant_id  = v_tenant_id
       AND (scope_project_id IS NULL OR scope_project_id = p_project_id)
  );
END;
$$;

-- ── is_assigned_to_project ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_assigned_to_project(p_project_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM project_assignments
     WHERE project_id = p_project_id
       AND user_id    = auth.uid()
  );
END;
$$;

-- ── project_in_stage ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION project_in_stage(p_project_id uuid, p_stage project_stage)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM projects
     WHERE id            = p_project_id
       AND current_stage = p_stage
       AND deleted_at    IS NULL
  );
END;
$$;

-- ── set_tenant_from_project (BEFORE INSERT trigger) ────────────────
-- Denormalises tenant_id onto every project-scoped child table.
CREATE OR REPLACE FUNCTION set_tenant_from_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM projects WHERE id = NEW.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', NEW.project_id;
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'tenant_id mismatch: supplied % but project belongs to %', NEW.tenant_id, v_tenant_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

-- ── set_tenant_from_user (BEFORE INSERT trigger) ───────────────────
CREATE OR REPLACE FUNCTION set_tenant_from_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = NEW.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user % not found', NEW.user_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

-- ── soft_delete helpers ────────────────────────────────────────────
-- Reusable: attach as BEFORE UPDATE trigger on any table with deleted_at.
CREATE OR REPLACE FUNCTION prevent_hard_delete_via_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Prevent resurrection of soft-deleted rows unless explicitly cleared by service role
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Cannot un-delete row; use the admin restore API';
  END IF;
  RETURN NEW;
END;
$$;
