-- 039_personal_reminders.sql
-- Personal calendar reminders for team members (private, in-app notification only)

BEGIN;

CREATE TABLE IF NOT EXISTS personal_reminders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  reminder_at  timestamptz NOT NULL,
  type         text        NOT NULL DEFAULT 'other' CHECK (type IN ('meeting','deadline','other')),
  is_done      boolean     NOT NULL DEFAULT false,
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_personal_reminders_user   ON personal_reminders(user_id, is_done);
CREATE INDEX idx_personal_reminders_due    ON personal_reminders(reminder_at) WHERE is_done = false;

-- Auto-set done_at
CREATE OR REPLACE FUNCTION handle_personal_reminder_done()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_done AND NOT OLD.is_done THEN
    NEW.done_at := now();
  ELSIF NOT NEW.is_done AND OLD.is_done THEN
    NEW.done_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER personal_reminder_before_update
  BEFORE UPDATE ON personal_reminders
  FOR EACH ROW EXECUTE FUNCTION handle_personal_reminder_done();

ALTER TABLE personal_reminders ENABLE ROW LEVEL SECURITY;

-- Strictly private — only the owner of the row
CREATE POLICY "member_own_reminders"
  ON personal_reminders FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
