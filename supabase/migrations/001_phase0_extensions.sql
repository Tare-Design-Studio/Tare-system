-- Phase 0 · Extensions
-- Run ONCE before all other migrations.
-- pg_cron must be enabled in Supabase dashboard: Extensions > pg_cron

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- pg_cron is enabled via dashboard; referenced in migration 009
