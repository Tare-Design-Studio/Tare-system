-- Phase 4 · Public abuse log, rate limiter, submit_public_enquiry()
-- All public-facing SECURITY DEFINER functions live here.

-- ─────────────────────────────────────────────────────────────
-- public_abuse_log
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public_abuse_log (
  id          bigserial   PRIMARY KEY,
  tenant_id   uuid        REFERENCES tenants(id),  -- null when tenant not resolved
  kind        text        NOT NULL,
  detail      jsonb,
  ip          inet,
  user_agent  text,
  request_id  text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_public_abuse_log_recent  ON public_abuse_log(occurred_at DESC);
CREATE INDEX idx_public_abuse_log_ip      ON public_abuse_log(ip, occurred_at DESC);
CREATE INDEX idx_public_abuse_log_tenant  ON public_abuse_log(tenant_id, occurred_at DESC)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public_abuse_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_abuse_log_select ON public_abuse_log
  FOR SELECT USING (has_capability('audit_log:view'));

-- ─────────────────────────────────────────────────────────────
-- public_rate_limit_buckets
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public_rate_limit_buckets (
  id                    bigserial   PRIMARY KEY,
  tenant_id             uuid        REFERENCES tenants(id),
  kind                  text        NOT NULL,
  identifier            text        NOT NULL,
  bucket_start          timestamptz NOT NULL,
  bucket_window_seconds int         NOT NULL,
  hit_count             int         NOT NULL DEFAULT 0,
  first_hit_at          timestamptz NOT NULL DEFAULT now(),
  last_hit_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, identifier, bucket_start)
);

CREATE INDEX idx_public_rate_limit_gc ON public_rate_limit_buckets(bucket_start);

-- No direct app access; managed by SECURITY DEFINER functions only.
ALTER TABLE public_rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- public_rate_limit_hit()
-- Atomic increment-and-test per (kind, identifier, bucket).
-- Returns new hit_count. Caller compares to limit and rejects.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public_rate_limit_hit(
  p_tenant_id       uuid,
  p_kind            text,
  p_identifier      text,
  p_window_seconds  int
) RETURNS int
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bucket_start  timestamptz;
  v_lock_key      bigint;
  v_count         int;
BEGIN
  v_bucket_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  -- Per-bucket advisory lock serialises concurrent hits on the same bucket.
  v_lock_key := hashtextextended(p_kind || ':' || p_identifier || ':' || v_bucket_start::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  INSERT INTO public_rate_limit_buckets
    (tenant_id, kind, identifier, bucket_start, bucket_window_seconds, hit_count)
  VALUES
    (p_tenant_id, p_kind, p_identifier, v_bucket_start, p_window_seconds, 1)
  ON CONFLICT (kind, identifier, bucket_start) DO UPDATE
    SET hit_count   = public_rate_limit_buckets.hit_count + 1,
        last_hit_at = now()
  RETURNING hit_count INTO v_count;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public_rate_limit_hit(uuid, text, text, int) FROM PUBLIC;
-- Called only from submit_public_enquiry (SECURITY DEFINER chain); no direct grants.

-- ─────────────────────────────────────────────────────────────
-- submit_public_enquiry()
-- The single public INSERT path for enquiries.
-- Caller: /api/public/enquiry/[slug] route handler (after Zod validation,
-- honeypot check, and time-to-submit guard).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_public_enquiry(
  p_intake_slug       text,
  p_name              text,
  p_phone_normalized  text,   -- E.164, normalised in app layer
  p_phone_display     text,   -- original input for display
  p_email             text,
  p_source            text,
  p_message           text,
  p_referrer_url      text,
  p_ip                inet,
  p_user_agent        text    DEFAULT NULL,
  p_request_id        text    DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_intake  enquiry_intake%ROWTYPE;
  v_ip_hits int;
  v_ph_hits int;
  v_id      uuid;
BEGIN
  -- Input bounds (route handler also enforces via Zod).
  IF length(COALESCE(p_name, '')) = 0 OR length(p_name) > 200 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('enquiry_bad_input', '{"field":"name"}'::jsonb,
              p_ip, p_user_agent, p_request_id);
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'P0001';
  END IF;

  IF length(COALESCE(p_message, '')) > 2000 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('enquiry_bad_input', '{"field":"message"}'::jsonb,
              p_ip, p_user_agent, p_request_id);
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve intake record.
  SELECT * INTO v_intake
    FROM enquiry_intake
   WHERE intake_slug = p_intake_slug AND is_enabled = true;

  IF NOT FOUND THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('enquiry_bad_slug',
              jsonb_build_object('slug', p_intake_slug),
              p_ip, p_user_agent, p_request_id);
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'P0001';
  END IF;

  -- IP rate limit (atomic, 1-hour bucket).
  IF p_ip IS NOT NULL THEN
    v_ip_hits := public_rate_limit_hit(
      v_intake.tenant_id, 'enquiry_ip', p_ip::text, 3600
    );
    IF v_ip_hits > v_intake.ip_rate_limit_per_hour THEN
      INSERT INTO public_abuse_log (tenant_id, kind, detail, ip, user_agent, request_id)
        VALUES (v_intake.tenant_id, 'enquiry_rate_limited_ip',
                jsonb_build_object('hits', v_ip_hits),
                p_ip, p_user_agent, p_request_id);
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Phone soft-dedupe (atomic, window = phone_soft_block_hours).
  IF p_phone_normalized IS NOT NULL THEN
    v_ph_hits := public_rate_limit_hit(
      v_intake.tenant_id, 'enquiry_phone',
      p_phone_normalized,
      v_intake.phone_soft_block_hours * 3600
    );
    IF v_ph_hits > 1 THEN
      INSERT INTO public_abuse_log (tenant_id, kind, detail, ip, user_agent, request_id)
        VALUES (v_intake.tenant_id, 'enquiry_phone_dup',
                jsonb_build_object('phone_norm', p_phone_normalized, 'hits', v_ph_hits),
                p_ip, p_user_agent, p_request_id);
      RAISE EXCEPTION 'invalid_input' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert the enquiry.
  INSERT INTO enquiries (
    tenant_id, name, phone, phone_normalized, email,
    source, message, created_via, referrer_url, ip_address, status
  ) VALUES (
    v_intake.tenant_id,
    p_name, p_phone_display, p_phone_normalized, p_email,
    p_source, p_message, 'public_form', p_referrer_url, p_ip, 'new'
  ) RETURNING id INTO v_id;

  -- Emit notification to users with enquiry:view capability.
  PERFORM emit_notification(
    p_tenant_id          := v_intake.tenant_id,
    p_kind               := 'enquiry_received',
    p_severity           := 'info',
    p_source_type        := 'enquiry',
    p_source_id          := v_id,
    p_dedupe_key         := 'enquiry:' || v_id::text,
    p_recipient_capability := 'enquiry:view'
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION submit_public_enquiry(text,text,text,text,text,text,text,text,inet,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_public_enquiry(text,text,text,text,text,text,text,text,inet,text,text) TO anon;
