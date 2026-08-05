-- 094: site engineers get tenant-wide bridge access
--
-- Why: the Bridge (coordination) page listed only a member's assigned projects,
-- while migration 089 had already granted project:view_all to every non-owner.
-- The UI was narrower than the permission, which read to the client as broken.
--
-- 089 fixed project visibility but not bridge_messages. bridge_select (021)
-- gates on has_capability('bridge:read', project_id) OR is_assigned_to_project().
-- All 14 team members already hold bridge:read tenant-wide via
-- TEAM_MEMBER_CAPABILITIES; the 4 site engineers hold neither, so widening the
-- dropdown alone would have shown them every project and then returned an empty
-- thread on any project they were not assigned to — a silent failure, worse than
-- the restriction it replaced.
--
-- Grants are scope_project_id = NULL (tenant-wide) and source='manual', so they
-- appear in the Access Matrix and the owner can revoke them per user. Tag sync
-- (065) never touches source='manual' rows.

-- tenant_id is NOT NULL and no BEFORE INSERT trigger populates it on this table,
-- so it is taken from the target user's own row rather than left to a default.
INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, scope_project_id, source)
SELECT u.tenant_id, u.id, c.capability, true, NULL, 'manual'
FROM users u
CROSS JOIN (VALUES ('bridge:read'), ('bridge:write')) AS c(capability)
WHERE u.role = 'site_engineer'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_capabilities uc
    WHERE uc.user_id = u.id
      AND uc.capability = c.capability
      AND uc.scope_project_id IS NULL
  );
