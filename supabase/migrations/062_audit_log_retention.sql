-- Audit log retention · hard-delete rows older than 30 days
-- Runs daily at 03:30 UTC. Hash chain stays valid for surviving rows.
-- Requires pg_cron (already enabled, see migration 009).

SELECT cron.schedule(
  'audit-log-retention',
  '30 3 * * *',
  $$DELETE FROM audit_log WHERE occurred_at < (now() - interval '30 days')$$
);
