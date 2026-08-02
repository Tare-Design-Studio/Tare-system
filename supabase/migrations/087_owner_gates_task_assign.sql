-- 087_owner_gates_task_assign.sql
-- Makes `tasks:assign` an OWNER-GRANTED capability instead of a tag-derived one.
--
-- Why: 083 put ('tasks:assign') inside tag_capability_set()'s all_caps block AND
-- inside the project_manager block, so applying an accountant / admin /
-- project_manager tag silently conferred the power to assign work and to sign
-- off on it. In this database that produced four non-owner holders:
--
--   Adarsha Pejavar  site_engineer  project_manager   (source=tag)
--   Divya J          team_member    admin             (source=tag)
--   Manasa Suresh    team_member    accountant        (source=tag)
--   Zahra Bathool    team_member    admin             (source=tag)
--
-- The owner never chose those individually — they came free with the tag. Review
-- is the control that decides whether work is clean/revision/error, and those
-- verdicts drive the KPI, so who holds it must be the owner's explicit call.
--
-- After this migration `tasks:assign` is grantable ONLY per-user, through the
-- Access Matrix (source='manual'). The capability itself, the RLS policies from
-- 083, and the self-review guard from 086 are all unchanged — this migration
-- narrows WHO gets the capability, never what it permits.
--
-- Rollback: re-add ('tasks:assign') to the two blocks in tag_capability_set()
-- and re-run 065's backfill. Nothing here drops a column or a policy.

BEGIN;

-- ============================================================
-- 1. Rewrite tag_capability_set() WITHOUT tasks:assign.
--    Byte-identical to 083's version except the two removed
--    ('tasks:assign') entries. Everything else is preserved so a
--    tag keeps granting exactly what it granted before.
-- ============================================================

CREATE OR REPLACE FUNCTION tag_capability_set(p_tag text)
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  WITH all_caps(cap) AS (
    VALUES
      ('project:create'),('project:edit'),('project:delete'),
      ('project:view_assigned'),('project:view_all'),('project:change_stage'),
      ('enquiry:view'),('enquiry:create'),('enquiry:edit'),
      ('enquiry:add_remark'),('enquiry:set_reminder'),
      ('customer:view'),('customer_payments:view'),('customer_payments:edit'),
      ('customer_payments:create_schedule'),
      ('team:create_user'),('team:edit_user'),('team:deactivate_user'),
      ('team:assign_to_project'),
      ('materials:plan'),('materials:consume'),('materials:view'),
      ('progress:update'),('progress:view'),('checklist:edit'),
      ('checkpoint:progress'),
      ('expenses:create'),('expenses:view'),('expenses:approve'),
      ('finance:view_dashboard'),('finance:export'),
      ('images:upload'),('images:view'),('images:select_for_customer'),
      ('bridge:read'),('bridge:write'),
      ('calendar:view_own'),('calendar:view_all'),('calendar:create_for_others'),
      ('daily_tasks:write_own'),('daily_tasks:view_all'),
      ('daily_tasks:export_own'),('daily_tasks:export_all'),
      ('broadcast:create'),('broadcast:receive'),
      ('site_check_in:write'),('site_check_in:view_all'),
      ('site_check_in:override_geofence'),
      ('office_attendance:write_own'),('office_attendance:view_all'),
      ('office_attendance:configure'),
      ('member_tasks:write_own'),('member_tasks:view_all'),
      -- ('tasks:assign') deliberately REMOVED — owner-granted only (087).
      ('personal_reminders:write_own'),
      ('team_member_tags:manage'),
      ('project_table:view'),('project_table:edit'),('project_table:create'),
      ('table_preset:manage'),
      ('intake_form:configure'),
      ('audit_log:view'),('audit_log:export')
  ),
  finance_caps(cap) AS (
    VALUES
      ('finance:view_dashboard'),('finance:export'),
      ('expenses:create'),('expenses:view'),('expenses:approve'),
      ('customer_payments:view'),('customer_payments:edit'),
      ('customer_payments:create_schedule')
  )
  SELECT cap FROM all_caps
   WHERE p_tag = 'accountant'
      OR (p_tag = 'admin' AND cap NOT IN (SELECT cap FROM finance_caps))
  UNION
  SELECT cap FROM (VALUES
      ('project:create'),('project:edit'),('project:change_stage'),
      ('project:view_all'),('team:assign_to_project'),
      ('expenses:view'),('expenses:approve'),('checkpoint:progress'),
      ('customer:view'),('customer_payments:view'),
      ('daily_tasks:view_all'),('member_tasks:view_all'),
      -- ('tasks:assign') deliberately REMOVED — owner-granted only (087).
      ('office_attendance:view_all')
    ) AS pm(cap)
   WHERE p_tag = 'project_manager';
$$;

-- ============================================================
-- 2. Revoke the tag-derived grants that already exist.
--    source='manual' rows are the owner's own decisions and are
--    left untouched — including the owner's own grant.
-- ============================================================

DELETE FROM user_capabilities
 WHERE capability = 'tasks:assign'
   AND source = 'tag';

COMMIT;
