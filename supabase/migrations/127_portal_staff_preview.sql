-- 127 — Staff preview of the customer portal.
--
-- The customer page gains "Preview client portal": an iframe of the real
-- portal page. Two changes make that work without polluting the open log:
--   1. p_preview: a preview by a same-tenant capability holder is not written
--      to customer_portal_views (re-verified here, never trusted from the URL).
--   2. EXECUTE granted to authenticated as well as anon. Before this, a
--      signed-in staff browser got permission denied and the portal 404'd.
-- Body otherwise identical to 122.

DROP FUNCTION IF EXISTS get_customer_portal_summary(text, inet, text, text, text);

CREATE OR REPLACE FUNCTION get_customer_portal_summary(
  p_hash        text,
  p_ip          inet    DEFAULT NULL,
  p_user_agent  text    DEFAULT NULL,
  p_request_id  text    DEFAULT NULL,
  p_viewer_name text    DEFAULT NULL,
  p_preview     boolean DEFAULT false
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
  IF p_hash IS NULL OR length(p_hash) <> 16 THEN
    INSERT INTO public_abuse_log (kind, detail, ip, user_agent, request_id)
      VALUES ('customer_portal_bad_hash',
              jsonb_build_object('len', COALESCE(length(p_hash), 0)),
              p_ip, p_user_agent, p_request_id);
    RETURN NULL;
  END IF;

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

  -- Successful view. Logged AFTER the hash resolves, so this table holds only
  -- real opens by someone holding a live link — failures stay in
  -- public_abuse_log and never inflate a customer's view count.
  -- Self-declared name, normalised here rather than trusted from the client:
  -- trimmed, emptied-to-NULL, and capped so the column cannot be used as free
  -- storage by anyone holding the link. Still unverified — see the column
  -- comment in 122.
  -- Staff preview (127): not an open by the client, so it is not logged. The
  -- flag alone is not trusted — anyone holding the link could pass it — so it
  -- only counts for a signed-in user of the customer's own tenant who holds
  -- images:select_for_customer (the capability that manages portal content).
  IF NOT (p_preview
          AND auth.uid() IS NOT NULL
          AND auth_tenant_id() = v_customer.tenant_id
          AND has_capability('images:select_for_customer')) THEN
    INSERT INTO customer_portal_views (tenant_id, customer_id, ip, user_agent, request_id, viewer_name)
      VALUES (v_customer.tenant_id, v_customer.id, p_ip, p_user_agent, p_request_id,
              NULLIF(left(btrim(COALESCE(p_viewer_name, '')), 80), ''));
  END IF;

  SELECT jsonb_build_object(
    'customer_name', v_customer.name,

    'updates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           cu.id,
        'body',         cu.body,
        'project_name', pr.name,
        'created_at',   cu.created_at
      ) ORDER BY cu.created_at DESC), '[]'::jsonb)
      FROM customer_updates cu
      LEFT JOIN projects pr ON pr.id = cu.project_id AND pr.deleted_at IS NULL
      WHERE cu.customer_id = v_customer.id
        AND cu.is_visible  = true
        AND cu.deleted_at  IS NULL
    ),

    'images', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           ma.id,
        'storage_path', ma.storage_path,
        'webp_path',    ma.webp_path,
        'bucket',       ma.bucket,
        'kind',         ma.kind,
        'caption',      ma.customer_caption,
        'taken_at',     ma.taken_at
      ) ORDER BY ma.customer_sort ASC NULLS LAST, ma.taken_at DESC NULLS LAST), '[]'::jsonb)
      FROM media_assets ma
      JOIN projects p2 ON p2.id = ma.project_id AND p2.deleted_at IS NULL
      WHERE p2.customer_id         = v_customer.id
        AND ma.visible_to_customer = true
        AND ma.is_clean            = true
        AND ma.kind IN ('site_image', 'drawing')
    ),

    'visits', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           sc.id,
        'visitor_name', u.full_name,
        'project_name', p3.name,
        'visited_on',   sc.checked_in_at,
        'note',         sc.customer_note
      ) ORDER BY sc.checked_in_at DESC), '[]'::jsonb)
      FROM site_check_ins sc
      JOIN projects p3 ON p3.id = sc.project_id AND p3.deleted_at IS NULL
      JOIN users    u  ON u.id  = sc.user_id
      WHERE p3.customer_id          = v_customer.id
        AND sc.visible_to_customer  = true
    ),

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
            'id',            cp.checkpoint_id,
            'name',          cp.name,
            'sequence_order',cp.sequence_order,
            'due_date',      cp.due_date,
            'started_at',    cp.started_at,
            'completed_at',  cp.completed_at,
            'total_items',     cp.total_items,
            'completed_items', cp.completed_items,
            'progress_pct',    cp.progress_pct,
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
        -- Reads v_payment_status, the same view the studio-side card reads, so
        -- the two surfaces cannot drift again. wing/part come along because the
        -- schedule is grouped by wing in the UI (114).
        'payments', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'milestone_name',  vps.milestone_name,
            'amount_due',      vps.amount_due,
            'amount_received', vps.amount_received,
            'due_date',        vps.due_date,
            'is_paid',         vps.is_paid,
            'wing',            vps.wing,
            'part',            vps.part,
            'last_paid_on',    vps.last_paid_on
          ) ORDER BY vps.sequence_order), '[]'::jsonb)
          FROM v_payment_status vps
          WHERE vps.project_id = p.id
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

REVOKE ALL   ON FUNCTION get_customer_portal_summary(text, inet, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text, text, boolean) TO authenticated;
