-- 130 · Site engineer expenses need no approval.
--
-- Client rule: nothing a site engineer records goes through sign-off. Until now
-- only category = 'materials' skipped approval (in the API). This moves the rule
-- into the database so every insert path obeys it: any expense whose recorder
-- is a site engineer is stored as approved, approved_by = the recorder.
--
-- Backfill: existing pending site-engineer expenses are approved the same way.
-- The BEFORE UPDATE trigger (016) stamps approved_by = auth.uid(), which is NULL
-- in a migration, so a second UPDATE sets it to the recorder (status unchanged,
-- so that trigger lets it through).
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE OR REPLACE FUNCTION auto_approve_site_engineer_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = NEW.recorded_by AND role = 'site_engineer') THEN
    NEW.approval_status  := 'approved';
    NEW.approved_by      := COALESCE(NEW.approved_by, NEW.recorded_by);
    NEW.approved_at      := COALESCE(NEW.approved_at, now());
    NEW.rejection_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_auto_approve_site_engineer ON expenses;
CREATE TRIGGER trg_expenses_auto_approve_site_engineer
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION auto_approve_site_engineer_expense();

-- Backfill pending rows.
WITH pending AS (
  SELECT e.id FROM expenses e JOIN users u ON u.id = e.recorded_by
   WHERE u.role = 'site_engineer' AND e.approval_status = 'pending'
)
UPDATE expenses SET approval_status = 'approved'
 WHERE id IN (SELECT id FROM pending);

UPDATE expenses e
   SET approved_by = e.recorded_by
  FROM users u
 WHERE u.id = e.recorded_by
   AND u.role = 'site_engineer'
   AND e.approval_status = 'approved'
   AND e.approved_by IS NULL;
