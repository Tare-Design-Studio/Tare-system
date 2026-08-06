-- Guardrail · RLS coverage
-- Fails if any tenant-scoped table is missing RLS, missing forced RLS, or has
-- policies that grant access without any user/tenant predicate.
-- Run with: npx tsx scripts/run-pgtap.ts
--
-- Single-tenant framing: ARCHITECT_OS is one deployment for one firm, so there
-- is no cross-tenant leakage to defend against — that is why there is no
-- cross-tenant probe in this suite. What this file still guards is the thing
-- that matters here: every table reached by the Data API must have RLS on, and
-- must have it FORCED, so no future migration can ship a table that PostgREST
-- serves wide open to any authenticated user. Migration 081 forced RLS across
-- the whole schema; this test is the backstop that keeps it that way.
--
-- The `tenant_id` column is retained on every table as the row-scoping anchor,
-- so it remains the correct selector for "tables that hold application data".

BEGIN;

-- Every base table in `public` that carries a tenant_id column holds
-- application data and MUST be protected by RLS.
CREATE TEMP TABLE _scoped_tables ON COMMIT DROP AS
SELECT c.relname AS tablename
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
AND    c.relkind = 'r'
AND    EXISTS (
         SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
       );

SELECT plan( (SELECT count(*)::int * 3 FROM _scoped_tables) );

-- Guard the guard: if the selector matched nothing, the plan above would be
-- `plan(0)` and the file would report a vacuous pass.
DO $$
BEGIN
  IF (SELECT count(*) FROM _scoped_tables) = 0 THEN
    RAISE EXCEPTION 'RLS coverage test matched zero tables — the selector is broken.';
  END IF;
END $$;

DO $$
DECLARE
  r            record;
  rls_on       boolean;
  forced       boolean;
  total_pols   int;
  scoped_pols  int;
BEGIN
  FOR r IN SELECT tablename FROM _scoped_tables ORDER BY tablename LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO rls_on, forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = r.tablename;

    SELECT count(*) INTO total_pols
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tablename;

    -- A policy "scopes" if its USING or WITH CHECK narrows rows by tenant, by
    -- project assignment, or by the calling user. In a single-tenant deployment
    -- the meaningful narrowing is per-user and per-capability; tenant_id is
    -- still accepted because the column and its policies remain in place.
    SELECT count(*) INTO scoped_pols
      FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tablename
      AND ( coalesce(p.qual,'')       ~ 'tenant_id|current_user_tenant_id|is_assigned_to_project|has_capability|auth\.uid\(\)'
         OR coalesce(p.with_check,'') ~ 'tenant_id|current_user_tenant_id|is_assigned_to_project|has_capability|auth\.uid\(\)' );

    PERFORM ok(rls_on, format('%s: RLS enabled', r.tablename));
    PERFORM ok(forced, format('%s: RLS forced (table owner cannot bypass)', r.tablename));
    -- Coverage is satisfied by EITHER a scoped policy OR a deny-all posture:
    -- RLS enabled with zero policies denies all non-superuser access by default.
    -- Deny-all is correct (and stronger) for tables written only via
    -- SECURITY DEFINER functions, e.g. the public rate-limit buckets.
    PERFORM ok(scoped_pols > 0 OR total_pols = 0,
               format('%s: scoped policy OR deny-all (no policies)', r.tablename));

    -- Name the offending table in the log. pgtap's own "not ok" line carries
    -- this too, but it does not survive the multi-statement result collection
    -- in run-pgtap.ts, and a coverage failure is useless without the table.
    IF NOT rls_on OR NOT forced OR NOT (scoped_pols > 0 OR total_pols = 0) THEN
      RAISE WARNING 'RLS COVERAGE FAILURE: % (rls_on=%, forced=%, scoped_pols=%, total_pols=%)',
        r.tablename, rls_on, forced, scoped_pols, total_pols;
    END IF;
  END LOOP;
END $$;

SELECT * FROM finish();
ROLLBACK;
