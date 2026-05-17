-- Phase 4 · Enquiries, remarks, reminders, intake
-- Note: sync_reminder_to_calendar trigger is in 024 (needs calendar_events to exist).

-- ─────────────────────────────────────────────────────────────
-- enquiries
-- ─────────────────────────────────────────────────────────────

CREATE TABLE enquiries (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid        NOT NULL REFERENCES tenants(id),
  name                      text        NOT NULL,
  phone                     text,
  phone_normalized          text,       -- E.164, set in app layer via libphonenumber-js
  email                     text,
  source                    text        CHECK (source IN (
                                          'referral','website','whatsapp',
                                          'instagram','youtube','walk_in','other'
                                        )),
  status                    text        NOT NULL DEFAULT 'new'
                                        CHECK (status IN (
                                          'new','quotation_sent','awaiting_approval',
                                          'closed_for_discussion','converted','lost'
                                        )),
  message                   text,
  created_via               text        NOT NULL DEFAULT 'manual'
                                        CHECK (created_via IN ('manual','public_form')),
  referrer_url              text,
  ip_address                inet,
  converted_to_customer_id  uuid,       -- FK added below after customers table exists
  created_by                uuid        REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiries_tenant      ON enquiries(tenant_id);
CREATE INDEX idx_enquiries_status      ON enquiries(tenant_id, status);
CREATE INDEX idx_enquiries_phone_norm  ON enquiries(phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- enquiry_remarks
-- ─────────────────────────────────────────────────────────────

CREATE TABLE enquiry_remarks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  enquiry_id  uuid        NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  remark      text        NOT NULL,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enquiry_remarks_enquiry ON enquiry_remarks(enquiry_id);

-- ─────────────────────────────────────────────────────────────
-- enquiry_reminders
-- Category column included now (F5 from implementation plan).
-- sync_reminder_to_calendar trigger attached in 024.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE enquiry_reminders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  enquiry_id  uuid        REFERENCES enquiries(id) ON DELETE CASCADE,
  customer_id uuid,       -- FK added below after customers table constraint chain
  user_id     uuid        NOT NULL REFERENCES users(id),
  remind_at   timestamptz NOT NULL,
  message     text,
  category    text        NOT NULL DEFAULT 'other'
                          CHECK (category IN (
                            'meeting','quotation','drawing',
                            'call','follow_up','site_visit','other'
                          )),
  priority    text        CHECK (priority IN ('low','normal','high','critical')),
  is_done     boolean     NOT NULL DEFAULT false,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of enquiry_id or customer_id must be set.
  CONSTRAINT enquiry_reminders_xor_chk CHECK (
    (enquiry_id IS NULL) <> (customer_id IS NULL)
  )
);

CREATE INDEX idx_enquiry_reminders_enquiry   ON enquiry_reminders(enquiry_id)
  WHERE enquiry_id IS NOT NULL;
CREATE INDEX idx_enquiry_reminders_customer  ON enquiry_reminders(customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX idx_enquiry_reminders_due       ON enquiry_reminders(tenant_id, remind_at)
  WHERE is_done = false;

-- Trigger: mark done_at when is_done flips true
CREATE OR REPLACE FUNCTION set_reminder_done_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_done AND NOT OLD.is_done THEN
    NEW.done_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reminder_done_at
  BEFORE UPDATE ON enquiry_reminders
  FOR EACH ROW EXECUTE FUNCTION set_reminder_done_at();

-- ─────────────────────────────────────────────────────────────
-- enquiry_intake
-- Single row per tenant; drives the public form URL.
-- Seed row for Tare Design Studio inserted here.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE enquiry_intake (
  tenant_id               uuid    PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  intake_slug             text    UNIQUE NOT NULL,
  is_enabled              boolean NOT NULL DEFAULT true,
  rotated_at              timestamptz NOT NULL DEFAULT now(),
  ip_rate_limit_per_hour  int     NOT NULL DEFAULT 5,
  phone_soft_block_hours  int     NOT NULL DEFAULT 24
);

-- Seed: Tare Design Studio intake form
INSERT INTO enquiry_intake (tenant_id, intake_slug)
SELECT id, 'tare-design-studio'
FROM   tenants
WHERE  slug = 'tare-design-studio'
ON CONFLICT (tenant_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Deferred FKs
-- ─────────────────────────────────────────────────────────────

-- enquiries.converted_to_customer_id → customers(id)
ALTER TABLE enquiries
  ADD CONSTRAINT enquiries_converted_to_customer_id_fk
  FOREIGN KEY (converted_to_customer_id) REFERENCES customers(id);

-- customers.created_from_enquiry_id → enquiries(id)
ALTER TABLE customers
  ADD CONSTRAINT customers_created_from_enquiry_id_fk
  FOREIGN KEY (created_from_enquiry_id) REFERENCES enquiries(id);

-- enquiry_reminders.customer_id → customers(id)
ALTER TABLE enquiry_reminders
  ADD CONSTRAINT enquiry_reminders_customer_id_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
