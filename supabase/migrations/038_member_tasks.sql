-- 038_member_tasks.sql
-- Persistent member-set tasks (not date-scoped; carry over until checked off)
-- Replaces the date-scoped team_daily_tasks for the team member dashboard.

BEGIN;

CREATE TABLE IF NOT EXISTS member_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  completed    boolean     NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_tasks_user      ON member_tasks(user_id, completed);
CREATE INDEX idx_member_tasks_tenant    ON member_tasks(tenant_id);

-- Auto-set completed_at and updated_at
CREATE OR REPLACE FUNCTION handle_member_task_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.completed AND NOT OLD.completed THEN
    NEW.completed_at := now();
  ELSIF NOT NEW.completed AND OLD.completed THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER member_task_before_update
  BEFORE UPDATE ON member_tasks
  FOR EACH ROW EXECUTE FUNCTION handle_member_task_update();

ALTER TABLE member_tasks ENABLE ROW LEVEL SECURITY;

-- Members manage their own tasks
CREATE POLICY "member_own_tasks"
  ON member_tasks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owner can view all member tasks in their tenant
CREATE POLICY "owner_view_member_tasks"
  ON member_tasks FOR SELECT
  USING (
    tenant_id = current_user_tenant_id()
    AND has_capability('daily_tasks:view_all')
  );

COMMIT;
