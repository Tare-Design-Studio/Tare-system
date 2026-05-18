-- Fix: submit_public_enquiry() had two bugs that broke every public enquiry:
--   1. emit_notification() was called with a signature that never existed
--      (named arg p_recipient_capability, missing p_title) -> 42883.
--   2. The phone soft-dedupe ran whenever p_phone_normalized was non-NULL,
--      but the route passes '' for missing phones. Every phone-less
--      submission shared the '' bucket, so the 2nd one tripped the dedupe.
-- This redefinition calls emit_notification() with its real signature
-- (006_phase0_notifications.sql): positional args incl. p_title; NULL
-- p_user_ids routes the notification to active owners. It also treats an
-- empty-string phone as absent.

-- Note: dropped first because p_phone_normalized / p_source gain DEFAULT NULL,
-- which CREATE OR REPLACE cannot apply to existing parameters.
DROP FUNCTION IF EXISTS submit_public_enquiry(
  text, text, text, text, text, text, text, text, inet, text, text
);

CREATE OR REPLACE FUNCTION submit_public_enquiry(
  p_intake_slug       text,
  p_name              text,
  p_phone_display     text,
  p_email             text,
  p_message           text,
  p_referrer_url      text,
  p_ip                inet,
  p_phone_normalized  text    DEFAULT NULL,
  p_source            text    DEFAULT NULL,
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

  IF NULLIF(p_phone_normalized, '') IS NOT NULL THEN
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

  INSERT INTO enquiries (
    tenant_id, name, phone, phone_normalized, email,
    source, message, created_via, referrer_url, ip_address, status
  ) VALUES (
    v_intake.tenant_id,
    p_name, p_phone_display, p_phone_normalized, p_email,
    p_source, p_message, 'public_form', p_referrer_url, p_ip, 'new'
  ) RETURNING id INTO v_id;

  -- Notify owners. emit_notification signature (006_phase0_notifications.sql):
  -- (p_tenant_id, p_kind, p_severity, p_source_type, p_title,
  --  p_body, p_source_id, p_dedupe_key, p_user_ids)
  PERFORM emit_notification(
    v_intake.tenant_id,
    'enquiry_received',
    'info'::notification_severity,
    'enquiry',
    'New enquiry from ' || p_name,
    NULLIF(p_message, ''),
    v_id,
    'enquiry:' || v_id::text,
    NULL
  );

  RETURN v_id;
END $$;

-- Re-apply grants dropped with the old function signature.
REVOKE ALL ON FUNCTION submit_public_enquiry(text,text,text,text,text,text,inet,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION submit_public_enquiry(text,text,text,text,text,text,inet,text,text,text,text) TO anon;
