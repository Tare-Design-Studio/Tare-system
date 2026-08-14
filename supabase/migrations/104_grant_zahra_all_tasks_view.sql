-- 104_grant_zahra_all_tasks_view.sql
-- Give Zahra Bathool the firm-wide task view: every member's tasks, and who
-- assigned what to whom — the view the owner has today.
--
-- Two capabilities are needed, not one, because the page gate and RLS check
-- different things:
--   member_tasks:view_all — what app/(app)/tasks/page.tsx gates the widened
--     view on (see 104's companion change). Appears in no RLS policy.
--   daily_tasks:view_all  — what actually admits the rows. Policy
--     owner_view_member_tasks (038) checks this one. Without it the tab renders
--     and returns zero rows.
-- Granting only the first would produce an empty tab, so both are granted.
--
-- NOT granted here: access_control:manage. Trigger trg_cap_access_control (004)
-- rejects it for non-owners by design, and Zahra is a team_member. Delegating it
-- requires dropping that tenant-wide invariant or promoting her to owner —
-- an explicit decision, not a side effect of this migration.
--
-- source='manual' so a future tag change never silently revokes these.
-- Rollback: DELETE FROM user_capabilities WHERE user_id = (that id)
--   AND capability IN ('member_tasks:view_all','daily_tasks:view_all')
--   AND source = 'manual';

BEGIN;

INSERT INTO user_capabilities
  (tenant_id, user_id, capability, granted, scope_project_id, granted_by, source)
SELECT u.tenant_id, u.id, c.cap, true, NULL, NULL, 'manual'
  FROM users u
 CROSS JOIN (VALUES ('member_tasks:view_all'), ('daily_tasks:view_all')) AS c(cap)
 WHERE u.id = '1e01d00e-f41a-4b33-b280-3e1c40243701'
   AND u.deleted_at IS NULL
ON CONFLICT (user_id, capability, scope_project_id)
  DO UPDATE SET granted = true;

COMMIT;
