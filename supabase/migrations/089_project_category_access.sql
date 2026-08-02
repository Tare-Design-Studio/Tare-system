-- 089: Universal project access with an optional per-category override.
--
-- Client request #3: team members should see all projects, with "categories to
-- project access as type of projects" as a way to narrow that.
--
-- Approach — deliberately NOT a rewrite of the projects RLS policy:
--   `project:view_all` already exists (013) and already grants tenant-wide
--   visibility. Universal access is therefore a capability grant, not new
--   policy logic. This migration adds only the *narrowing* half: when a member
--   has rows in `user_project_categories`, their view_all is restricted to
--   those project_type values. No rows = unrestricted (the default).
--
--   Rewriting the base policy was the alternative and was rejected: every
--   child-table policy (checkpoints, expenses, updates, tables, media …) leans
--   on the same `has_capability(...) OR is_assigned_to_project(...)` shape, and
--   diverging one of them silently widens tenancy. The filter is expressed as
--   an ADDITIONAL restrictive policy instead, which can only ever subtract.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS user_project_categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_type project_type NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_type)
);

CREATE INDEX IF NOT EXISTS idx_upc_user ON user_project_categories(user_id);

COMMENT ON TABLE user_project_categories IS
  'Optional narrowing of project:view_all. A user with no rows here sees every project in the tenant; with rows, only those project types. Never widens access.';

DROP TRIGGER IF EXISTS upc_set_tenant ON user_project_categories;
CREATE TRIGGER upc_set_tenant
  BEFORE INSERT ON user_project_categories
  FOR EACH ROW EXECUTE FUNCTION set_tenant_from_user();

ALTER TABLE user_project_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_project_categories FORCE ROW LEVEL SECURITY;

-- Members may read their own restrictions (so the UI can explain what they see).
CREATE POLICY upc_select_own ON user_project_categories FOR SELECT
  USING (user_id = auth.uid() AND tenant_id = current_user_tenant_id());

CREATE POLICY upc_select_admin ON user_project_categories FOR SELECT
  USING (has_capability('access_control:manage') AND tenant_id = current_user_tenant_id());

-- Only access-control managers may change who sees what. A member editing their
-- own row would be self-granting visibility.
CREATE POLICY upc_write_admin ON user_project_categories FOR ALL
  USING (has_capability('access_control:manage') AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_capability('access_control:manage') AND tenant_id = current_user_tenant_id());

REVOKE ALL ON TABLE user_project_categories FROM anon;
GRANT SELECT ON TABLE user_project_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_project_categories TO service_role;

-- ── The narrowing predicate ────────────────────────────────────────

CREATE OR REPLACE FUNCTION project_type_visible(p_project_type project_type)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT
    -- No category rows for this user → unrestricted (universal access).
    NOT EXISTS (SELECT 1 FROM user_project_categories WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_project_categories
       WHERE user_id = auth.uid()
         AND project_type = p_project_type
    );
$$;

COMMENT ON FUNCTION project_type_visible(project_type) IS
  'True when the current user may see projects of this type. No configured categories means all types.';

-- RESTRICTIVE: ANDed with the existing permissive policies, so it can only
-- subtract visibility, never add it. Assigned members keep their own projects
-- regardless of category — being put on a job implies you may see it.
CREATE POLICY projects_category_restriction ON projects
  AS RESTRICTIVE FOR SELECT
  USING (
    project_type IS NULL
    OR project_type_visible(project_type)
    OR is_assigned_to_project(id)
  );

-- ── Universal access by default ────────────────────────────────────
--
-- Grant project:view_all to every existing non-owner member so "all team
-- members have access to all projects" is true immediately. source='manual'
-- keeps it visible and revocable in the Access Matrix rather than looking like
-- a tag-derived grant that a tag change would silently remove.

-- tenant_id is NOT NULL with no default here, so it is supplied explicitly
-- rather than relying on a BEFORE INSERT trigger. The unique index is
-- (user_id, capability, scope_project_id) and scope_project_id is NULL for a
-- global grant — NULLs are never equal, so ON CONFLICT would not fire. The
-- NOT EXISTS guard is what makes this idempotent.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, source)
SELECT u.tenant_id, u.id, 'project:view_all', true, 'manual'
  FROM users u
 WHERE u.deleted_at IS NULL
   AND u.role <> 'owner'
   AND NOT EXISTS (
     SELECT 1 FROM user_capabilities uc
      WHERE uc.user_id = u.id
        AND uc.capability = 'project:view_all'
        AND uc.scope_project_id IS NULL
   );
