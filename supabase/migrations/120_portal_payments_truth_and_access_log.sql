-- 120 · Portal payment truth + portal access tracking
--
-- Two changes, both about the customer portal.
--
-- ── 1. The portal was reporting the wrong "received" figure ──────────────────
--
-- The app (v_payment_status, 114) computes received as SUM(payment_records.
-- amount_paid) — actual money booked against a milestone. The portal RPC (106)
-- shipped only `is_paid` per milestone, so the page summed `amount_due` of
-- milestones flagged paid. Those two agree only when every payment lands
-- exactly on its scheduled amount.
--
-- Live example that surfaced this: a customer whose "Advance" milestone is
-- due 147,264 and flagged paid, against payment_records totalling 248,464
-- (an advance larger than the first milestone). App showed ~2.5L received,
-- portal showed ~1.5L — the schedule amount, not the money.
--
-- payment_records is the source of truth for money received; payment_schedule
-- holds what was billed. The RPC now sends amount_received per milestone so the
-- portal can total the same quantity the app does. amount_due and is_paid are
-- kept: the portal shows billed vs received per milestone, and is_paid remains
-- the studio's explicit settled flag (a milestone can be marked paid via
-- waiver/adjustment with no record, and that must not read as unpaid).

-- ── 2. Who is opening the portal link, and how often ─────────────────────────
--
-- Previously a successful portal open left no trace at all: public_abuse_log
-- recorded only the failures (bad hash, unknown hash, rate limited). So a
-- studio could not tell whether a client had ever opened the link they sent.
--
-- One row per successful page load. The portal is a hashed URL with no login,
-- so there is no identity to record — this answers "was this link opened, how
-- many times, when, and from how many distinct devices", not "which human".
-- Naming it customer_portal_views rather than anything implying a known person
-- is deliberate; the UI must not overclaim.
--
-- Anyone holding the link can view (that is the design), so a view is not a
-- security event and does not belong in public_abuse_log or audit_log
-- (append-only, invariant #3).

CREATE TABLE IF NOT EXISTS customer_portal_views (
  id          bigserial   PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  customer_id uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ip          inet,
  user_agent  text,
  request_id  text,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE customer_portal_views IS
  'One row per successful customer-portal page load. The portal has no login, so this records the fact and origin of an open, never a verified identity. Failed opens stay in public_abuse_log.';

COMMENT ON COLUMN customer_portal_views.ip IS
  'Best-effort, from x-forwarded-for. Mobile networks and shared offices make this a weak device proxy — used to count distinct origins, never to identify a person.';

CREATE INDEX IF NOT EXISTS idx_portal_views_customer
  ON customer_portal_views (customer_id, viewed_at DESC);

-- Both are required: ENABLE alone leaves the table readable by the table owner
-- and by any SECURITY DEFINER function that does not reset role; FORCE is what
-- makes the policies apply universally.
ALTER TABLE customer_portal_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_views FORCE  ROW LEVEL SECURITY;

-- Read-only to staff, and only within their own tenant. There is deliberately
-- no INSERT policy: the sole writer is the SECURITY DEFINER RPC below.
DROP POLICY IF EXISTS customer_portal_views_select ON customer_portal_views;
CREATE POLICY customer_portal_views_select ON customer_portal_views FOR SELECT USING (
  tenant_id = current_user_tenant_id()
);

-- Supabase no longer auto-exposes new public tables to the Data API (999_zz).
-- SELECT only for authenticated (RLS above gates the rows); anon gets nothing —
-- the portal writes through the RPC, never the table.
GRANT SELECT ON customer_portal_views TO authenticated;
GRANT ALL    ON customer_portal_views TO service_role;
REVOKE ALL   ON customer_portal_views FROM anon;

-- Aggregate for the studio-side card: total opens, distinct origins, first and
-- last. SECURITY INVOKER (the default) so the RLS policy above still applies.
CREATE OR REPLACE VIEW v_customer_portal_access AS
SELECT
  customer_id,
  tenant_id,
  COUNT(*)                       AS view_count,
  COUNT(DISTINCT ip)             AS distinct_ips,
  MIN(viewed_at)                 AS first_viewed_at,
  MAX(viewed_at)                 AS last_viewed_at
FROM customer_portal_views
GROUP BY customer_id, tenant_id;

GRANT SELECT ON v_customer_portal_access TO authenticated;
GRANT SELECT ON v_customer_portal_access TO service_role;

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
  INSERT INTO customer_portal_views (tenant_id, customer_id, ip, user_agent, request_id)
    VALUES (v_customer.tenant_id, v_customer.id, p_ip, p_user_agent, p_request_id);

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
            'part',            vps.part
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

REVOKE ALL   ON FUNCTION get_customer_portal_summary(text, inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_customer_portal_summary(text, inet, text, text) TO anon;
