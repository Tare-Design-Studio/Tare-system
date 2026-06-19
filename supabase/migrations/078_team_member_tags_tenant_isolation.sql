-- 078: Close cross-tenant IDOR on team_member_tags.
--
-- Bug: the owner_manage_tags policy (037) gates only on has_capability(
-- 'access_control:manage'). has_capability() checks the CALLER's capability in
-- the CALLER's own tenant (005_phase0_helpers.sql) but places NO predicate on
-- the target row's tenant_id. So an owner in tenant A could read/insert/delete
-- tag rows belonging to tenant B by passing a foreign user_id to
-- /api/team-member-tags. RLS was the only backstop and it did not scope tenant.
--
-- Fix: require the target row's tenant_id to equal the caller's tenant_id, using
-- the same predicate pattern as 008_phase0_rls_policies.sql. The API layer is
-- also patched to filter by tenant (defense in depth).
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT; no explicit txn here.

DROP POLICY IF EXISTS "owner_manage_tags" ON team_member_tags;

CREATE POLICY "owner_manage_tags"
  ON team_member_tags FOR ALL
  USING (
    has_capability('access_control:manage')
    AND tenant_id = (SELECT tenant_id FROM users u2 WHERE u2.id = auth.uid() AND u2.deleted_at IS NULL)
  )
  WITH CHECK (
    has_capability('access_control:manage')
    AND tenant_id = (SELECT tenant_id FROM users u2 WHERE u2.id = auth.uid() AND u2.deleted_at IS NULL)
  );
