-- ci-bootstrap.sql — the Supabase surface that a stock Postgres does not provide.
--
-- NOT a migration. Deliberately outside supabase/migrations/ so scripts/migrate.ts
-- can never pick it up and it can never run against the real Supabase project,
-- where every object below already exists and is managed by Supabase itself.
--
-- The migration chain assumes a Supabase database: it FKs to auth.users, calls
-- auth.uid() throughout its RLS policies, calls cron.schedule, and adds tables
-- to the supabase_realtime publication. A stock postgres:16 service container
-- has none of that, so the chain dies on 004 with `schema "auth" does not exist`.
-- This file recreates only what the chain and the pgtap suite actually touch.
--
-- auth.uid() MUST read request.jwt.claims exactly as Supabase's does. A shim
-- that returned NULL, or a constant, would let RLS-dependent assertions pass
-- without exercising RLS at all — a false green on the gate that guards access.

CREATE SCHEMA IF NOT EXISTS auth;

-- Roles Supabase ships with. PostgREST switches into `authenticated` per request.
DO $$ BEGIN CREATE ROLE anon          NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role  NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Minimal auth.users: public.users FKs to it (004). Only the columns the chain
-- refers to. Note the app reads email from auth.users, not public.users.
-- 069_demo_seed inserts real Supabase auth columns (instance_id, aud, role,
-- encrypted_password, ...) to create working demo logins — carry those too,
-- with the same defaults/types Supabase's auth.users uses.
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id             uuid,
  id                      uuid PRIMARY KEY,
  aud                     varchar(255),
  role                    varchar(255),
  email                   text,
  encrypted_password      varchar(255),
  email_confirmed_at      timestamptz,
  raw_app_meta_data       jsonb,
  raw_user_meta_data      jsonb,
  created_at              timestamptz,
  updated_at              timestamptz,
  confirmation_token      varchar(255),
  recovery_token          varchar(255),
  email_change            varchar(255),
  email_change_token_new  varchar(255)
);

-- Mirrors Supabase's implementation: the subject claim of the request JWT, NULL
-- when unset (an unauthenticated request). STABLE, not IMMUTABLE — it varies
-- with the GUC within a transaction.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> 'sub',
    ''
  )::uuid;
$$;

-- 069_demo_seed also inserts a matching auth.identities row per demo user
-- (GoTrue requires one for email/password sign-in).
CREATE TABLE IF NOT EXISTS auth.identities (
  id              uuid PRIMARY KEY,
  user_id         uuid REFERENCES auth.users (id),
  provider_id     text,
  provider        text,
  identity_data   jsonb,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz
);

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO anon, authenticated, service_role;
GRANT SELECT ON auth.identities TO anon, authenticated, service_role;

-- ── pg_cron ────────────────────────────────────────────────────────────────
-- pg_cron IS installed on the real database (enabled via the Supabase
-- dashboard) and migrations 009/017/033/041/062/072/075/077/084/085 call
-- cron.schedule / cron.unschedule and read cron.job. The stock postgres:16
-- image has no pg_cron and it cannot be added to a service container without
-- also setting shared_preload_libraries and restarting the server.
--
-- Scheduling has no bearing on RLS coverage, so CI only needs those calls to
-- SUCCEED — the jobs must NOT actually run here. These stubs record into a
-- plain cron.job table and do nothing else. Signatures match the 3-positional
-- -argument form every migration in this repo uses.
CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid    bigserial PRIMARY KEY,
  schedule text,
  command  text,
  jobname  text UNIQUE
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean
LANGUAGE sql
AS $$
  DELETE FROM cron.job WHERE jobname = job_name;
  SELECT true;
$$;

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Supabase ships this publication; migration 071 runs ALTER PUBLICATION
-- supabase_realtime ADD TABLE for ~19 content tables and reads
-- pg_publication_tables. Create it empty so those calls succeed. Nothing
-- subscribes in CI.
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
