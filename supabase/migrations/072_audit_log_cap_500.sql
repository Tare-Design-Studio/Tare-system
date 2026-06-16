-- 072: Cap audit_log at 500 rows per tenant (replaces the 30-day time retention).
--
-- The audit_log is an append-only, hash-chained ledger. Pruning the oldest rows
-- keeps the FORWARD chain valid — the audit_trigger derives each new row's
-- prev_hash from the newest surviving row (ORDER BY occurred_at DESC LIMIT 1),
-- so inserts after a prune still chain correctly. Pruned rows are gone for good
-- (no export), per the chosen retention policy: newest 500 per tenant only.
--
-- A scheduled job (not cap-on-write) does the pruning so audited writes stay off
-- the delete path. We reuse the existing 'audit-log-retention' cron slot from
-- migration 062, swapping its 30-day rule for the 500-row cap.

BEGIN;

CREATE OR REPLACE FUNCTION prune_audit_log_to_cap()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM audit_log
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY tenant_id
               ORDER BY occurred_at DESC, id DESC
             ) AS rn
      FROM audit_log
    ) ranked
    WHERE ranked.rn > 500
  );
$$;

-- Replace the time-based retention job with the row-count cap.
-- Unschedule only if the job exists (migration stays safe on a fresh DB).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-log-retention') THEN
    PERFORM cron.unschedule('audit-log-retention');
  END IF;
END $$;

SELECT cron.schedule(
  'audit-log-retention',
  '30 3 * * *',
  $$SELECT prune_audit_log_to_cap()$$
);

COMMIT;
