-- Phase 0 · pg_cron jobs
-- Requires pg_cron enabled in Supabase dashboard: Extensions > pg_cron
-- These jobs are registered here; the actual worker functions are added in later phases.

-- Keep-alive: prevent Supabase free-tier project pause (runs daily at 03:00 UTC)
SELECT cron.schedule(
  'architect-os-keepalive',
  '0 3 * * *',
  $$UPDATE tenants SET updated_at = now() WHERE id = (SELECT id FROM tenants LIMIT 1)$$
);

-- Stale rate-limit buckets cleanup (registered in Phase 4 when the table exists)
-- Notification compaction (registered in Phase 7 when notification volume warrants)
-- Audit log monthly archive (registered in Phase 8)
