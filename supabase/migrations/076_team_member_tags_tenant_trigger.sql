-- 076: Auto-populate team_member_tags.tenant_id on insert.
--
-- Bug: team_member_tags.tenant_id is NOT NULL but no trigger set it, and the tag API
-- (app/api/team-member-tags POST) inserts only { user_id, tag, granted_by }. Result:
-- "null value in column tenant_id ... violates not-null constraint" whenever an owner
-- grants a tag from the UI.
--
-- Fix: BEFORE INSERT trigger that derives tenant_id from the TARGET user (NEW.user_id).
-- Sourcing from the target user (not auth.uid()) is correct regardless of caller and
-- also works for service-role inserts where auth.uid() is null. A tag always belongs to
-- the same tenant as the user it is granted to.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT; no explicit transaction here.

CREATE OR REPLACE FUNCTION set_tenant_from_tag_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_tenant_id uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM users WHERE id = NEW.user_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'cannot resolve tenant_id for team_member_tags.user_id=%', NEW.user_id;
  END IF;
  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$$;

-- Must run BEFORE the existing tag-capability sync triggers fire on the row.
DROP TRIGGER IF EXISTS trg_set_tenant_from_tag_user ON team_member_tags;
CREATE TRIGGER trg_set_tenant_from_tag_user
  BEFORE INSERT ON team_member_tags
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_from_tag_user();
