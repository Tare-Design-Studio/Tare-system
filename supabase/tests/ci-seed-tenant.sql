-- ci-seed-tenant.sql — the founding tenant + owner, for CI only.
--
-- NOT a migration. Migration 014 (Phase 1 preset seed) resolves the tenant by
-- an exact slug and aborts with
--   'Tenant tare-design-studio not found — run Phase 0 seed first'
-- when it is absent. In production that row is created out-of-band by
-- scripts/setup-owner.ts via the Supabase Admin API — supabase/seed/001_seed.sql
-- only records that it happened. CI has no such step, so the chain stops at 014
-- until this file runs.
--
-- The slug is therefore load-bearing and must stay 'tare-design-studio'. This
-- is single-tenant: exactly one tenant row, which is also what the deployment
-- looks like in production.
--
-- Idempotent: the workflow runs migrate.ts, applies this, then runs migrate.ts
-- again (it tracks applied files in _migrations and resumes), so this may
-- execute against an already-seeded database.

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'ci-owner@example.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-0000000000f1'::uuid, 'CI Tenant', 'tare-design-studio')
ON CONFLICT (slug) DO NOTHING;

-- users.role is the app_role enum ('owner' | 'team_member' | 'site_engineer').
-- Migration 014 looks up the owner for the tenant it just resolved.
INSERT INTO users (id, tenant_id, role, full_name)
SELECT '00000000-0000-0000-0000-0000000000c1',
       (SELECT id FROM tenants WHERE slug = 'tare-design-studio'),
       'owner',
       'CI Owner'
ON CONFLICT (id) DO NOTHING;
