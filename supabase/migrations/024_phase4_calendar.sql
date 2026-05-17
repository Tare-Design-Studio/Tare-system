-- Phase 4 · calendar_events + sync_reminder_to_calendar trigger
-- Trigger placed here (not in 023) because it INSERT INTO calendar_events.

-- ─────────────────────────────────────────────────────────────
-- calendar_events
-- ─────────────────────────────────────────────────────────────

CREATE TABLE calendar_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  project_id       uuid        REFERENCES projects(id),
  enquiry_id       uuid        REFERENCES enquiries(id),
  customer_id      uuid        REFERENCES customers(id),
  title            text        NOT NULL,
  description      text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  visibility       text        NOT NULL DEFAULT 'project'
                               CHECK (visibility IN (
                                 'private_owner','assigned_user','project','tenant'
                               )),
  assigned_user_id uuid        REFERENCES users(id),
  source_type      text,       -- 'task','reminder','checkpoint','payment_due','meeting'
  source_id        uuid,
  created_by       uuid        REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- Visibility ↔ scope coherence (Section 3.8)
  CONSTRAINT calendar_events_visibility_scope_chk CHECK (
    CASE visibility
      WHEN 'private_owner'  THEN
        project_id IS NULL
        AND (enquiry_id IS NOT NULL OR customer_id IS NOT NULL)
      WHEN 'project'        THEN project_id IS NOT NULL
      WHEN 'assigned_user'  THEN assigned_user_id IS NOT NULL
      WHEN 'tenant'         THEN true
    END
  )
);

CREATE INDEX idx_calendar_events_tenant_time  ON calendar_events(tenant_id, starts_at);
CREATE INDEX idx_calendar_events_project      ON calendar_events(project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX idx_calendar_events_assigned     ON calendar_events(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- sync_reminder_to_calendar
-- Keeps calendar_events in sync with enquiry_reminders.
-- INSERT  → create private_owner event
-- UPDATE  → update title/time; if done and !completed_reminders_visible → delete event
-- DELETE  → remove linked event
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_reminder_to_calendar()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_title              text;
  v_person_name        text;
  v_keep_when_done     boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM calendar_events
      WHERE source_type = 'reminder' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Resolve person name from enquiry or customer
  IF NEW.enquiry_id IS NOT NULL THEN
    SELECT name INTO v_person_name FROM enquiries WHERE id = NEW.enquiry_id;
  ELSIF NEW.customer_id IS NOT NULL THEN
    SELECT name INTO v_person_name FROM customers WHERE id = NEW.customer_id;
  END IF;

  v_title := CASE
    WHEN v_person_name IS NOT NULL
    THEN v_person_name || ' — ' || COALESCE(NEW.message, 'Reminder')
    ELSE COALESCE(NEW.message, 'Reminder')
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO calendar_events (
      tenant_id, enquiry_id, customer_id, title, description,
      starts_at, visibility, source_type, source_id, created_by
    ) VALUES (
      NEW.tenant_id, NEW.enquiry_id, NEW.customer_id, v_title, NEW.category,
      NEW.remind_at, 'private_owner', 'reminder', NEW.id, NEW.user_id
    );
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.is_done AND NOT OLD.is_done THEN
    SELECT completed_reminders_visible INTO v_keep_when_done
      FROM tenants WHERE id = NEW.tenant_id;
    IF NOT COALESCE(v_keep_when_done, false) THEN
      DELETE FROM calendar_events
        WHERE source_type = 'reminder' AND source_id = NEW.id;
      RETURN NEW;
    END IF;
  END IF;

  UPDATE calendar_events SET
    title       = v_title,
    starts_at   = NEW.remind_at,
    description = NEW.category
  WHERE source_type = 'reminder' AND source_id = NEW.id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_reminder_to_calendar
  AFTER INSERT OR UPDATE OR DELETE ON enquiry_reminders
  FOR EACH ROW EXECUTE FUNCTION sync_reminder_to_calendar();
