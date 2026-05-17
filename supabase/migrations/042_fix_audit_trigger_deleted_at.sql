-- Fix audit_trigger() crashing on tables without a deleted_at column.
-- Replace direct field access (NEW.deleted_at) with jsonb lookup so the
-- function works on every audited table regardless of schema.

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
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
    v_action    := 'insert';
    v_after     := to_jsonb(NEW);
    v_tenant_id := NEW.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_action := CASE
      WHEN (v_after->>'deleted_at') IS NOT NULL
       AND (v_before->>'deleted_at') IS NULL
      THEN 'soft_delete'
      ELSE 'update'
    END;
    v_tenant_id := NEW.tenant_id;

  ELSIF TG_OP = 'DELETE' THEN
    v_action    := 'delete';
    v_before    := to_jsonb(OLD);
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
