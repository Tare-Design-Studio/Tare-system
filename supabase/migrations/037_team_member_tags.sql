-- 037_team_member_tags.sql
-- Tag-based sub-roles for team members (accountant, admin, project_manager)
-- Tags grant additional capabilities beyond base team_member set.

BEGIN;

CREATE TABLE IF NOT EXISTS team_member_tags (
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid             NOT NULL REFERENCES tenants(id),
  user_id      uuid             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag          text             NOT NULL CHECK (tag IN ('accountant','admin','project_manager')),
  granted_by   uuid             REFERENCES users(id),
  granted_at   timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);

CREATE INDEX idx_team_member_tags_user   ON team_member_tags(user_id);
CREATE INDEX idx_team_member_tags_tenant ON team_member_tags(tenant_id);

ALTER TABLE team_member_tags ENABLE ROW LEVEL SECURITY;

-- Only owners can manage tags
CREATE POLICY "owner_manage_tags"
  ON team_member_tags FOR ALL
  USING (has_capability('access_control:manage'))
  WITH CHECK (has_capability('access_control:manage'));

-- Members can read their own tags
CREATE POLICY "member_read_own_tags"
  ON team_member_tags FOR SELECT
  USING (user_id = auth.uid());

-- Helper: check if current user has a specific tag
CREATE OR REPLACE FUNCTION has_member_tag(p_tag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_member_tags
    WHERE user_id = auth.uid() AND tag = p_tag
  );
$$;

COMMIT;
