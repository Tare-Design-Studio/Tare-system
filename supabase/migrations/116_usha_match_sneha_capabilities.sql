-- 115: Give Usha Naveen the tenant-wide capabilities Sneha K.M holds.
--
-- Asked for as "match Usha's capabilities to Sneha's" after Usha could not
-- approve tasks sent for review. NOTE: this does NOT fix that symptom, and was
-- applied as an explicit instruction rather than as a fix.
--
-- Why it does not: both already hold `tasks:assign`, granted, unscoped. The
-- reason Sneha can return verdicts and Usha cannot is per-task addressing, not
-- capability -- member_tasks.review_requested_to names Sneha on 53 rows and
-- Usha on 1. /api/member-tasks/[id] rejects a verdict from anyone but the named
-- reviewer, and ?scope=review hides those rows from everyone else. Widening
-- that is a separate decision; see PROJECT_STATE.
--
-- The three capabilities this actually adds are expenses:view, expenses:create
-- and daily_tasks:view_all -- a real widening of what Usha can see (project
-- expenses and every member's daily tasks), so it is worth being deliberate
-- about even though none of them touch review.
--
-- Written as a set difference against Sneha rather than a hardcoded list so it
-- stays correct if her grants changed between authoring and apply. Only
-- tenant-wide (scope_project_id IS NULL) granted rows are copied: project-scoped
-- grants belong to Sneha's project assignments and would not transfer meaningfully.

INSERT INTO user_capabilities (tenant_id, user_id, capability, granted, scope_project_id, source)
SELECT usha.tenant_id, usha.id, src.capability, true, NULL, 'manual'
FROM users usha
CROSS JOIN LATERAL (
  SELECT uc.capability
  FROM user_capabilities uc
  JOIN users sneha ON sneha.id = uc.user_id
  WHERE sneha.full_name = 'Sneha K.M'
    AND sneha.tenant_id = usha.tenant_id
    AND sneha.deleted_at IS NULL
    AND uc.granted = true
    AND uc.scope_project_id IS NULL
) AS src
WHERE usha.full_name = 'Usha Naveen'
  AND usha.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_capabilities have
    WHERE have.user_id = usha.id
      AND have.capability = src.capability
      AND have.scope_project_id IS NULL
  );

-- Usha keeps calendar:create_for_others, calendar:view_all and
-- project_table:create, which Sneha does not hold. "Match" is read as a union,
-- not a replacement -- revoking working access nobody complained about would be
-- a regression dressed up as symmetry.
