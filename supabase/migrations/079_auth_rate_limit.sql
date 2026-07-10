-- Auth rate limiting for login + invite.
-- Reuses the public_rate_limit_hit() + public_abuse_log primitives from
-- 025_phase4_public.sql (already used by the public enquiry form + customer
-- portal). The portal was covered; login/invite were not.
--
-- check_auth_rate_limit() is a thin SECURITY DEFINER wrapper so it can be
-- called by anon (login happens pre-auth) and authenticated (invite) without
-- granting direct access to public_rate_limit_hit / public_abuse_log.
-- Returns TRUE when the caller is WITHIN the limit, FALSE when throttled.

CREATE OR REPLACE FUNCTION check_auth_rate_limit(
  p_kind            text,
  p_identifier      text,
  p_limit           int,
  p_window_seconds  int,
  p_ip              inet    DEFAULT NULL,
  p_user_agent      text    DEFAULT NULL,
  p_request_id      text    DEFAULT NULL
) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_identifier IS NULL OR length(p_identifier) = 0 THEN
    -- No identifier to throttle on (e.g. IP unavailable) — fail open.
    RETURN true;
  END IF;

  v_count := public_rate_limit_hit(NULL, p_kind, p_identifier, p_window_seconds);

  IF v_count > p_limit THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES (p_kind || '_rate_limited',
              jsonb_build_object('identifier', p_identifier, 'count', v_count),
              p_ip, p_user_agent, p_request_id);
    RETURN false;
  END IF;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION check_auth_rate_limit(text, text, int, int, inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_auth_rate_limit(text, text, int, int, inet, text, text) TO anon, authenticated;
