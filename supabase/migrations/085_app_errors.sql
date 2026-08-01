-- 085: Application error log (Layer 6 monitoring).
--
-- Lightweight, self-hosted error capture so we can operate without flying blind
-- (no Sentry). Server code calls logError() (lib/log/logError.ts), which writes
-- here via the service-role client. Reads are owner-only and tenant-scoped via
-- the `audit_log:view` capability (defined in 065_tag_capability_sync.sql).
--
-- tenant_id is NULLABLE: some errors happen before a tenant is resolved (auth
-- callback, public enquiry, proxy). Those rows are visible to any audit viewer.
--
-- Writes: service-role client only — RLS-enabled + no write policy = deny-all
-- for authenticated.
--
-- NOTE: scripts/migrate.ts wraps each file in BEGIN/COMMIT.

CREATE TABLE app_errors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id),
  user_id      uuid,
  level        text NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'fatal')),
  source       text NOT NULL,                       -- e.g. 'api/expenses', 'proxy', 'drive-sync'
  message      text NOT NULL,
  detail       jsonb,                                -- stack, request meta, arbitrary context
  request_id   text,
  path         text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_errors_recent       ON app_errors(occurred_at DESC);
CREATE INDEX idx_app_errors_tenant_time  ON app_errors(tenant_id, occurred_at DESC);
CREATE INDEX idx_app_errors_source       ON app_errors(source, occurred_at DESC);

ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_errors FORCE ROW LEVEL SECURITY;

-- Owner-only, tenant-scoped read; unattributed (NULL tenant) errors stay visible.
CREATE POLICY app_errors_select ON app_errors FOR SELECT
  USING (
    has_capability('audit_log:view')
    AND (tenant_id = current_user_tenant_id() OR tenant_id IS NULL)
  );
-- No INSERT/UPDATE/DELETE policy: writes go through the service-role client only.

-- Retention: hard-delete rows older than 30 days (daily), matching audit_log policy (062).
SELECT cron.schedule(
  'app-errors-retention',
  '20 4 * * *',
  $$DELETE FROM app_errors WHERE occurred_at < now() - interval '30 days'$$
);

-- Never expose to anonymous Data API callers (see 999_zz_explicit_data_api_grants.sql).
REVOKE ALL ON TABLE app_errors FROM anon;
-- Service role manages the table fully; authenticated gets SELECT (RLS still applies).
GRANT SELECT ON TABLE app_errors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_errors TO service_role;
