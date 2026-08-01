-- 082: Make payment_schedule.is_paid genuinely derived on EVERY write path.
--
-- Bug: is_paid was only recomputed by a trigger on payment_records (027,
-- trg_payment_records_recompute). Nothing guarded payment_schedule itself, so a
-- direct UPDATE of payment_schedule.is_paid by a user with customer_payments:edit
-- persisted — a milestone could be marked PAID with ZERO recorded payments, and
-- it would then read as paid in the app, the customer portal (030/048/061) and
-- the unpaid-milestone push notifications (033).
--
-- Fix: a BEFORE UPDATE trigger on payment_schedule overwrites any client-supplied
-- is_paid with the value derived from actual payment_records
-- (SUM(amount_paid) >= amount_due). Client writes to the column are silently
-- ignored; the column is authoritative regardless of write path. INSERT keeps the
-- DEFAULT false (a brand-new schedule has no records yet); the records trigger
-- flips it when money is recorded.
--
-- Trigger order: triggers fire alphabetically. `trg_payment_schedule_force_is_paid`
-- sorts before the existing `..._set_tenant` and `..._touch` BEFORE UPDATE
-- triggers. Safe — this one only writes NEW.is_paid, which neither of those reads.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE OR REPLACE FUNCTION force_payment_is_paid_derived()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_received numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(amount_paid), 0) INTO v_received
    FROM payment_records
   WHERE payment_schedule_id = NEW.id;

  -- Ignore whatever the client put in NEW.is_paid; derive it.
  NEW.is_paid := (v_received >= NEW.amount_due);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_schedule_force_is_paid ON payment_schedule;

CREATE TRIGGER trg_payment_schedule_force_is_paid
  BEFORE UPDATE ON payment_schedule
  FOR EACH ROW EXECUTE FUNCTION force_payment_is_paid_derived();
