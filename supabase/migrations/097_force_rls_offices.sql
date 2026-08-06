-- 097: Re-apply forced RLS to every table that has RLS enabled.
--
-- 081 did this across the whole schema, and its header notes that re-running
-- "covers tables added later" — but a migration only ever runs once, so any
-- table created after it starts unforced. `offices` (093) did exactly that:
-- ENABLE ROW LEVEL SECURITY with two correctly scoped policies, but no FORCE,
-- so a query running as the table owner bypassed both. The pgtap RLS coverage
-- guardrail caught it (offices: rls_on=t, forced=f).
--
-- Same catalog-driven loop as 081 rather than a single ALTER on `offices`: it
-- fixes the table that is wrong today and any sibling that drifted the same way.
--
-- Idempotent: ALTER ... FORCE is a no-op when already forced.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM   pg_class c
    JOIN   pg_namespace n ON n.oid = c.relnamespace
    WHERE  n.nspname = 'public'
    AND    c.relkind = 'r'
    AND    c.relrowsecurity
    AND    NOT c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'Forced RLS on %', r.relname;
  END LOOP;
END $$;
