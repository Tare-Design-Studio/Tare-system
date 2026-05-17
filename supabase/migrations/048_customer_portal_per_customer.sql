-- Phase 10 · Customer-level portal (multi-project per customer)
-- Existing portal is per-project (projects.customer_portal_hash).
-- This adds a per-customer portal showing ALL their projects.

-- ── Customer portal columns ───────────────────────────────────────────
ALTER TABLE customers ADD COLUMN customer_portal_hash text NULL UNIQUE;
ALTER TABLE customers ADD COLUMN customer_portal_hash_generated_at timestamptz NULL;
ALTER TABLE customers ADD COLUMN customer_portal_enabled boolean DEFAULT false;

-- ── get_customer_portal_summary() ─────────────────────────────────────
-- SECURITY DEFINER. Anon-callable. Returns all projects + payment status
-- for the customer identified by hash.
CREATE OR REPLACE FUNCTION get_customer_portal_summary(
  p_hash        text,
  p_ip          inet    DEFAULT NULL,
  p_user_agent  text    DEFAULT NULL,
  p_request_id  text    DEFAULT NULL
)
RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer  customers%ROWTYPE;
  v_result    jsonb;
BEGIN
  -- Length sanity check
  IF p_hash IS NULL OR length(p_hash) <> 16 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('customer_portal_bad_hash',
              jsonb_build_object('len', COALESCE(length(p_hash), 0)),
              p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  -- Per-IP rate limit: 60 lookups per minute
  IF p_ip IS NOT NULL THEN
    IF public_rate_limit_hit(NULL, 'customer_portal_ip', p_ip::text, 60) > 60 THEN
      INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
        VALUES ('customer_portal_rate_limited', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
      RETURN NULL;
    END IF;
  END IF;

  SELECT * INTO v_customer
    FROM customers
   WHERE customer_portal_hash    = p_hash
     AND customer_portal_enabled = true;

  IF NOT FOUND THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('customer_portal_unknown_hash', '{}'::jsonb, p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'customer_name', v_customer.name,
    'projects', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',               p.id,
        'name',             p.name,
        'project_type',     p.project_type,
        'current_stage',    p.current_stage,
        'status',           p.status,
        'start_date',       p.start_date,
        'expected_end_date',p.expected_end_date,
        'checkpoints', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'name',          cp.name,
            'sequence_order',cp.sequence_order,
            'due_date',      cp.due_date,
            'started_at',    cp.started_at,
            'completed_at',  cp.completed_at,
            'status', CASE
              WHEN cp.approved_at IS NOT NULL THEN 'complete'
              WHEN cp.started_at IS NOT NULL  THEN 'in_progress'
              WHEN cp.due_date < CURRENT_DATE THEN 'overdue'
              ELSE 'pending'
            END
          ) ORDER BY cp.sequence_order), '[]'::jsonb)
          FROM v_checkpoint_progress cp
          WHERE cp.project_id = p.id
        ),
        'payments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'milestone_name', ps.milestone_name,
            'amount_due',     ps.amount_due,
            'due_date',       ps.due_date,
            'is_paid',        ps.is_paid
          ) ORDER BY ps.sequence_order), '[]'::jsonb)
          FROM payment_schedule ps
          WHERE ps.project_id = p.id AND ps.deleted_at IS NULL
        )
      ) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM projects p
      WHERE p.customer_id = v_customer.id
        AND p.deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_customer_portal_summary(text, inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text) TO anon;
