-- 065_tag_capability_sync.sql
-- Make team_member_tags actually drive permissions: assigning a tag now writes
-- the tag's capability set into user_capabilities so has_capability() / RLS honor it.
--
-- NOTE: the tag -> capability mapping below mirrors TAG_CAPABILITIES in
-- lib/auth/capabilities.ts. Keep the two in sync when capabilities change.

BEGIN;

-- Distinguish tag-derived grants from manually-granted ones, so removing a tag
-- never deletes a capability the Owner granted by hand.
ALTER TABLE user_capabilities
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'tag'));

-- Returns the capability set for a tag. Mirrors TAG_CAPABILITIES.
-- accountant = every capability except access_control:manage.
-- admin      = accountant minus all finance / payments capabilities.
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
      ('office_attendance:view_all')
    ) AS pm(cap)
   WHERE p_tag = 'project_manager';
$$;

-- AFTER INSERT on team_member_tags: grant the tag's capability set.
CREATE OR REPLACE FUNCTION apply_tag_capabilities()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_cap text;
BEGIN
  FOR v_cap IN SELECT tag_capability_set(NEW.tag) LOOP
    IF EXISTS (
      SELECT 1 FROM user_capabilities
       WHERE user_id = NEW.user_id AND capability = v_cap
         AND scope_project_id IS NULL
    ) THEN
      UPDATE user_capabilities
         SET granted = true
       WHERE user_id = NEW.user_id AND capability = v_cap
         AND scope_project_id IS NULL
         AND source = 'tag';
    ELSE
      INSERT INTO user_capabilities
        (tenant_id, user_id, capability, granted, scope_project_id, granted_by, source)
      VALUES
        (NEW.tenant_id, NEW.user_id, v_cap, true, NULL, NEW.granted_by, 'tag');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- AFTER DELETE on team_member_tags: drop tag-sourced capabilities no longer
-- backed by any remaining tag on that user.
CREATE OR REPLACE FUNCTION revoke_tag_capabilities()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM user_capabilities uc
   WHERE uc.user_id = OLD.user_id
     AND uc.source = 'tag'
     AND uc.scope_project_id IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM team_member_tags t
        WHERE t.user_id = OLD.user_id
          AND uc.capability IN (SELECT tag_capability_set(t.tag))
     );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_apply_tag_capabilities
  AFTER INSERT ON team_member_tags
  FOR EACH ROW EXECUTE FUNCTION apply_tag_capabilities();

CREATE TRIGGER trg_revoke_tag_capabilities
  AFTER DELETE ON team_member_tags
  FOR EACH ROW EXECUTE FUNCTION revoke_tag_capabilities();

-- Backfill: apply capabilities for tags already assigned before this migration.
INSERT INTO user_capabilities
  (tenant_id, user_id, capability, granted, scope_project_id, granted_by, source)
SELECT t.tenant_id, t.user_id, c.cap, true, NULL, t.granted_by, 'tag'
  FROM team_member_tags t
  CROSS JOIN LATERAL tag_capability_set(t.tag) AS c(cap)
 WHERE NOT EXISTS (
   SELECT 1 FROM user_capabilities uc
    WHERE uc.user_id = t.user_id AND uc.capability = c.cap
      AND uc.scope_project_id IS NULL
 );

COMMIT;
