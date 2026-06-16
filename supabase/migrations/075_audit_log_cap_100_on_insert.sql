-- 075: Hard-cap audit_log at 100 rows per tenant, enforced ON INSERT.
--
-- Supersedes the 500-row daily-cron cap from migration 072. Two changes:
--   1) Cap lowered 500 -> 100.
--   2) Enforcement moves from a daily cron job to an AFTER INSERT trigger, so any new
--      audit row immediately evicts the oldest beyond the newest 100 (per tenant).
--
-- Safety vs the hash chain: audit_log is append-only and hash-chained. The chain is
-- validated FORWARD — audit_trigger() derives each new row's prev_hash from the newest
-- surviving row (ORDER BY occurred_at DESC LIMIT 1). Pruning the OLDEST rows never breaks
-- forward validation, so an insert-time prune is safe (same reasoning as migration 072).
--
-- No recursion: audit_trigger() is attached to OTHER tables, not to audit_log itself,
-- so deletes performed here are not themselves audited.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT; no explicit transaction here.

-- (1) Retire the daily cron cap (migration 072 / slot from 062). Safe if absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-log-retention') THEN
    PERFORM cron.unschedule('audit-log-retention');
  END IF;
END $$;

-- (2) Prune function, now capped at 100 per tenant. Keep prune_audit_log_to_cap name so
--     any remaining references stay valid; it is also reusable for ad-hoc pruning.
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
    WHERE ranked.rn > 100
  );
$$;

-- (3) AFTER INSERT statement-level trigger that enforces the cap on every write.
--     Statement-level (not row-level) so bulk inserts prune once, not per row.
CREATE OR REPLACE FUNCTION enforce_audit_log_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM prune_audit_log_to_cap();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_cap ON audit_log;
CREATE TRIGGER trg_audit_log_cap
  AFTER INSERT ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION enforce_audit_log_cap();
