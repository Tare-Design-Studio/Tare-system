-- Phase 0 · Audit log (append-only, hash-chained)

CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  actor_id      uuid,
  action        text NOT NULL CHECK (
    action IN (
      'insert',
      'update',
      'delete',
      'soft_delete',
      'hard_purge',
      'session_revoke'
    )
  ),
  resource_type text NOT NULL,
  resource_id   uuid,
  before        jsonb,
  after         jsonb,
  ip_address    inet,
  user_agent    text,
  request_id    text,
  prev_hash     text NOT NULL,
  row_hash      text NOT NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant_time
  ON audit_log(tenant_id, occurred_at DESC);

CREATE INDEX idx_audit_resource
  ON audit_log(resource_type, resource_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "owners can read audit_log"
  ON audit_log
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id
      FROM users
      WHERE id = auth.uid()
      AND deleted_at IS NULL
    )
    AND has_capability('audit_log:view')
  );

CREATE POLICY "audit_trigger insert only"
  ON audit_log
  FOR INSERT
  WITH CHECK (
    current_setting('app.audit_inserting', true) = 'true'
  );

-- =========================================================
-- Create audit_writer role if it doesn't exist
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'audit_writer'
  ) THEN
  END IF;
END
$$;

GRANT INSERT ON audit_log TO postgres;

-- =========================================================
-- Audit export log
-- =========================================================

CREATE TABLE audit_export_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  exported_at     timestamptz NOT NULL DEFAULT now(),
  range_start     timestamptz NOT NULL,
  range_end       timestamptz NOT NULL,
  row_count       int NOT NULL,
  first_row_hash  text NOT NULL,
  last_row_hash   text NOT NULL,
  export_sha256   text NOT NULL,
  drive_file_id   text,
  exported_by     uuid,
  notes           text
);

CREATE INDEX idx_audit_export_tenant
  ON audit_export_log(tenant_id, exported_at DESC);

ALTER TABLE audit_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read audit_export_log"
  ON audit_export_log
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id
      FROM users
      WHERE id = auth.uid()
      AND deleted_at IS NULL
    )
    AND has_capability('audit_log:export')
  );

-- =========================================================
-- audit_trigger function
-- =========================================================

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_actor_id   uuid;
  v_action     text;
  v_before     jsonb;
  v_after      jsonb;
  v_prev_hash  text;
  v_canonical  text;
  v_row_hash   text;
  v_request_id text;
  v_ip         inet;
  v_ua         text;
BEGIN
  PERFORM set_config('app.audit_inserting', 'true', true);

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_after := to_jsonb(NEW);
    v_tenant_id := NEW.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN NEW.deleted_at IS NOT NULL
       AND OLD.deleted_at IS NULL
      THEN 'soft_delete'
      ELSE 'update'
    END;

    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_tenant_id := NEW.tenant_id;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_before := to_jsonb(OLD);
    v_tenant_id := OLD.tenant_id;
  END IF;

  v_actor_id := auth.uid();

  v_request_id :=
    current_setting('request.headers', true)::jsonb
    ->> 'x-request-id';

  v_ua :=
    current_setting('request.headers', true)::jsonb
    ->> 'user-agent';

  BEGIN
    v_ip :=
      (
        current_setting('request.headers', true)::jsonb
        ->> 'x-real-ip'
      )::inet;
  EXCEPTION
    WHEN OTHERS THEN
      v_ip := NULL;
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('audit:' || v_tenant_id::text, 0)
  );

  SELECT COALESCE(
    (
      SELECT row_hash
      FROM audit_log
      WHERE tenant_id = v_tenant_id
      ORDER BY occurred_at DESC
      LIMIT 1
    ),
    (
      SELECT last_row_hash
      FROM audit_export_log
      WHERE tenant_id = v_tenant_id
      ORDER BY exported_at DESC
      LIMIT 1
    ),
    repeat('0', 64)
  )
  INTO v_prev_hash;

  v_canonical :=
      v_prev_hash || '|'
    || TG_TABLE_NAME || '|'
    || v_action || '|'
    || COALESCE(
         CASE
           WHEN TG_OP = 'DELETE'
           THEN OLD.id::text
           ELSE NEW.id::text
         END,
         ''
       ) || '|'
    || COALESCE(v_actor_id::text, '') || '|'
    || COALESCE(v_before::text, '') || '|'
    || COALESCE(v_after::text, '');

  v_row_hash :=
    encode(digest(v_canonical, 'sha256'), 'hex');

  INSERT INTO audit_log (
    tenant_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    before,
    after,
    ip_address,
    user_agent,
    request_id,
    prev_hash,
    row_hash
  )
  VALUES (
    v_tenant_id,
    v_actor_id,
    v_action,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE'
      THEN OLD.id
      ELSE NEW.id
    END,
    v_before,
    v_after,
    v_ip,
    v_ua,
    v_request_id,
    v_prev_hash,
    v_row_hash
  );

  PERFORM set_config('app.audit_inserting', 'false', true);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

