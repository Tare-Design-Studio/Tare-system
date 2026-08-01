-- 081: Force RLS on every table that has RLS enabled (defense-in-depth).
--
-- ENABLE ROW LEVEL SECURITY does NOT apply to the table owner (nor to roles that
-- own/created the table) — they bypass every policy unless FORCE is also set.
-- This schema applied FORCE inconsistently (11 of 55 tables), so a query running
-- as the table owner silently ignored the policies on the other 44.
--
-- Single-tenant deployment: this is not about cross-tenant leakage, it is about
-- ensuring the owner/service-role path cannot bypass the capability and
-- soft-delete predicates that the policies encode.
--
-- Scope note: the upstream (multi-tenant) version of this migration keyed the
-- loop off `tenant_id`. Here we key off relrowsecurity instead — every table
-- that already declares RLS gets it enforced, which is the same intent without
-- assuming a tenancy column.
--
-- Idempotent: ALTER ... FORCE is a no-op when already forced, and the loop reads
-- the live catalog, so re-running covers tables added later.
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
    AND    c.relrowsecurity          -- RLS enabled
    AND    NOT c.relforcerowsecurity -- but not forced
    ORDER  BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
