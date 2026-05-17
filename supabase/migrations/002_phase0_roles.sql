-- Phase 0 · Custom Postgres roles
-- audit_writer   → only role that can INSERT into audit_log (via SECURITY DEFINER trigger)
-- notification_writer → only role that can call emit_notification()
-- public_writer  → owns public-facing SECURITY DEFINER functions

DO $$ BEGIN CREATE ROLE audit_writer       NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE notification_writer NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE public_writer       NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
